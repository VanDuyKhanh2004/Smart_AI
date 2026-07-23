const { EVAL_PRODUCTS, getProductsByIds } = require('./products');

const ALL_ACTIVE_IDS = EVAL_PRODUCTS.filter(p => p.isActive !== false).map(p => p._id);

function validIds(query) {
  const { parseProductConstraints } = require('../../../utils/productConstraintParser');
  const { matchesProductConstraints } = require('../../../utils/productValidator');
  const { filters } = parseProductConstraints(query);
  return EVAL_PRODUCTS.filter(p => p.isActive !== false).filter(p => matchesProductConstraints(p, filters)).map(p => p._id);
}

function forbiddenIds(query) {
  const valid = validIds(query);
  return ALL_ACTIVE_IDS.filter(id => !valid.includes(id));
}

const SINGLE_TURN_CASES = [
  {
    id: 'constraint-price-max-001',
    category: 'constraint',
    query: 'điện thoại tối đa 10 triệu',
    expected: {
      maxPrice: 10000000,
      requiredProductIds: ['eval-s2', 'eval-s4', 'eval-a3', 'eval-x1', 'eval-m1'],
      forbiddenProductIds: ['eval-s1', 'eval-s3', 'eval-a1', 'eval-a2', 'eval-x2', 'eval-n1', 'eval-g1'],
    },
  },
  {
    id: 'constraint-price-below-002',
    category: 'constraint',
    query: 'điện thoại dưới 5 triệu',
    expected: {
      maxPrice: 4999999,
      requiredProductIds: ['eval-s2', 'eval-s4', 'eval-m1'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => !['eval-s2', 'eval-s4', 'eval-m1'].includes(id)),
    },
  },
  {
    id: 'constraint-price-range-003',
    category: 'constraint',
    query: 'điện thoại từ 10 triệu đến 20 triệu',
    expected: {
      minPrice: 10000000,
      maxPrice: 20000000,
      requiredProductIds: ['eval-s1', 'eval-a3', 'eval-x2'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => !['eval-s1', 'eval-a3', 'eval-x2'].includes(id)),
    },
  },
  {
    id: 'constraint-brand-004',
    category: 'constraint',
    query: 'điện thoại Samsung',
    expected: {
      brands: ['samsung'],
      requiredProductIds: ['eval-s1', 'eval-s2', 'eval-s3', 'eval-s4'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => !['eval-s1', 'eval-s2', 'eval-s3', 'eval-s4'].includes(id)),
    },
  },
  {
    id: 'constraint-brand-multi-005',
    category: 'constraint',
    query: 'Samsung hoặc Xiaomi dưới 15 triệu',
    expected: {
      brands: ['samsung', 'xiaomi'],
      maxPrice: 14999999,
      requiredProductIds: ['eval-s2', 'eval-s4', 'eval-x1', 'eval-x2', 'eval-m1'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => !['eval-s2', 'eval-s4', 'eval-x1', 'eval-x2', 'eval-m1'].includes(id)),
    },
  },
  {
    id: 'constraint-brand-exclude-006',
    category: 'constraint',
    query: 'điện thoại không lấy Samsung',
    expected: {
      excludedBrands: ['samsung'],
      requiredProductIds: ['eval-a1', 'eval-a2', 'eval-a3', 'eval-x1', 'eval-x2', 'eval-n1', 'eval-g1', 'eval-m1'],
      forbiddenProductIds: ['eval-s1', 'eval-s2', 'eval-s3', 'eval-s4'],
    },
  },
  {
    id: 'constraint-instock-007',
    category: 'constraint',
    query: 'điện thoại còn hàng dưới 15 triệu',
    expected: {
      inStock: true,
      maxPrice: 14999999,
      requiredProductIds: ['eval-s2', 'eval-a3', 'eval-x1', 'eval-x2', 'eval-m1'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => !['eval-s2', 'eval-a3', 'eval-x1', 'eval-x2', 'eval-m1'].includes(id)),
    },
  },
  {
    id: 'constraint-ram-min-008',
    category: 'constraint',
    query: 'điện thoại RAM ít nhất 8GB',
    expected: {
      minRamGB: 8,
      requiredProductIds: ['eval-s1', 'eval-s3', 'eval-a1', 'eval-a2', 'eval-x1', 'eval-x2', 'eval-n1', 'eval-g1'],
      forbiddenProductIds: ['eval-s2', 'eval-s4', 'eval-a3', 'eval-m1'],
    },
  },
  {
    id: 'constraint-ram-alt-009',
    category: 'constraint',
    query: 'điện thoại RAM 8 hoặc 12GB',
    expected: {
      ramGB: [8, 12],
      requiredProductIds: ['eval-s1', 'eval-s3', 'eval-a1', 'eval-a2', 'eval-x1', 'eval-x2'],
      forbiddenProductIds: ['eval-s2', 'eval-s4', 'eval-a3', 'eval-n1', 'eval-g1', 'eval-m1'],
    },
  },
  {
    id: 'constraint-storage-010',
    category: 'constraint',
    query: 'điện thoại 256GB',
    expected: {
      minStorageGB: 256,
      maxStorageGB: 256,
      requiredProductIds: ['eval-s1', 'eval-a1', 'eval-a2', 'eval-x1', 'eval-x2'],
      forbiddenProductIds: ['eval-s2', 'eval-s3', 'eval-s4', 'eval-a3', 'eval-n1', 'eval-g1', 'eval-m1'],
    },
  },
  {
    id: 'constraint-storage-alt-011',
    category: 'constraint',
    query: 'điện thoại 128 hoặc 256GB',
    expected: {
      storageGB: [128, 256],
      requiredProductIds: ['eval-s1', 'eval-s2', 'eval-a1', 'eval-a2', 'eval-x1', 'eval-x2'],
      forbiddenProductIds: ['eval-s3', 'eval-s4', 'eval-a3', 'eval-n1', 'eval-g1', 'eval-m1'],
    },
  },
  {
    id: 'constraint-color-012',
    category: 'constraint',
    query: 'điện thoại màu đen',
    expected: {
      colors: ['black'],
      requiredProductIds: ['eval-s1', 'eval-s4', 'eval-a3', 'eval-x1', 'eval-x2', 'eval-n1'],
      forbiddenProductIds: ['eval-s2', 'eval-s3', 'eval-a1', 'eval-a2', 'eval-g1', 'eval-m1'],
    },
  },
  {
    id: 'constraint-combined-013',
    category: 'constraint',
    query: 'Samsung dưới 15 triệu có màu đen',
    expected: {
      brands: ['samsung'],
      maxPrice: 14999999,
      colors: ['black'],
      requiredProductIds: ['eval-s4'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => id !== 'eval-s4'),
    },
  },
  {
    id: 'constraint-no-match-014',
    category: 'constraint',
    query: 'điện thoại RAM ít nhất 100GB Samsung còn hàng',
    expected: {
      minRamGB: 100,
      brands: ['samsung'],
      inStock: true,
      requiredProductIds: [],
      forbiddenProductIds: ['eval-s1', 'eval-s2', 'eval-s3', 'eval-s4', 'eval-a1', 'eval-a2', 'eval-a3', 'eval-x1', 'eval-x2', 'eval-n1', 'eval-g1', 'eval-m1'],
    },
  },
  {
    id: 'constraint-price-ram-color-015',
    category: 'constraint',
    query: 'điện thoại dưới 8 triệu RAM 8GB màu đen',
    expected: {
      maxPrice: 7999999,
      minRamGB: 8,
      colors: ['black'],
      requiredProductIds: ['eval-x1'],
      forbiddenProductIds: ALL_ACTIVE_IDS.filter(id => id !== 'eval-x1'),
    },
  },
];

module.exports = { SINGLE_TURN_CASES, validIds, forbiddenIds };
