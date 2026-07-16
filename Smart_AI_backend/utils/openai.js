const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY không được định nghĩa trong file .env');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBEDDING_MODEL = 'gemini-embedding-001';
const TARGET_DIM = 1536;

const cleanText = (text) => {
  let cleaned = text
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > 8000) {
    console.warn(`Text quá dài (${cleaned.length} chars), sẽ truncate`);
    cleaned = cleaned.substring(0, 8000);
  }

  return cleaned;
};

const generateEmbedding = async (text) => {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input không hợp lệ');
    }

    const cleanedText = cleanText(text);

    if (cleanedText.length === 0) {
      throw new Error('Text không thể rỗng sau khi clean');
    }

    console.log(`Generating embedding cho text: "${cleanedText.substring(0, 100)}..."`);

    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [cleanedText],
      config: {
        outputDimensionality: TARGET_DIM,
      },
    });

    if (!response.embeddings || !Array.isArray(response.embeddings) || response.embeddings.length === 0) {
      throw new Error('Gemini API trả về response không hợp lệ');
    }

    const embedding = response.embeddings[0].values;

    if (!Array.isArray(embedding) || embedding.length !== TARGET_DIM) {
      throw new Error(`Embedding dimensions không đúng: ${embedding ? embedding.length : 'undefined'}, mong đợi ${TARGET_DIM}`);
    }

    console.log(`Embedding generated thành công (${embedding.length} dimensions)`);

    return embedding;
  } catch (error) {
    console.error('Lỗi khi tạo embedding:', error.message);

    if (process.env.NODE_ENV === 'development') {
      console.error('Error details:', error);
    }

    if (error.message.includes('API key')) {
      throw new Error('Gemini API key không hợp lệ hoặc đã hết hạn');
    } else if (error.message.includes('quota')) {
      throw new Error('Gemini API quota đã hết, vui lòng kiểm tra billing');
    } else if (error.message.includes('rate limit')) {
      throw new Error('Gemini API rate limit, vui lòng thử lại sau');
    } else {
      throw new Error(`Lỗi Gemini API: ${error.message}`);
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
      return cleanText(text);
    });

    console.log(`Generating embeddings cho ${cleanedTexts.length} texts`);

    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: cleanedTexts,
      config: {
        outputDimensionality: TARGET_DIM,
      },
    });

    if (!response.embeddings || response.embeddings.length !== texts.length) {
      throw new Error('Gemini API trả về số lượng embeddings không đúng');
    }

    const embeddings = response.embeddings.map((e) => {
      if (!e || !e.values || e.values.length !== TARGET_DIM) {
        throw new Error('Embedding không hợp lệ trong batch response');
      }
      return e.values;
    });

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
    console.error('Lỗi khi tính similarity:', error.message);
    throw error;
  }
};

const testOpenAIConnection = async () => {
  try {
    console.log('Testing Gemini API connection...');

    const testEmbedding = await generateEmbedding('test connection');

    if (testEmbedding && testEmbedding.length === TARGET_DIM) {
      console.log('Gemini API connection thành công');
      return true;
    } else {
      throw new Error('Test embedding không hợp lệ');
    }
  } catch (error) {
    console.error('Gemini API connection failed:', error.message);
    return false;
  }
};

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  calculateSimilarity,
  testOpenAIConnection,
};
