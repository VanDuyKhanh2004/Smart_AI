const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const { generateEmbedding } = require('../utils/openai');

const MONGO_URI = process.env.MONGO_CONNECTION_STRING;
const BATCH_SIZE = 5;

if (!MONGO_URI) {
  console.error('MONGO_CONNECTION_STRING not set');
  process.exit(1);
}

const productSchema = new mongoose.Schema(
  {
    name: { type: String },
    brand: { type: String },
    embedding_vector: { type: [Number] },
  },
  { strict: false, collection: 'products' },
);

const Product = mongoose.model('MigrationProduct', productSchema);

async function rebuildProduct(product) {
  const descriptionParts = [];

  if (product.name) descriptionParts.push(product.name);
  if (product.brand) descriptionParts.push(product.brand);
  if (product.price != null) descriptionParts.push(String(product.price));
  if (product.description) descriptionParts.push(product.description);

  const specs = product.specs;
  if (specs && typeof specs === 'object') {
    for (const key of Object.keys(specs)) {
      const val = specs[key];
      if (val && typeof val === 'object') {
        for (const sub of Object.keys(val)) {
          if (val[sub]) descriptionParts.push(String(val[sub]));
        }
      } else if (val) {
        descriptionParts.push(String(val));
      }
    }
  }

  const text = descriptionParts.join('. ');
  const embedding = await generateEmbedding(text);

  product.embedding_vector = embedding;
  await product.save({ validateBeforeSave: false });
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const total = await Product.countDocuments({});
  console.log(`Total products: ${total}\n`);

  const cursor = Product.find({}).cursor();
  let success = 0;
  let failed = 0;
  let processed = 0;

  for await (const product of cursor) {
    try {
      await rebuildProduct(product);
      success++;
    } catch (err) {
      console.error(`  FAILED [${product._id}] ${product.name || 'unnamed'}: ${err.message}`);
      failed++;
    }

    processed++;

    if (processed % BATCH_SIZE === 0 || processed === total) {
      console.log(`Progress: ${processed}/${total} (OK: ${success}, ERR: ${failed})`);
    }
  }

  console.log('\n=== Final Statistics ===');
  console.log(`  Total  : ${total}`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed : ${failed}`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
