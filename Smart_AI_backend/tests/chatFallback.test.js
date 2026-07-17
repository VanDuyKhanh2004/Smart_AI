const mockGenerateContent = jest.fn();

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

jest.mock('openai', () => {
  const mockCreate = jest.fn();
  const mockOpenAI = jest.fn(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  mockOpenAI.mockCreate = mockCreate;
  return mockOpenAI;
});

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

const OpenAI = require('openai');
const { generateChatResponse } = require('../utils/gemini');

const mockProducts = [
  {
    _id: 'p1',
    name: 'iPhone 16 Pro',
    brand: 'apple',
    price: 29990000,
    description: 'Flagship smartphone with advanced camera',
    inStock: 10,
  },
  {
    _id: 'p2',
    name: 'Galaxy S24 Ultra',
    brand: 'samsung',
    price: 27990000,
    description: 'Premium Android phone with S Pen',
    inStock: 5,
  },
];

const mockHistory = [
  { role: 'user', content: 'Tôi muốn mua điện thoại' },
  { role: 'assistant', content: 'Dạ, bạn muốn tìm loại điện thoại nào ạ?' },
];

describe('generateChatResponse() — provider fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI success', () => {
    it('returns text with provider OpenAI when OpenAI succeeds', async () => {
      OpenAI.mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Tôi gợi ý iPhone 16 Pro cho bạn!' } }],
      });

      const result = await generateChatResponse(mockHistory, 'Gợi ý điện thoại', mockProducts);

      expect(result.text).toBe('Tôi gợi ý iPhone 16 Pro cho bạn!');
      expect(result.provider).toBe('OpenAI');
    });
  });

  describe('OpenAI quota failure → Gemini fallback', () => {
    it('falls back to Gemini when OpenAI returns 429 quota error', async () => {
      const quotaError = new Error('insufficient_quota');
      quotaError.status = 429;
      quotaError.type = 'insufficient_quota';
      OpenAI.mockCreate.mockRejectedValueOnce(quotaError);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Gemini recommends Galaxy S24 Ultra!' }],
            },
          },
        ],
      });

      const result = await generateChatResponse(mockHistory, 'Gợi ý điện thoại', mockProducts);

      expect(result.text).toBe('Gemini recommends Galaxy S24 Ultra!');
      expect(result.provider).toBe('Gemini');
    });

    it('falls back to Gemini when OpenAI returns rate limit error', async () => {
      const rateLimitError = new Error('rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.type = 'rate_limit_error';
      OpenAI.mockCreate.mockRejectedValueOnce(rateLimitError);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ text: 'Gemini reply' }] } },
        ],
      });

      const result = await generateChatResponse(mockHistory, 'test', mockProducts);

      expect(result.provider).toBe('Gemini');
    });

    it('falls back to Gemini when OpenAI returns invalid API key error', async () => {
      const authError = new Error('Incorrect API key');
      authError.status = 401;
      OpenAI.mockCreate.mockRejectedValueOnce(authError);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ text: 'Gemini reply' }] } },
        ],
      });

      const result = await generateChatResponse(mockHistory, 'test', mockProducts);

      expect(result.provider).toBe('Gemini');
    });

    it('falls back to Gemini when OpenAI times out', async () => {
      const timeoutError = new Error('ETIMEDOUT');
      timeoutError.code = 'ETIMEDOUT';
      OpenAI.mockCreate.mockRejectedValueOnce(timeoutError);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ text: 'Gemini reply' }] } },
        ],
      });

      const result = await generateChatResponse(mockHistory, 'test', mockProducts);

      expect(result.provider).toBe('Gemini');
    });

    it('falls back to Gemini when OpenAI has network error', async () => {
      const networkError = new Error('ECONNREFUSED');
      networkError.code = 'ECONNREFUSED';
      OpenAI.mockCreate.mockRejectedValueOnce(networkError);

      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          { content: { parts: [{ text: 'Gemini reply' }] } },
        ],
      });

      const result = await generateChatResponse(mockHistory, 'test', mockProducts);

      expect(result.provider).toBe('Gemini');
    });
  });

  describe('Both providers fail → deterministic fallback', () => {
    it('returns deterministic response when OpenAI and Gemini both fail', async () => {
      const quotaError = new Error('insufficient_quota');
      quotaError.status = 429;
      OpenAI.mockCreate.mockRejectedValueOnce(quotaError);

      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await generateChatResponse(mockHistory, 'Gợi ý điện thoại chụp ảnh đẹp', mockProducts);

      expect(result.provider).toBe('deterministic');
      expect(result.text).toContain('iPhone 16 Pro');
      expect(result.text).toContain('Galaxy S24 Ultra');
      expect(result.text).toContain('29.990.000');
      expect(result.text).toContain('apple');
      expect(result.text).toContain('samsung');
    });

    it('includes product name, price, brand, and description in deterministic response', async () => {
      const quotaError = new Error('insufficient_quota');
      quotaError.status = 429;
      OpenAI.mockCreate.mockRejectedValueOnce(quotaError);

      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await generateChatResponse(mockHistory, 'test', mockProducts);

      expect(result.text).toContain('iPhone 16 Pro');
      expect(result.text).toContain('Galaxy S24 Ultra');
      expect(result.text).toContain('29.990.000');
      expect(result.text).toContain('27.990.000');
      expect(result.text).toContain('Flagship smartphone with advanced camera');
      expect(result.text).toContain('Premium Android phone with S Pen');
      expect(result.text).toContain('Còn hàng');
    });
  });

  describe('No relevant products', () => {
    it('returns helpful message when no products are found', async () => {
      const quotaError = new Error('insufficient_quota');
      quotaError.status = 429;
      OpenAI.mockCreate.mockRejectedValueOnce(quotaError);

      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await generateChatResponse(mockHistory, 'test', []);

      expect(result.provider).toBe('deterministic');
      expect(result.text).toContain('chưa tìm thấy sản phẩm phù hợp');
      expect(result.text).toContain('1900xxxx');
    });

    it('returns helpful message when productContext is null', async () => {
      const quotaError = new Error('insufficient_quota');
      quotaError.status = 429;
      OpenAI.mockCreate.mockRejectedValueOnce(quotaError);

      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await generateChatResponse(mockHistory, 'test', null);

      expect(result.provider).toBe('deterministic');
      expect(result.text).toContain('chưa tìm thấy sản phẩm phù hợp');
    });
  });
});
