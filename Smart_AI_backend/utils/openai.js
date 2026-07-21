const logger = require('./logger');
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
    logger.warn({ textLength: cleaned.length }, 'Text too long, truncating');
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

    logger.info({ textLength: cleanedText.length, expectedDimensions: TARGET_DIM, model: EMBEDDING_MODEL }, 'Generating embedding');

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

    logger.info({ dimensions: embedding.length }, 'Embedding generated successfully');

    return embedding;
  } catch (error) {
    logger.error({ err: { message: error.message } }, 'Embedding generation failed');

    if (process.env.NODE_ENV === 'development') {
      logger.debug({ err: error }, 'Embedding error details');
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

    logger.info({ textCount: cleanedTexts.length, expectedDimensions: TARGET_DIM, model: EMBEDDING_MODEL }, 'Generating batch embeddings');

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

    logger.info({ itemCount: embeddings.length }, 'Batch embeddings generated successfully');

    return embeddings;
  } catch (error) {
    logger.error({ err: { message: error.message } }, 'Batch embedding generation failed');
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
    logger.error({ err: { message: error.message } }, 'Similarity calculation failed');
    throw error;
  }
};

const testOpenAIConnection = async () => {
  try {
    logger.info('Testing Gemini API connection');

    const testEmbedding = await generateEmbedding('test connection');

    if (testEmbedding && testEmbedding.length === TARGET_DIM) {
      logger.info('Gemini API connection successful');
      return true;
    } else {
      throw new Error('Test embedding không hợp lệ');
    }
  } catch (error) {
    logger.error({ err: { message: error.message } }, 'Gemini API connection failed');
    return false;
  }
};

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  calculateSimilarity,
  testOpenAIConnection,
};
