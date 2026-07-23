const EVAL_PRODUCTS = [
  {
    _id: 'eval-s1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Titanium Black'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '10 MP telephoto' }, front: '12 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom'] },
      battery: { capacity: '5000 mAh', charging: { wired: '25W', wireless: '15W' } },
      processor: { chipset: 'Exynos 2400', cpu: '10-core', gpu: 'Xclipse 940' },
      screen: { size: '6.2 inch', technology: 'Dynamic AMOLED 2X 120Hz' },
      weight: '167 g',
    },
  },
  {
    _id: 'eval-s2', name: 'Galaxy A15', brand: 'samsung', price: 4_990_000, inStock: 10, isActive: true,
    specs: {
      memory: { ram: '6 GB', storage: '128 GB' },
      colors: ['Blue'],
      camera: { rear: { primary: '50 MP', secondary: '5 MP ultrawide' }, front: '13 MP', features: ['Night mode'] },
      battery: { capacity: '5000 mAh', charging: { wired: '25W' } },
      processor: { chipset: 'MediaTek Helio G99' },
      screen: { size: '6.5 inch', technology: 'Super AMOLED' },
      weight: '200 g',
    },
  },
  {
    _id: 'eval-s3', name: 'Galaxy Z Fold6', brand: 'samsung', price: 42_990_000, inStock: 2, isActive: true,
    specs: {
      memory: { ram: '12 GB', storage: '512 GB' },
      colors: ['Natural Titanium'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '10 MP telephoto' }, front: '10 MP', features: ['OIS', 'Night mode', 'Portrait mode', '8K video', 'Optical zoom'] },
      battery: { capacity: '4400 mAh', charging: { wired: '25W', wireless: '15W' } },
      processor: { chipset: 'Snapdragon 8 Gen 3', cpu: '8-core', gpu: 'Adreno 750' },
      screen: { size: '7.6 inch', technology: 'Dynamic AMOLED 2X 120Hz' },
      weight: '239 g',
    },
  },
  {
    _id: 'eval-s4', name: 'Galaxy A05', brand: 'samsung', price: 2_990_000, inStock: 0, isActive: true,
    specs: {
      memory: { ram: '4 GB', storage: '64 GB' },
      colors: ['Black'],
      camera: { rear: { primary: '50 MP' }, front: '8 MP', features: [] },
      battery: { capacity: '5000 mAh', charging: { wired: '15W' } },
      screen: { size: '6.7 inch' },
      weight: '195 g',
    },
  },
  {
    _id: 'eval-a1', name: 'iPhone 15 Pro Max', brand: 'apple', price: 28_990_000, inStock: 1, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Natural Titanium'],
      camera: { rear: { primary: '48 MP', secondary: '12 MP ultrawide', tertiary: '12 MP telephoto' }, front: '12 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'ProRAW'] },
      battery: { capacity: '4422 mAh', charging: { wired: '27W', wireless: '15W' } },
      processor: { chipset: 'A17 Pro', cpu: '6-core', gpu: '6-core GPU' },
      screen: { size: '6.7 inch', technology: 'Super Retina XDR OLED 120Hz' },
      weight: '221 g',
    },
  },
  {
    _id: 'eval-a2', name: 'iPhone 16 Pro', brand: 'apple', price: 29_990_000, inStock: 3, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Silver'],
      camera: { rear: { primary: '48 MP' }, front: '12 MP', features: ['Night mode', 'Portrait mode'] },
      battery: { capacity: '4500 mAh', charging: { wired: '30W' } },
      screen: { size: '6.3 inch' },
      weight: '199 g',
    },
  },
  {
    _id: 'eval-a3', name: 'iPhone SE', brand: 'apple', price: 10_000_000, inStock: 5, isActive: true,
    specs: {
      memory: { ram: '4 GB', storage: '64 GB' },
      colors: ['Midnight'],
      camera: { rear: { primary: '12 MP' }, front: '7 MP', features: ['Portrait mode'] },
      battery: { capacity: '2018 mAh', charging: { wired: '18W', wireless: '7.5W' } },
      processor: { chipset: 'A15 Bionic' },
      screen: { size: '4.7 inch' },
      weight: '148 g',
    },
  },
  {
    _id: 'eval-x1', name: 'Redmi Note 13', brand: 'xiaomi', price: 6_990_000, inStock: 8, isActive: true,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Black'],
      camera: { rear: { primary: '108 MP', secondary: '8 MP ultrawide', tertiary: '2 MP' }, front: '16 MP', features: ['Night mode'] },
      battery: { capacity: '5000 mAh', charging: { wired: '33W' } },
      screen: { size: '6.67 inch' },
      weight: '188 g',
    },
  },
  {
    _id: 'eval-x2', name: 'Xiaomi 14T', brand: 'xiaomi', price: 12_990_000, inStock: 2, isActive: true,
    specs: {
      memory: { ram: '12 GB', storage: '256 GB' },
      colors: ['Titanium Black'],
      camera: { rear: { primary: '50 MP', secondary: '12 MP ultrawide', tertiary: '50 MP telephoto' }, front: '32 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'Leica'] },
      battery: { capacity: '5000 mAh', charging: { wired: '67W', wireless: '50W' } },
      processor: { chipset: 'MediaTek Dimensity 9300+', cpu: '8-core', gpu: 'Immortalis-G720' },
      screen: { size: '6.67 inch', technology: 'AMOLED 144Hz' },
      weight: '195 g',
    },
  },
  {
    _id: 'eval-n1', name: 'OnePlus 12', brand: 'oneplus', price: 22_990_000, inStock: 6, isActive: true,
    specs: {
      memory: { ram: '16 GB', storage: '512 GB' },
      colors: ['Black'],
      camera: { rear: { primary: '50 MP', secondary: '48 MP ultrawide', tertiary: '64 MP periscope' }, front: '32 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'Hasselblad'] },
      battery: { capacity: '5400 mAh', charging: { wired: '100W', wireless: '50W' } },
      processor: { chipset: 'Snapdragon 8 Gen 3', cpu: '8-core', gpu: 'Adreno 750' },
      screen: { size: '6.82 inch', technology: 'LTPO AMOLED 120Hz' },
      weight: '220 g',
    },
  },
  {
    _id: 'eval-g1', name: 'Pixel 9 Pro', brand: 'google', price: 26_990_000, inStock: 3, isActive: true,
    specs: {
      memory: { ram: '16 GB', storage: '512 GB' },
      colors: ['Gold'],
      camera: { rear: { primary: '50 MP', secondary: '48 MP ultrawide', tertiary: '48 MP telephoto' }, front: '10.5 MP', features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom', 'Magic Eraser'] },
      battery: { capacity: '4700 mAh', charging: { wired: '30W', wireless: '23W' } },
      processor: { chipset: 'Tensor G4', cpu: '8-core', gpu: 'Mali-G715' },
      screen: { size: '6.3 inch', technology: 'OLED 120Hz' },
      weight: '199 g',
    },
  },
  {
    _id: 'eval-i1', name: 'Old Samsung', brand: 'samsung', price: 1_000_000, inStock: 0, isActive: false,
    specs: {
      memory: { ram: '2 GB', storage: '16 GB' },
      colors: ['Red'],
      camera: { rear: { primary: '8 MP' }, features: [] },
      battery: { capacity: '1500 mAh' },
      screen: { size: '4.0 inch' },
      weight: '120 g',
    },
  },
  {
    _id: 'eval-m1', name: 'No Specs Phone', brand: 'xiaomi', price: 2_000_000, inStock: 5, isActive: true, specs: null,
  },
];

function getProductById(id) {
  return EVAL_PRODUCTS.find(p => p._id === id) || null;
}

function getProductsByIds(ids) {
  return ids.map(id => getProductById(id)).filter(Boolean);
}

function filterProducts(predicate) {
  return EVAL_PRODUCTS.filter(predicate);
}

module.exports = { EVAL_PRODUCTS, getProductById, getProductsByIds, filterProducts };
