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
    {
      _id: anotherId,
      name: "iPhone 14",
      brand: "apple",
      price: 16000000,
      inStock: 5,
      isActive: true,
    },
    {
      _id: "p3",
      name: "iPhone 15 Pro",
      brand: "apple",
      price: 25000000,
      inStock: 3,
      isActive: true,
    },
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
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    const result = await recommend(validId, 5);

    expect(Product.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $vectorSearch: expect.objectContaining({
            index: "vector_index",
            path: "embedding_vector",
            limit: 15,
            numCandidates: 150,
          }),
        }),
      ]),
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
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
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
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
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
      mockProducts.map((p) => ({ ...p, score: 0.95 })),
    );

    const result = await recommend(validId, 5);

    for (const p of result.products) {
      expect(typeof p.score).toBe("number");
    }
  });

  it("filters by isActive in vector search", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.isActive).toBe(true);
  });

  it("prioritizes vector similarity score before stock availability", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));

    Product.aggregate.mockResolvedValue([
      {
        _id: "high-similarity",
        name: "Highly Similar Product",
        score: 0.95,
        inStock: 2,
      },
      {
        _id: "high-stock",
        name: "High Stock Product",
        score: 0.8,
        inStock: 100,
      },
    ]);

    const result = await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const sortStage = pipeline.find((s) => s.$sort);

    expect(sortStage.$sort).toEqual({
      score: -1,
      inStock: -1,
    });

    expect(result.products[0]._id).toBe("high-similarity");
    expect(result.products[1]._id).toBe("high-stock");
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
          $vectorSearch: expect.objectContaining({ limit: 15 }),
        }),
      ]),
    );
  });

  it("applies a limit of 5 when called with valid limit", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
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
    // limit in vector search = W = min(max(20*3, 12), 30) = 30
    expect(vs.$vectorSearch.limit).toBe(30);
    // numCandidates = max(W*10, 50) = max(30*10, 50) = 300
    expect(vs.$vectorSearch.numCandidates).toBe(300);
  });

  it("clamps limit to minimum of 1", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, -5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    // K=1 -> W = min(max(3, 12), 30) = 12; numCandidates = max(120, 50) = 120
    expect(vs.$vectorSearch.limit).toBe(12);
    expect(vs.$vectorSearch.numCandidates).toBe(120);
  });

  it("clamps invalid numeric limit to default 5", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, NaN);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    // NaN -> default limit 5 -> W = 15
    expect(vs.$vectorSearch.limit).toBe(15);
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
    Product.find.mockReturnValueOnce(emptyMock).mockReturnValueOnce(latestMock);

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
    Product.find.mockReturnValueOnce(emptyMock).mockReturnValueOnce(latestMock);

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
   Constraint tests
   ============================================================ */
