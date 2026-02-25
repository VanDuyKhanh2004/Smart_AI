const OpenAI = require('openai');
require('dotenv').config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY không được định nghĩa trong file .env');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const generateEmbedding = async (text) => {
  try {
    
    if (!text || typeof text !== 'string') {
      throw new Error('Text input không hợp lệ');
    }

    const cleanedText = text
      .replace(/\n/g, ' ')           // Thay newlines bằng spaces
      .replace(/\r/g, ' ')           // Thay carriage returns
      .replace(/\t/g, ' ')           // Thay tabs
      .replace(/\s+/g, ' ')          // Gộp multiple spaces thành 1
      .trim();                       // Trim whitespace

    if (cleanedText.length === 0) {
      throw new Error('Text không thể rỗng sau khi clean');
    }

    if (cleanedText.length > 8000) {
      console.warn(`Text quá dài (${cleanedText.length} chars), sẽ truncate`);
      cleanedText = cleanedText.substring(0, 8000);
    }

    console.log(`Generating embedding cho text: "${cleanedText.substring(0, 100)}..."`);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: cleanedText,
      encoding_format: "float",
    });

    
    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('OpenAI API trả về response không hợp lệ');
    }

    const embedding = response.data[0].embedding;

    
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Embedding dimensions không đúng: ${embedding.length}, mong đợi 1536`);
    }

    console.log(`Embedding generated thành công (${embedding.length} dimensions)`);
    
    return embedding;

  } catch (error) {
    console.error('Lỗi khi tạo embedding:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Error details:', error);
    }

    
    if (error.message.includes('API key')) {
      throw new Error('OpenAI API key không hợp lệ hoặc đã hết hạn');
    } else if (error.message.includes('quota')) {
      throw new Error('OpenAI API quota đã hết, vui lòng kiểm tra billing');
    } else if (error.message.includes('rate limit')) {
      throw new Error('OpenAI API rate limit, vui lòng thử lại sau');
    } else {
      throw new Error(`Lỗi OpenAI API: ${error.message}`);
    }
  }
};


const generateEmbeddingsBatch = async (texts) => {
  try {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts phải là array không rỗng');
    }

    const cleanedTexts = texts.map((text, index) => {
      if (!text || typeof text !== 'string') {
        throw new Error(`Text tại index ${index} không hợp lệ`);
      }
      
      return text
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    });

    console.log(`Generating embeddings cho ${cleanedTexts.length} texts`);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: cleanedTexts,
      encoding_format: "float",
    });

    if (!response.data || response.data.length !== texts.length) {
      throw new Error('OpenAI API trả về số lượng embeddings không đúng');
    }

    const embeddings = response.data.map(item => item.embedding);

    console.log(`Batch embeddings generated thành công (${embeddings.length} items)`);
    
    return embeddings;

  } catch (error) {
    console.error('Lỗi khi tạo batch embeddings:', error.message);
    throw error;
  }
};


const calculateSimilarity = (vectorA, vectorB) => {
  try {
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      throw new Error('Vectors phải là arrays');
    }

    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors phải có cùng dimensions');
    }

    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    
    return similarity;

  } catch (error) {
    console.error('❌ Lỗi khi tính similarity:', error.message);
    throw error;
  }
};


const testOpenAIConnection = async () => {
  try {
    console.log('Testing OpenAI API connection...');
    
    const testEmbedding = await generateEmbedding('test connection');
    
    if (testEmbedding && testEmbedding.length === 1536) {
      console.log('OpenAI API connection thành công');
      return true;
    } else {
      throw new Error('Test embedding không hợp lệ');
    }

  } catch (error) {
    console.error('OpenAI API connection failed:', error.message);
    return false;
  }
};

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  calculateSimilarity,
  testOpenAIConnection
};
