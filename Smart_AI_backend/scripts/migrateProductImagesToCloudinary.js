require('dotenv').config();

const mongoose = require('mongoose');
const crypto = require('crypto');
const Product = require('../models/Product');
const { uploadProductImageIfNeeded } = require('../services/productImageService');
const { getClient } = require('../configs/cloudinary');

const BATCH_CONCURRENCY = 3;

const MIGRATION_NAME = 'v1_migrate_base64_to_cloudinary';
const MIGRATION_VERSION = 'product-images-cloudinary-v1';

function imageChecksum(base64Str) {
  return crypto.createHash('sha256').update(base64Str).digest('hex');
}

async function ensureAuditCollection() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'product_image_migrations' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('product_image_migrations');
  }
}

async function getMigrationRecord(productId) {
  const db = mongoose.connection.db;
  return db.collection('product_image_migrations').findOne({
    migrationName: MIGRATION_NAME,
    migrationVersion: MIGRATION_VERSION,
    productId,
  });
}

async function saveMigrationRecord(record) {
  const db = mongoose.connection.db;
  await db.collection('product_image_migrations').updateOne(
    { migrationName: MIGRATION_NAME, migrationVersion: MIGRATION_VERSION, productId: record.productId },
    { $set: record },
    { upsert: true },
  );
}

async function deleteCloudinaryAsset(publicId, label) {
  const client = getClient();
  if (!client || !publicId) return;
  try {
    await client.uploader.destroy(publicId);
    console.log(`[CLEANUP] Deleted Cloudinary asset ${publicId} (${label})`);
  } catch (err) {
    console.error(`[CLEANUP_FAIL] Could not delete Cloudinary asset ${publicId} (${label}): ${err.message}`);
  }
}

async function migrateSingleProduct(product, { dryRun }) {
  const id = product._id.toString();
  const name = product.name;
  const checksum = imageChecksum(product.image);

  if (!product.image || typeof product.image !== 'string' || !product.image.startsWith('data:image/')) {
    return { status: 'skipped', reason: 'not Base64' };
  }

  if (dryRun) {
    console.log(`[DRY] ${id} — ${name} (would upload Base64 image to Cloudinary)`);
    return { status: 'dry-run' };
  }

  const existing = await getMigrationRecord(id);
  if (existing && existing.status === 'completed') {
    console.log(`[SKIP] ${id} — ${name} (already migrated)`);
    return { status: 'skipped', reason: 'already migrated' };
  }

  let uploadResult;
  try {
    uploadResult = await uploadProductImageIfNeeded(product.image);
  } catch (err) {
    console.error(`[FAIL] ${id} — ${name} (upload failed: ${err.message})`);
    await saveMigrationRecord({
      migrationName: MIGRATION_NAME,
      migrationVersion: MIGRATION_VERSION,
      productId: id,
      originalChecksum: checksum,
      originalByteLength: Buffer.from(product.image, 'utf-8').length,
      status: 'failed',
      error: err.message,
      updatedAt: new Date(),
    });
    return { status: 'failed', error: err.message };
  }

  const { imageUrl: secureUrl, imagePublicId: publicId } = uploadResult;

  const updateResult = await Product.updateOne(
    { _id: product._id, image: product.image },
    { $set: { image: secureUrl, imagePublicId: publicId || null } },
  );

  if (updateResult.modifiedCount === 0) {
    console.error(`[FAIL] ${id} — ${name} (MongoDB update failed: image value changed since read)`);
    await saveMigrationRecord({
      migrationName: MIGRATION_NAME,
      migrationVersion: MIGRATION_VERSION,
      productId: id,
      originalChecksum: checksum,
      originalByteLength: Buffer.from(product.image, 'utf-8').length,
      cloudinarySecureUrl: secureUrl,
      cloudinaryPublicId: publicId,
      status: 'db_update_failed',
      error: 'image value changed since read or product not found',
      updatedAt: new Date(),
    });
    await deleteCloudinaryAsset(publicId, `${id} cleanup after db_update_failed`);
    return { status: 'failed', error: 'MongoDB update failed' };
  }

  await saveMigrationRecord({
    migrationName: MIGRATION_NAME,
    migrationVersion: MIGRATION_VERSION,
    productId: id,
    originalChecksum: checksum,
    originalByteLength: Buffer.from(product.image, 'utf-8').length,
    cloudinarySecureUrl: secureUrl,
    cloudinaryPublicId: publicId,
    status: 'completed',
    updatedAt: new Date(),
  });

  console.log(`[OK] ${id} — ${name} -> ${secureUrl}`);
  return { status: 'completed', secureUrl };
}

async function migrateProductImages({ dryRun = false, limit = Infinity, productId = null } = {}) {
  const connectionString = process.env.MONGO_CONNECTION_STRING;
  if (!connectionString) {
    console.error('MONGO_CONNECTION_STRING is not set');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(connectionString);
  console.log(`Connected to MongoDB — ${dryRun ? 'DRY RUN' : 'LIVE RUN'}`);

  await ensureAuditCollection();

  let filter;
  if (productId) {
    filter = { _id: new mongoose.Types.ObjectId(productId) };
    console.log(`Targeting single product: ${productId}`);
  } else {
    filter = { image: { $regex: /^data:image\// } };
  }

  const totalCount = await Product.countDocuments(filter);
  console.log(`Found ${totalCount} product(s) with Base64 image data`);

  const cursor = Product.find(filter).limit(limit).cursor();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const inFlight = new Set();

  for await (const product of cursor) {
    if (processed >= limit) break;

    const promise = (async () => {
      try {
        const result = await migrateSingleProduct(product, { dryRun });
        if (result.status === 'completed' || result.status === 'dry-run') succeeded++;
        else if (result.status === 'failed') failed++;
        else if (result.status === 'skipped') skipped++;
      } finally {
        processed++;
        inFlight.delete(promise);
      }
    })();

    inFlight.add(promise);

    if (inFlight.size >= BATCH_CONCURRENCY) {
      await Promise.race(inFlight);
    }
  }

  await Promise.allSettled(inFlight);

  const mode = dryRun ? 'DRY RUN' : 'LIVE RUN';
  console.log(`--- ${mode} complete ---`);
  console.log(`Total matched: ${totalCount}`);
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);

  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) || Infinity : Infinity;
const productIdIndex = args.indexOf('--product-id');
const productId = productIdIndex !== -1 ? args[productIdIndex + 1] || null : null;

migrateProductImages({ dryRun, limit, productId }).catch((err) => {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
});
