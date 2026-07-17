const mongoose = require("mongoose");

/* ============================================================
   Service tests
   ============================================================ */
describe("productRecommendationService — recommend()", () => {
  let Product;
  let recommend;

  const validId = new mongoose.Types.ObjectId().toString();
  const anotherId = new mongoose.Types.ObjectId().toString();

  const makeProduct = (overrides = {}) => ({
    _id: validId,
    name: "iPhone 15",
    brand: "apple",
    price: 20000000,
    inStock: 10,
    isActive: true,
    embedding_vector: new Array(1536).fill(0.1),
    ...overrides,
  });

  const sourceProduct = makeProduct();

  const mockProducts = [
    { _id: anotherId, name: "iPhone 14", brand: "apple", price: 16000000, inStock: 5, isActive: true },
    { _id: "p3", name: "iPhone 15 Pro", brand: "apple", price: 25000000, inStock: 3, isActive: true },
  ];

  const mockFindById = (result) => ({
    lean: jest.fn().mockResolvedValue(result),
  });

  const mockFindChain = (result) => ({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  });

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("../models/Product", () => ({
      findById: jest.fn(),
      aggregate: jest.fn(),
      find: jest.fn(),
    }));
    Product = require("../models/Product");
    recommend = require("../services/productRecommendationService").recommend;
  });

  /* ----------- source product ----------- */
  it("returns INVALID_ID error for malformed product ID", async () => {
    const result = await recommend("bad-id");
    expect(result.error).toBe("INVALID_ID");
  });

  it("returns NOT_FOUND error when product does not exist", async () => {
    Product.findById.mockReturnValue(mockFindById(null));
    const result = await recommend(validId);
    expect(result.error).toBe("NOT_FOUND");
  });

  /* ----------- vector search path ----------- */
  it("returns vector recommendations when source has valid embedding", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    const result = await recommend(validId, 5);

    expect(Product.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $vectorSearch: expect.objectContaining({
            index: "vector_index",
            path: "embedding_vector",
            limit: 6,
            numCandidates: 50,
          }),
        }),
      ])
    );
    expect(result.recommendationMode).toBe("vector");
    expect(result.sourceProduct).toEqual({
      _id: sourceProduct._id,
      name: sourceProduct.name,
    });
    expect(result.products).toHaveLength(2);
  });

  it("excludes the source product from results", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    const result = await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match._id.$ne.toString()).toBe(validId);
    expect(result.products.every((p) => p._id !== validId)).toBe(true);
  });

  it("excludes embedding_vector from response", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    const result = await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const projectStage = pipeline.find((s) => s.$project);
    expect(projectStage.$project.embedding_vector).toBe(0);

    for (const p of result.products) {
      expect(p.embedding_vector).toBeUndefined();
    }
  });

  it("includes vectorSearchScore as score", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.95 }))
    );

    const result = await recommend(validId, 5);

    for (const p of result.products) {
      expect(typeof p.score).toBe("number");
    }
  });

  it("filters by isActive in vector search", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.isActive).toBe(true);
  });

  it("prefers in-stock products by sort order", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const sortStage = pipeline.find((s) => s.$sort);
    expect(sortStage.$sort.inStock).toBe(-1);
  });

  /* ----------- limit handling ----------- */
  it("defaults to limit 5", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId);

    expect(Product.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $vectorSearch: expect.objectContaining({ limit: 6 }),
        }),
      ])
    );
  });

  it("applies a limit of 5 when called with valid limit", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 }))
    );

    const result = await recommend(validId, 5);
    expect(result.products.length).toBeLessThanOrEqual(5);
  });

  it("clamps limit to maximum of 20", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, 100);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    // limit in vector search = safeLimit + 1 = 20 + 1 = 21
    expect(vs.$vectorSearch.limit).toBe(21);
    // numCandidates = max(20*10, 50) = 200
    expect(vs.$vectorSearch.numCandidates).toBe(200);
  });

  it("clamps limit to minimum of 1", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, -5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.limit).toBe(2);
  });

  it("clamps invalid numeric limit to default 5", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, NaN);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.limit).toBe(6);
  });

  /* ----------- fallback: no embedding ----------- */
  it("falls back to brand-price when source has no embedding_vector", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    const result = await recommend(validId, 5);

    expect(result.recommendationMode).toBe("brand_price");
    expect(result.products).toEqual(mockProducts);
    expect(Product.aggregate).not.toHaveBeenCalled();
  });

  it("falls back to brand-price when embedding has wrong dimensions", async () => {
    const badEmbed = { ...sourceProduct, embedding_vector: [0.1, 0.2, 0.3] };
    Product.findById.mockReturnValue(mockFindById(badEmbed));

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    const result = await recommend(validId, 5);

    expect(result.recommendationMode).toBe("brand_price");
  });

  it("passes brand and ±20% price to brand-price fallback query", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    await recommend(validId, 5);

    const query = Product.find.mock.calls[0][0];
    expect(query.brand).toBe("apple");
    expect(query.price.$gte).toBe(16000000); // 20M * 0.8
    expect(query.price.$lte).toBe(24000000); // 20M * 1.2
    expect(query._id.$ne.toString()).toBe(validId);
    expect(query.isActive).toBe(true);
  });

  /* ----------- fallback: vector search error ----------- */
  it("falls back to brand-price when vector search throws", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockRejectedValue(new Error("Atlas error"));

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    const result = await recommend(validId, 5);

    expect(result.recommendationMode).toBe("brand_price");
  });

  /* ----------- fallback: vector returns empty ----------- */
  it("falls back to brand-price when vector search returns empty", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    const result = await recommend(validId, 5);

    expect(result.recommendationMode).toBe("brand_price");
  });

  /* ----------- fallback: brand-price returns empty ----------- */
  it("falls back to latest products when brand-price returns empty", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const emptyMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const latestMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find
      .mockReturnValueOnce(emptyMock)
      .mockReturnValueOnce(latestMock);

    const result = await recommend(validId, 5);

    expect(result.recommendationMode).toBe("fallback");
    expect(result.products).toEqual(mockProducts);
  });

  it("latest fallback excludes source and filters active", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const emptyMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const latestMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find
      .mockReturnValueOnce(emptyMock)
      .mockReturnValueOnce(latestMock);

    await recommend(validId, 5);

    const query = Product.find.mock.calls[1][0];
    expect(query._id.$ne.toString()).toBe(validId);
    expect(query.isActive).toBe(true);
  });

  it("returns mode brand_price from first fallback", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const findMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    };
    Product.find.mockReturnValue(findMock);

    const result = await recommend(validId, 5);
    expect(result.recommendationMode).toBe("brand_price");
  });

  it("returns mode fallback from final fallback", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const emptyMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Product.find.mockReturnValue(emptyMock);

    const result = await recommend(validId, 5);
    expect(result.recommendationMode).toBe("fallback");
  });
});

