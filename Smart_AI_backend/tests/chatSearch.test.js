jest.mock('../services/productSearchService', () => ({
  search: jest.fn(),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

jest.mock('../models/Conversation', () => {
  const mockConversation = {
    _id: 'conv1',
    sessionId: 'session-1',
    messages: [],
    save: jest.fn(),
  };
  const Conversation = jest.fn(() => mockConversation);
  Conversation.findOne = jest.fn();
  return Conversation;
});

jest.mock('../models/Complaint', () => {
  const Complaint = jest.fn();
  Complaint.findOne = jest.fn();
  return Complaint;
});

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn(),
  generateComplaintResponse: jest.fn(),
}));

jest.mock('../utils/productValidator', () => ({
  matchesProductConstraints: jest.fn(() => true),
}));

jest.mock('../utils/productConstraintParser', () => ({
  parseProductConstraints: jest.fn((query) => ({
    cleanedQuery: query,
    filters: {
      minPrice: null, maxPrice: null,
      brands: null, excludedBrands: null,
      inStock: null,
      ramGB: null, minRamGB: null, maxRamGB: null,
      storageGB: null, minStorageGB: null, maxStorageGB: null,
      colors: null,
    },
    preferences: { camera: false, battery: false, performance: false, compact: false },
  })),
}));

const productSearchService = require('../services/productSearchService');
const ChatController = require('../controllers/chatController');

describe('ChatController.searchRelevantProducts() — refactor compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to productSearchService.search()', async () => {
    const mockProducts = [{ _id: 'p1', name: 'iPhone 15', score: 0.95 }];
    productSearchService.search.mockResolvedValue({
      products: mockProducts,
      searchMode: 'vector',
    });

    const result = await ChatController.searchRelevantProducts('iphone 15', 5);

    const callArg = productSearchService.search.mock.calls[0][2];
    expect(callArg).toHaveProperty('minPrice');
    expect(callArg).toHaveProperty('maxPrice');
    expect(callArg).toHaveProperty('brands');
    expect(result).toEqual(mockProducts);
  });

  it('passes default limit of 5 to the service', async () => {
    productSearchService.search.mockResolvedValue({ products: [], searchMode: 'vector' });

    await ChatController.searchRelevantProducts('galaxy');

    expect(productSearchService.search).toHaveBeenCalledWith('galaxy', 5, expect.any(Object));
  });

  it('forwards service errors unchanged', async () => {
    productSearchService.search.mockRejectedValue(new Error('Service error'));

    await expect(
      ChatController.searchRelevantProducts('test')
    ).rejects.toThrow('Service error');
  });
});
