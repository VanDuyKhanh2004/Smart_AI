#!/usr/bin/env node
// Export recent user messages from MongoDB `conversations` collection to JSONL for labeling.
// Usage: node scripts/export_conversations_for_labeling.js <output.jsonl> [--limit N] [--prelabel]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Conversation = require('../models/Conversation');

const OUT = process.argv[2] || path.join(__dirname, '..', 'export_for_labeling.jsonl');
const LIMIT_ARG = (() => {
  const i = process.argv.indexOf('--limit');
  if (i >= 0 && process.argv[i+1]) return parseInt(process.argv[i+1], 10);
  return 200;
})();
const PRELABEL = process.argv.includes('--prelabel');

const ruleLabel = (text) => {
  if (!text) return 'product_query';
  const t = text.toLowerCase();
  if (/\b(lỗi|bị lỗi|hỏng|khiếu nại|đổi|trả hàng|phàn nàn|không hoạt động)\b/.test(t)) return 'complaint';
  if (/\b(chào|xin chào|hi|hello|cảm ơn|thanks|bạn khỏe)\b/.test(t)) return 'small_talk';
  return 'product_query';
};

async function main() {
  if (!process.env.MONGO_CONNECTION_STRING) {
    console.error('MONGO_CONNECTION_STRING not set in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_CONNECTION_STRING, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const conversations = await Conversation.find({}).sort({ lastMessageAt: -1 }).limit(LIMIT_ARG).lean();
  console.log(`Fetched ${conversations.length} conversations`);

  const out = fs.createWriteStream(OUT, { flags: 'w', encoding: 'utf8' });

  let exported = 0;
  for (const conv of conversations) {
    // export user messages only
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    for (const m of messages) {
      if ((m.role || '').toLowerCase() !== 'user') continue;
      const text = m.content && m.content.trim();
      if (!text) continue;
      const record = { text };
      if (PRELABEL) record.label = ruleLabel(text);
      out.write(JSON.stringify(record, null, 0) + '\n');
      exported++;
    }
  }

  out.end();
  await mongoose.disconnect();
  console.log(`Exported ${exported} user messages to ${OUT}`);
}

main().catch(err => {
  console.error('Export error:', err.message);
  process.exit(1);
});