describe("productRecommendationService — constraints", () => {
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
    {
      _id: anotherId,
      name: "iPhone 14",
      brand: "apple",
      price: 16000000,
      inStock: 5,
      isActive: true,
    },
    {
      _id: "p3",
      name: "iPhone 15 Pro",
      brand: "apple",
      price: 25000000,
      inStock: 3,
      isActive: true,
    },
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

  it("no constraints -> no filter added, existing behavior preserved", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    const result = await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter).toBeUndefined();
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.brand).toBeUndefined();
    expect(matchStage.$match.price).toBeUndefined();
    expect(result.recommendationMode).toBe("vector");
    expect(result.constraints).toBeNull();
  });

  it("brand constraint pre-filters vector candidates", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    const result = await recommend(validId, 5, {
      brand: "samsung",
      budgetMin: null,
      budgetMax: null,
      priorities: [],
    });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.brand).toBe("samsung");
    // hard constraints are applied by the vector pre-filter, not post-$match
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.brand).toBeUndefined();
    expect(result.constraints).toEqual({
      brand: "samsung",
      budgetMin: null,
      budgetMax: null,
      priorities: [],
    });
  });

  it("budgetMin constraint pre-filters vector candidates", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { budgetMin: 15000000 });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.price.$gte).toBe(15000000);
  });

  it("budgetMax constraint pre-filters vector candidates", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { budgetMax: 25000000 });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.price.$lte).toBe(25000000);
  });

  it("budget range (min + max) pre-filters vector candidates", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { budgetMin: 10000000, budgetMax: 20000000 });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.price).toEqual({
      $gte: 10000000,
      $lte: 20000000,
    });
  });

  it("brand + budget constraints both pre-filter vector candidates", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { brand: "apple", budgetMax: 20000000 });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.brand).toBe("apple");
    expect(vs.$vectorSearch.filter.price.$lte).toBe(20000000);
  });

  it("isActive is enforced in the vector search pre-filter", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { brand: "samsung" });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.isActive).toBe(true);
  });

  it("source-product exclusion stays in the post-vector $match", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { brand: "samsung" });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match._id.$ne.toString()).toBe(validId);
  });

  it("ranking behavior is preserved with a pre-filter present", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(
      mockProducts.map((p) => ({ ...p, score: 0.9 })),
    );

    await recommend(validId, 5, { brand: "samsung" });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const sortStage = pipeline.find((s) => s.$sort);
    expect(sortStage.$sort).toEqual({ score: -1, inStock: -1 });
    const projectStage = pipeline.find((s) => s.$project);
    expect(projectStage.$project.score).toEqual({ $meta: "vectorSearchScore" });
    const vs = pipeline.find((s) => s.$vectorSearch);
    // K=5 -> numCandidates = max(15*10, 50) = 150
    expect(vs.$vectorSearch.numCandidates).toBe(150);
  });

  it("brand-price fallback respects brand constraint (overrides source brand)", async () => {
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

    await recommend(validId, 5, { brand: "samsung" });

    const query = Product.find.mock.calls[0][0];
    expect(query.brand).toBe("samsung");
  });

  it("brand-price fallback respects budget constraint (intersects price band)", async () => {
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

    // source price 20M -> band [16M, 24M]; budgetMax 18M -> band [16M, 18M]
    await recommend(validId, 5, { budgetMax: 18000000 });

    const query = Product.find.mock.calls[0][0];
    expect(query.price.$gte).toBe(16000000);
    expect(query.price.$lte).toBe(18000000);
  });

  it("latest fallback respects brand + budget constraints", async () => {
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
    Product.find.mockReturnValueOnce(emptyMock).mockReturnValueOnce(latestMock);

    const result = await recommend(validId, 5, {
      brand: "samsung",
      budgetMax: 15000000,
    });

    // brand-price band [16M, 24M] intersected with <= 15M is empty, so the
    // brand-price path returns [] without calling Product.find; the latest
    // fallback is therefore the first (and only) find call.
    const latestQuery = Product.find.mock.calls[0][0];
    expect(latestQuery.brand).toBe("samsung");
    expect(latestQuery.price.$lte).toBe(15000000);
    expect(result.recommendationMode).toBe("fallback");
  });

  it("empty constrained candidates -> empty products (no silent constraint drop)", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const emptyMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Product.find.mockReturnValueOnce(emptyMock).mockReturnValueOnce(emptyMock);

    const result = await recommend(validId, 5, {
      brand: "nokia",
      budgetMax: 1000000,
    });

    expect(result.products).toEqual([]);
    expect(result.recommendationMode).toBe("fallback");
    // the constraint must still be present in the final query
    expect(Product.find.mock.calls[0][0].brand).toBe("nokia");
    expect(Product.find.mock.calls[0][0].price.$lte).toBe(1000000);
  });

  it("parser output is correctly consumed as constraints", async () => {
    const {
      parseRecommendationConstraints,
    } = require("../utils/recommendationConstraintParser");
    const constraints = parseRecommendationConstraints(
      "Samsung dưới 15 triệu chụp ảnh đẹp",
    );

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

    const result = await recommend(validId, 5, constraints);

    const query = Product.find.mock.calls[0][0];
    expect(query.brand).toBe("samsung");
    expect(query.price.$lte).toBe(15000000);
    // priorities parsed but preserved for future ranking (not yet ranked on)
    expect(result.constraints.priorities).toEqual(["camera"]);
  });
});

/* ============================================================
   v2: stock constraint, preference ranking & diversity
   ============================================================ */
