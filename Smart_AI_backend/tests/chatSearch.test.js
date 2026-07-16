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

    expect(productSearchService.search).toHaveBeenCalledWith('iphone 15', 5);
    expect(result).toEqual(mockProducts);
  });

  it('passes default limit of 5 to the service', async () => {
    productSearchService.search.mockResolvedValue({ products: [], searchMode: 'vector' });

    await ChatController.searchRelevantProducts('galaxy');

    expect(productSearchService.search).toHaveBeenCalledWith('galaxy', 5);
  });

  it('forwards service errors unchanged', async () => {
    productSearchService.search.mockRejectedValue(new Error('Service error'));

    await expect(
      ChatController.searchRelevantProducts('test')
    ).rejects.toThrow('Service error');
  });
});