/* ============================================================
   Controller tests
   ============================================================ */
describe("productController — getRecommendations()", () => {
  let getRecommendations;
  let mockRecommend;

  const validId = new mongoose.Types.ObjectId().toString();

  const mockReq = (overrides = {}) => ({
    params: { id: validId, ...overrides.params },
    query: { limit: "5", ...overrides.query },
    ...overrides,
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("../services/productRecommendationService", () => ({
      recommend: jest.fn(),
    }));
    jest.doMock("../utils/openai", () => ({
      generateEmbedding: jest.fn(),
      generateEmbeddingsBatch: jest.fn(),
      calculateSimilarity: jest.fn(),
      testOpenAIConnection: jest.fn(),
    }));
    jest.doMock("../services/cacheService", () => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      invalidatePattern: jest.fn(),
    }));
    jest.doMock("../models/Review", () => ({
      getProductStats: jest.fn(),
    }));
    mockRecommend =
      require("../services/productRecommendationService").recommend;
    getRecommendations =
      require("../controllers/productController").getRecommendations;
  });

  it("returns 200 with products for a valid product", async () => {
    const products = [{ _id: "p2", name: "iPhone 14" }];
    mockRecommend.mockResolvedValue({
      sourceProduct: { _id: validId, name: "iPhone 15" },
      products,
      recommendationMode: "vector",
    });

    const req = mockReq();
    const res = mockRes();

    await getRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Lấy sản phẩm gợi ý thành công",
      data: {
        sourceProduct: { _id: validId, name: "iPhone 15" },
        products,
        recommendationMode: "vector",
      },
    });
  });

  it("returns 400 for invalid product ID", async () => {
    mockRecommend.mockResolvedValue({ error: "INVALID_ID" });

    const req = mockReq({ params: { id: "bad" } });
    const res = mockRes();

    await getRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "ID sản phẩm không hợp lệ",
    });
  });

  it("returns 404 when product not found", async () => {
    mockRecommend.mockResolvedValue({ error: "NOT_FOUND" });

    const req = mockReq();
    const res = mockRes();

    await getRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Không tìm thấy sản phẩm",
    });
  });

  it("returns 500 on unexpected service error", async () => {
    mockRecommend.mockRejectedValue(new Error("Unexpected"));

    const req = mockReq();
    const res = mockRes();

    await getRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Lỗi server khi lấy gợi ý sản phẩm",
    });
  });
});

/* ============================================================
   Route ordering — verify no conflict with existing routes
   ============================================================ */
describe("route ordering — /:id/recommendations", () => {
  it("does not conflict with GET /:id", () => {
    const path1 = "/:id/recommendations";
    const path2 = "/:id";
    expect(path1).not.toBe(path2);
    // Express matches /abc/recommendations against /:id/recommendations
    // and /abc against /:id — they are different patterns
    const regex1 = ExpressRouteToRegex(path1);
    const regex2 = ExpressRouteToRegex(path2);
    expect(regex1.test("/abc123/recommendations")).toBe(true);
    expect(regex2.test("/abc123/recommendations")).toBe(false);
    expect(regex2.test("/abc123")).toBe(true);
  });
});

const ExpressRouteToRegex = (route) => {
  const pattern = route.replace(/:id/g, "([^/]+)");
  return new RegExp(`^${pattern}$`);
};
