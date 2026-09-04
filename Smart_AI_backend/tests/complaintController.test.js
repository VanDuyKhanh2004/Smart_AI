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

const mockComplaintSave = jest.fn().mockResolvedValue();

jest.mock('../models/Complaint', () => {
  const MockComplaint = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: 'complaint-123',
    save: mockComplaintSave,
    resolve: jest.fn().mockResolvedValue(),
    escalate: jest.fn().mockResolvedValue(),
  }));
  MockComplaint.find = jest.fn();
  MockComplaint.findById = jest.fn();
  MockComplaint.findByIdAndDelete = jest.fn();
  MockComplaint.countDocuments = jest.fn();
  MockComplaint.getStats = jest.fn();
  MockComplaint.aggregate = jest.fn();
  return MockComplaint;
});

jest.mock('../models/Conversation', () => ({
  find: jest.fn(),
}));

jest.mock('../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

const { getComplaints, searchComplaints } = require('../controllers/complaintController');
const Complaint = require('../models/Complaint');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes = () => ({ status: mockStatus, json: mockJson });

function mockReq(body = {}, params = {}, query = {}) {
  return { body, params, query, requestId: 'test-cid' };
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ============================================================
   getComplaints — sortBy validation
   ============================================================ */
describe('getComplaints', () => {
  it('uses valid sortBy field from query', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { sortBy: 'priority', sortOrder: 'asc' });
    const res = mockRes();
    await getComplaints(req, res);

    const findCall = Complaint.find.mock.calls[0][0];
    expect(findCall).toBeDefined();
    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ priority: 1 });
  });

  it('defaults to createdAt for invalid sortBy', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { sortBy: 'constructor', sortOrder: 'desc' });
    const res = mockRes();
    await getComplaints(req, res);

    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ createdAt: -1 });
  });

  it('rejects __proto__ sortBy and defaults to createdAt', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { sortBy: '__proto__', sortOrder: 'asc' });
    const res = mockRes();
    await getComplaints(req, res);

    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ createdAt: 1 });
  });

  it('rejects $where injection attempt and defaults to createdAt', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { sortBy: '$where', sortOrder: 'desc' });
    const res = mockRes();
    await getComplaints(req, res);

    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ createdAt: -1 });
  });

  it('rejects internal field (embedding_vector) sortBy', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { sortBy: 'embedding_vector', sortOrder: 'asc' });
    const res = mockRes();
    await getComplaints(req, res);

    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ createdAt: 1 });
  });
});

/* ============================================================
   searchComplaints — no sortBy parameter (uses hardcoded sort)
   ============================================================ */
describe('searchComplaints', () => {
  it('always sorts by createdAt desc regardless of query', async () => {
    Complaint.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Complaint.countDocuments.mockResolvedValue(0);

    const req = mockReq({}, {}, { q: 'test', sortBy: '__proto__' });
    const res = mockRes();
    await searchComplaints(req, res);

    const sortArg = Complaint.find.mock.results[0].value.sort.mock.calls[0][0];
    expect(sortArg).toEqual({ createdAt: -1 });
  });
});
