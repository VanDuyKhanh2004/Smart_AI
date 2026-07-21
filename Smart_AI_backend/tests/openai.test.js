jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

let logger;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  logger = require('../utils/logger');
});

describe('generateEmbedding', () => {
  it('logs safe metadata only, never canonical text or vector', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    const inputText = 'Samsung Galaxy S25 Ultra 512GB with 12GB RAM and 200MP camera';

    await generateEmbedding(inputText);

    const infoCalls = logger.info.mock.calls;
    expect(infoCalls.length).toBeGreaterThan(0);

    const genCall = infoCalls.find(c => c[1] === 'Generating embedding');
    expect(genCall).toBeDefined();
    expect(genCall[0]).toHaveProperty('textLength');
    expect(genCall[0]).toHaveProperty('expectedDimensions', 1536);
    expect(genCall[0]).toHaveProperty('model', 'gemini-embedding-001');
    expect(genCall[0]).not.toHaveProperty('text');
    expect(genCall[0]).not.toHaveProperty('canonicalText');
    expect(genCall[0]).not.toHaveProperty('vector');
    expect(genCall[0]).not.toHaveProperty('embedding_vector');
    expect(typeof genCall[0].textLength).toBe('number');

    const successCall = infoCalls.find(c => c[1] === 'Embedding generated successfully');
    expect(successCall).toBeDefined();
    expect(successCall[0]).toHaveProperty('dimensions', 1536);
    expect(successCall[0]).not.toHaveProperty('vector');
    expect(successCall[0]).not.toHaveProperty('embedding_vector');
    expect(successCall[0]).not.toHaveProperty('values');
  });

  it('does not use console.log or console.error', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');

    await generateEmbedding('some text');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs error with logger.error on failure', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('API quota exceeded')),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');

    await expect(generateEmbedding('some text')).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'API quota exceeded' }) }),
      'Embedding generation failed',
    );
  });
});

describe('generateEmbeddingsBatch', () => {
  it('logs safe metadata only', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [
              { values: new Array(1536).fill(0.1) },
              { values: new Array(1536).fill(0.2) },
            ],
          }),
        },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');

    await generateEmbeddingsBatch(['text one', 'text two']);

    const infoCalls = logger.info.mock.calls;
    const genCall = infoCalls.find(c => c[1] === 'Generating batch embeddings');
    expect(genCall).toBeDefined();
    expect(genCall[0]).toHaveProperty('textCount', 2);
    expect(genCall[0]).toHaveProperty('expectedDimensions', 1536);
    expect(genCall[0]).toHaveProperty('model', 'gemini-embedding-001');
    expect(genCall[0]).not.toHaveProperty('texts');
    expect(genCall[0]).not.toHaveProperty('text');

    const successCall = infoCalls.find(c => c[1] === 'Batch embeddings generated successfully');
    expect(successCall).toBeDefined();
    expect(successCall[0]).toHaveProperty('itemCount', 2);
    expect(successCall[0]).not.toHaveProperty('vectors');
  });

  it('does not use console.log or console.error on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');

    await generateEmbeddingsBatch(['text']);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs error with logger.error on failure', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('Invalid request')),
        },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');

    await expect(generateEmbeddingsBatch(['text'])).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'Invalid request' }) }),
      'Batch embedding generation failed',
    );
  });
});

describe('calculateSimilarity', () => {
  it('does not use console.log or console.error on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { calculateSimilarity } = require('../utils/openai');

    const vecA = new Array(1536).fill(0.1);
    const vecB = new Array(1536).fill(0.2);

    calculateSimilarity(vecA, vecB);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('cleanText warning', () => {
  it('logs truncation warning with logger.warn for long text', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');

    const longText = 'A'.repeat(9000);
    await generateEmbedding(longText);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ textLength: expect.any(Number) }),
      'Text too long, truncating',
    );
  });
});
