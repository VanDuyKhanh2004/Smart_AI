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

describe('generateEmbedding input validation', () => {
  it('throws on null input', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding(null)).rejects.toThrow('Text input không hợp lệ');
  });

  it('throws on empty string', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('')).rejects.toThrow('Text input không hợp lệ');
  });

  it('throws on whitespace-only input after clean', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('   \n\t  ')).rejects.toThrow('Text không thể rỗng sau khi clean');
  });
});

describe('generateEmbedding response validation', () => {
  it('throws on invalid API response (embeddings null)', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({ embeddings: null }),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('some text')).rejects.toThrow('Gemini API trả về response không hợp lệ');
  });

  it('throws on wrong embedding dimensions', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: [1, 2, 3] }],
          }),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('some text')).rejects.toThrow(/Embedding dimensions không đúng/);
  });
});

describe('generateEmbedding error classification', () => {
  it('classifies API key error to Vietnamese message', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('Invalid API key provided')),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('text')).rejects.toThrow('Gemini API key không hợp lệ hoặc đã hết hạn');
  });

  it('classifies quota error to Vietnamese message', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('quota exceeded for this project')),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('text')).rejects.toThrow('Gemini API quota đã hết, vui lòng kiểm tra billing');
  });

  it('classifies rate limit error to Vietnamese message', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('rate limit exceeded, try again later')),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('text')).rejects.toThrow('Gemini API rate limit, vui lòng thử lại sau');
  });

  it('wraps generic error with Lỗi Gemini API prefix', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('something went wrong')),
        },
      })),
    }));

    const { generateEmbedding } = require('../utils/openai');
    await expect(generateEmbedding('text')).rejects.toThrow('Lỗi Gemini API: something went wrong');
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

  it('throws on non-array input', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');
    await expect(generateEmbeddingsBatch('not an array')).rejects.toThrow('Texts phải là array không rỗng');
  });

  it('throws on empty array', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');
    await expect(generateEmbeddingsBatch([])).rejects.toThrow('Texts phải là array không rỗng');
  });

  it('throws on invalid element in array', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: { embedContent: jest.fn() },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');
    await expect(generateEmbeddingsBatch([null])).rejects.toThrow('Text tại index 0 không hợp lệ');
  });

  it('throws on response count mismatch', async () => {
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
    await expect(generateEmbeddingsBatch(['text1', 'text2'])).rejects.toThrow('Gemini API trả về số lượng embeddings không đúng');
  });

  it('throws on invalid embedding dimensions in batch', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: [1, 2, 3] }],
          }),
        },
      })),
    }));

    const { generateEmbeddingsBatch } = require('../utils/openai');
    await expect(generateEmbeddingsBatch(['text'])).rejects.toThrow('Embedding không hợp lệ trong batch response');
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

  it('returns approximately 1.0 for identical vectors', () => {
    const { calculateSimilarity } = require('../utils/openai');
    const result = calculateSimilarity([1, 1], [1, 1]);
    expect(result).toBeCloseTo(1.0, 10);
  });

  it('throws on non-array input', () => {
    const { calculateSimilarity } = require('../utils/openai');
    expect(() => calculateSimilarity('not an array', [1, 2])).toThrow('Vectors phải là arrays');
  });

  it('throws on dimension mismatch', () => {
    const { calculateSimilarity } = require('../utils/openai');
    expect(() => calculateSimilarity([1, 2], [1, 2, 3])).toThrow('Vectors phải có cùng dimensions');
  });
});

describe('testOpenAIConnection', () => {
  it('returns true on valid embedding', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      })),
    }));

    const { testOpenAIConnection } = require('../utils/openai');
    const result = await testOpenAIConnection();
    expect(result).toBe(true);
  });

  it('returns false on API failure', async () => {
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockRejectedValue(new Error('connection refused')),
        },
      })),
    }));

    const { testOpenAIConnection } = require('../utils/openai');
    const result = await testOpenAIConnection();
    expect(result).toBe(false);
  });
});

describe('client timeout configuration', () => {
  it('constructs the GoogleGenAI client with an explicit HTTP timeout', async () => {
    delete process.env.LLM_TIMEOUT_MS;
    let GoogleGenAI;
    jest.doMock('@google/genai', () => {
      GoogleGenAI = jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      }));
      return { GoogleGenAI };
    });

    const { generateEmbedding } = require('../utils/openai');
    await generateEmbedding('some text');

    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI.mock.calls[0][0]).toMatchObject({
      apiKey: 'test-gemini-key',
      httpOptions: { timeout: 90000 },
    });
  });

  it('honors the LLM_TIMEOUT_MS environment override', async () => {
    process.env.LLM_TIMEOUT_MS = '45000';
    let GoogleGenAI;
    jest.doMock('@google/genai', () => {
      GoogleGenAI = jest.fn(() => ({
        models: {
          embedContent: jest.fn().mockResolvedValue({
            embeddings: [{ values: new Array(1536).fill(0.1) }],
          }),
        },
      }));
      return { GoogleGenAI };
    });

    const { generateEmbedding } = require('../utils/openai');
    await generateEmbedding('some text');

    expect(GoogleGenAI.mock.calls[0][0].httpOptions.timeout).toBe(45000);
    delete process.env.LLM_TIMEOUT_MS;
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
