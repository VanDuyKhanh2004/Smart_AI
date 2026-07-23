const { getProductsByIds } = require('./products');

const RANKING_CASES = [
  {
    id: 'ranking-camera-001',
    category: 'ranking',
    query: 'Samsung dưới 15 triệu ưu tiên camera đẹp',
    preferences: { camera: true, battery: false, performance: false, compact: false },
    productPool: ['eval-s2', 'eval-s4'],
    expected: {
      topExpectedId: 'eval-s2',
      pairwisePreferred: [['eval-s2', 'eval-s4']],
    },
  },
  {
    id: 'ranking-battery-002',
    category: 'ranking',
    query: 'điện thoại dưới 12 triệu ưu tiên pin trâu',
    preferences: { camera: false, battery: true, performance: false, compact: false },
    productPool: ['eval-a3', 'eval-x1'],
    expected: {
      topExpectedId: 'eval-x1',
      pairwisePreferred: [['eval-x1', 'eval-a3']],
    },
  },
  {
    id: 'ranking-performance-003',
    category: 'ranking',
    query: 'điện thoại RAM ít nhất 8GB ưu tiên hiệu năng',
    preferences: { camera: false, battery: false, performance: true, compact: false },
    productPool: ['eval-s1', 'eval-s2', 'eval-x2', 'eval-n1', 'eval-g1'],
    expected: {
      topExpectedId: 'eval-n1',
      pairwisePreferred: [['eval-n1', 'eval-s2'], ['eval-x2', 'eval-s2']],
    },
  },
  {
    id: 'ranking-compact-004',
    category: 'ranking',
    query: 'điện thoại nhỏ gọn dưới 15 triệu',
    preferences: { camera: false, battery: false, performance: false, compact: true },
    productPool: ['eval-s2', 'eval-s4', 'eval-a3', 'eval-x1'],
    expected: {
      topExpectedId: 'eval-a3',
      pairwisePreferred: [['eval-a3', 'eval-x1'], ['eval-a3', 'eval-s2']],
    },
  },
  {
    id: 'ranking-camera-battery-005',
    category: 'ranking',
    query: 'điện thoại dưới 20 triệu ưu tiên camera và pin',
    preferences: { camera: true, battery: true, performance: false, compact: false },
    productPool: ['eval-s1', 'eval-x2', 'eval-n1'],
    expected: {
      topExpectedId: 'eval-n1',
    },
  },
];

module.exports = { RANKING_CASES };
