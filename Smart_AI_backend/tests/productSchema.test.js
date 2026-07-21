describe('Product schema', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('accepts missing embedding_vector', () => {
    const Product = require('../models/Product');

    const product = new Product({
      name: 'Test',
      brand: 'Brand',
      price: 100,
      description: 'Desc',
    });

    expect(product.embedding_vector).toBeUndefined();
  });

  it('rejects vectors not exactly 1536 dimensions', () => {
    const Product = require('../models/Product');

    const product = new Product({
      name: 'Test',
      brand: 'Brand',
      price: 100,
      description: 'Desc',
      embedding_vector: new Array(100).fill(0.1),
    });

    const err = product.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['embedding_vector']).toBeDefined();
  });

  it('accepts valid 1536-dimension vector', () => {
    const Product = require('../models/Product');

    const product = new Product({
      name: 'Test',
      brand: 'Brand',
      price: 100,
      description: 'Desc',
      embedding_vector: new Array(1536).fill(0.1),
    });

    const err = product.validateSync();
    expect(err).toBeUndefined();
  });

  it('has metadata fields with correct defaults', () => {
    const Product = require('../models/Product');

    const product = new Product({
      name: 'Test',
      brand: 'Brand',
      price: 100,
      description: 'Desc',
    });

    expect(product.embeddingStatus).toBe('pending');
    expect(product.embeddingContentHash).toBeNull();
    expect(product.embeddingUpdatedAt).toBeNull();
    expect(product.embeddingError).toBeNull();
  });
});