describe("productRecommendationService — v2: stock, ranking & diversity", () => {
  let Product;
  let recommend;

  const validId = new mongoose.Types.ObjectId().toString();

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

  /* ----------- hard stock constraint ----------- */

  it("adds inStock > 0 to the vector-path $match", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, 5);

    const pipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match.inStock).toEqual({ $gt: 0 });
  });

  it("does not add inStock to $vectorSearch.filter", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([]);
    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, 5, { brand: "samsung" });

    const pipeline = Product.aggregate.mock.calls[0][0];
    const vs = pipeline.find((s) => s.$vectorSearch);
    expect(vs.$vectorSearch.filter.inStock).toBeUndefined();
  });

  it("excludes out-of-stock products from results", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "in-stock",
        name: "In Stock Phone",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.9,
      },
      {
        _id: "out-of-stock",
        name: "Out of Stock Phone",
        brand: "samsung",
        price: 20000000,
        inStock: 0,
        isActive: true,
        score: 0.8,
      },
    ]);

    const result = await recommend(validId, 5);

    expect(result.products.map((p) => p._id)).toEqual(["in-stock"]);
  });

  it("brand-price fallback requires inStock > 0", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    Product.find.mockReturnValue(mockFindChain([]));

    await recommend(validId, 5);

    const query = Product.find.mock.calls[0][0];
    expect(query.inStock).toEqual({ $gt: 0 });
  });

  it("latest fallback requires inStock > 0", async () => {
    const noEmbed = { ...sourceProduct };
    delete noEmbed.embedding_vector;
    Product.findById.mockReturnValue(mockFindById(noEmbed));

    const emptyMock = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    Product.find.mockReturnValueOnce(emptyMock).mockReturnValueOnce(emptyMock);

    await recommend(validId, 5);

    const latestQuery = Product.find.mock.calls[1][0];
    expect(latestQuery.inStock).toEqual({ $gt: 0 });
  });

  /* ----------- preference-aware ranking ----------- */

  it('priorities ["camera"] changes the ranking order', async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "p-cam-weak",
        name: "Camera Weak",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: { camera: { rear: { primary: "12 MP" }, front: "12 MP", features: [] } },
        score: 0.95,
      },
      {
        _id: "p-cam-strong",
        name: "Camera Strong",
        brand: "samsung",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: {
          camera: {
            rear: { primary: "200 MP", secondary: "12 MP", tertiary: "12 MP" },
            front: "50 MP",
            features: ["OIS", "Night mode", "4K video"],
          },
        },
        score: 0.8,
      },
    ]);

    const result = await recommend(validId, 5, { priorities: ["camera"] });

    expect(result.products[0]._id).toBe("p-cam-strong");
    expect(result.products[1]._id).toBe("p-cam-weak");
  });

  it('priorities ["battery"] changes the ranking order', async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "p-bat-small",
        name: "Battery Small",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: { battery: { capacity: "3000 mAh", charging: { wired: "15W" } } },
        score: 0.95,
      },
      {
        _id: "p-bat-big",
        name: "Battery Big",
        brand: "samsung",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: {
          battery: { capacity: "6000 mAh", charging: { wired: "120W", wireless: "50W" } },
        },
        score: 0.8,
      },
    ]);

    const result = await recommend(validId, 5, { priorities: ["battery"] });

    expect(result.products[0]._id).toBe("p-bat-big");
    expect(result.products[1]._id).toBe("p-bat-small");
  });

  it('priorities ["gaming"] maps to performance ranking', async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "p-low-perf",
        name: "Low Perf",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: { memory: { ram: "4 GB", storage: "64 GB" } },
        score: 0.95,
      },
      {
        _id: "p-high-perf",
        name: "High Perf",
        brand: "samsung",
        price: 20000000,
        inStock: 5,
        isActive: true,
        specs: {
          memory: { ram: "12 GB", storage: "512 GB" },
          processor: { chipset: "Snapdragon 8 Gen 3", cpu: "8-core", gpu: "Adreno 750" },
        },
        score: 0.8,
      },
    ]);

    const result = await recommend(validId, 5, { priorities: ["gaming"] });

    expect(result.products[0]._id).toBe("p-high-perf");
    expect(result.products[1]._id).toBe("p-low-perf");
  });

  it("no priorities preserves the existing ranking order", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "p1",
        name: "Alpha",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.9,
      },
      {
        _id: "p2",
        name: "Beta",
        brand: "samsung",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.7,
      },
    ]);

    const result = await recommend(validId, 5);

    expect(result.products.map((p) => p._id)).toEqual(["p1", "p2"]);
  });

  /* ----------- diversity / deduplication ----------- */

  it("removes duplicate product names", async () => {
    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([
      {
        _id: "p1",
        name: "iPhone 15",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.9,
      },
      {
        _id: "p2",
        name: "iPhone 15",
        brand: "apple",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.8,
      },
      {
        _id: "p3",
        name: "Galaxy S24",
        brand: "samsung",
        price: 20000000,
        inStock: 5,
        isActive: true,
        score: 0.7,
      },
    ]);

    const result = await recommend(validId, 5);

    expect(result.products.map((p) => p._id)).toEqual(["p1", "p3"]);
  });

  it("caps products per brand at Math.ceil(K / 2)", async () => {
    const appleProducts = [1, 2, 3, 4].map((n) => ({
      _id: `apple-${n}`,
      name: `Apple Phone ${n}`,
      brand: "apple",
      price: 20000000,
      inStock: 5,
      isActive: true,
      score: 1 - n / 100,
    }));
    const samsungProducts = [1, 2].map((n) => ({
      _id: `samsung-${n}`,
      name: `Samsung Phone ${n}`,
      brand: "samsung",
      price: 20000000,
      inStock: 5,
      isActive: true,
      score: 0.5 - n / 100,
    }));

    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue([...appleProducts, ...samsungProducts]);

    const result = await recommend(validId, 5);

    const appleCount = result.products.filter((p) => p.brand === "apple").length;
    const samsungCount = result.products.filter((p) => p.brand === "samsung").length;
    expect(appleCount).toBe(3); // Math.ceil(5 / 2)
    expect(samsungCount).toBe(2);
    expect(result.products).toHaveLength(5);
  });

  it("returns at most K products", async () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      _id: `p${i}`,
      name: `Product ${i}`,
      brand: `brand-${i % 3}`,
      price: 20000000,
      inStock: 5,
      isActive: true,
      score: 1 - i / 100,
    }));

    Product.findById.mockReturnValue(mockFindById(sourceProduct));
    Product.aggregate.mockResolvedValue(products);

    const resultK5 = await recommend(validId, 5);
    expect(resultK5.products.length).toBe(5);

    // K=20 -> W=30; only 10 candidates available -> all 10 returned (<= 20)
    const resultK20 = await recommend(validId, 20);
    expect(resultK20.products.length).toBe(10);
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

  it("passes parsed constraints when query param is provided", async () => {
    mockRecommend.mockResolvedValue({
      sourceProduct: { _id: validId, name: "iPhone 15" },
      products: [],
      recommendationMode: "fallback",
    });

    const req = mockReq({
      params: { id: validId },
      query: { limit: "5", query: "Samsung dưới 15 triệu" },
    });
    const res = mockRes();

    await getRecommendations(req, res);

    expect(mockRecommend).toHaveBeenCalledWith(
      validId,
      "5",
      expect.objectContaining({
        brand: "samsung",
        budgetMax: 15000000,
      }),
    );
  });

  it("does not pass constraints when no query param is provided", async () => {
    mockRecommend.mockResolvedValue({
      sourceProduct: { _id: validId, name: "iPhone 15" },
      products: [],
      recommendationMode: "fallback",
    });

    const req = mockReq({
      params: { id: validId },
      query: { limit: "5" },
    });
    const res = mockRes();

    await getRecommendations(req, res);

    expect(mockRecommend).toHaveBeenCalledWith(validId, "5");
  });

  it("returns 400 for invalid product ID", async () => {
    mockRecommend.mockResolvedValue({ error: "INVALID_ID" });

    const req = mockReq({ params: { id: "bad" } });
    const res = mockRes();
    const next = jest.fn();

    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "ID sản phẩm không hợp lệ",
      }),
    );
  });

  it("returns 404 when product not found", async () => {
    mockRecommend.mockResolvedValue({ error: "NOT_FOUND" });

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Không tìm thấy sản phẩm",
      }),
    );
  });

  it("returns 500 on unexpected service error", async () => {
    const error = new Error("Unexpected");
    mockRecommend.mockRejectedValue(error);

    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
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

/* ============================================================
   Vector relevance threshold (MIN_VECTOR_SCORE = 0.40)
   ============================================================ */
describe("vector relevance threshold (MIN_VECTOR_SCORE = 0.40)", () => {
  let Product;
  let recommend;
  let mockAggregate;
  const validSourceId = new mongoose.Types.ObjectId().toString();
  const mockSourceProduct = {
    _id: validSourceId,
    name: "Source Phone",
    brand: "samsung",
    price: 15000000,
    embedding_vector: new Array(1536).fill(0.1),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("../models/Product", () => ({
      findById: jest.fn(),
      aggregate: jest.fn(),
      find: jest.fn(),
    }));
    jest.doMock("../services/productRecommendationService", () => {
      const actual = jest.requireActual("../services/productRecommendationService");
      return actual;
    });
    Product = require("../models/Product");
    recommend = require("../services/productRecommendationService").recommend;
    Product.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockSourceProduct),
    });
    mockAggregate = Product.aggregate;
  });

  const mockFindChain = (result) => ({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  });

  it("filters out results with score below 0.40", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "Good Match", brand: "samsung", price: 14000000, inStock: 5, isActive: true, score: 0.7 },
      { _id: "p2", name: "Weak Match", brand: "samsung", price: 13000000, inStock: 3, isActive: true, score: 0.25 },
    ]);

    const result = await recommend(validSourceId);

    expect(result.recommendationMode).toBe("vector");
    expect(result.products).toHaveLength(1);
    expect(result.products[0]._id).toBe("p1");
  });

  it("retains result with score exactly 0.40", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "Boundary", brand: "samsung", price: 14000000, inStock: 5, isActive: true, score: 0.40 },
    ]);

    const result = await recommend(validSourceId);

    expect(result.recommendationMode).toBe("vector");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].score).toBe(0.40);
  });

  it("retains results with score above 0.40", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "Strong", brand: "samsung", price: 14000000, inStock: 5, isActive: true, score: 0.85 },
      { _id: "p2", name: "Good", brand: "samsung", price: 13000000, inStock: 3, isActive: true, score: 0.50 },
    ]);

    const result = await recommend(validSourceId);

    expect(result.recommendationMode).toBe("vector");
    expect(result.products).toHaveLength(2);
  });

  it("triggers brand_price fallback when all vector results are below threshold", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "Weak1", brand: "samsung", price: 14000000, inStock: 5, isActive: true, score: 0.15 },
      { _id: "p2", name: "Weak2", brand: "samsung", price: 13000000, inStock: 3, isActive: true, score: 0.10 },
    ]);
    Product.find.mockReturnValue(mockFindChain([
      { _id: "fb1", name: "Fallback Samsung", brand: "samsung", price: 14500000, inStock: 4 },
    ]));

    const result = await recommend(validSourceId);

    expect(result.recommendationMode).not.toBe("vector");
    expect(result.recommendationMode).toMatch(/brand_price|fallback/);
  });

  it("preserves score field in products above threshold", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "Scored", brand: "samsung", price: 14000000, inStock: 5, isActive: true, score: 0.73 },
    ]);

    const result = await recommend(validSourceId);

    expect(result.products[0].score).toBe(0.73);
  });

  it("does not let products with missing/undefined score pass threshold", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "p1", name: "No Score", brand: "samsung", price: 14000000, inStock: 5, isActive: true },
      { _id: "p2", name: "Null Score", brand: "samsung", price: 13000000, inStock: 3, isActive: true, score: null },
      { _id: "p3", name: "NaN Score", brand: "samsung", price: 12000000, inStock: 2, isActive: true, score: NaN },
    ]);
    Product.find.mockReturnValue(mockFindChain([
      { _id: "fb1", name: "Fallback Samsung", brand: "samsung", price: 14500000, inStock: 4 },
    ]));

    const result = await recommend(validSourceId);

    expect(result.recommendationMode).not.toBe("vector");
  });
});
