// rule_evaluate_intent.js
const fs = require("fs");
const path = require("path");

const datasetPath =
  process.argv[2] || path.join(__dirname, "..", "test_intent_dataset.jsonl");
if (!fs.existsSync(datasetPath)) {
  console.error("Dataset không tìm thấy:", datasetPath);
  process.exit(1);
}

const lines = fs
  .readFileSync(datasetPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const samples = lines
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const labels = ["product_query", "small_talk", "complaint"];
const confusion = {};
labels.forEach((a) => {
  confusion[a] = {};
  labels.forEach((b) => (confusion[a][b] = 0));
});

const classifyRule = (text) => {
  if (!text) return "product_query";
  const t = text.toLowerCase();
  // complaint keywords
  if (
    /\b(lỗi|bị lỗi|hỏng|khiếu nại|đổi|trả hàng|phàn nàn|sao chép|không hoạt động)\b/.test(
      t,
    )
  )
    return "complaint";
  // small talk keywords
  if (/\b(chào|xin chào|hi|hello|cảm ơn|thanks|bn|bạn khỏe)\b/.test(t))
    return "small_talk";
  // default
  return "product_query";
};

let total = 0,
  correct = 0;
for (const s of samples) {
  total++;
  const gold = s.label;
  const pred = classifyRule(s.text || s.message || s.query || "");
  if (!labels.includes(gold)) continue;
  if (pred === gold) correct++;
  confusion[gold][pred] = (confusion[gold][pred] || 0) + 1;
}

const acc = total ? correct / total : 0;
console.log(
  "Total:",
  total,
  "Correct:",
  correct,
  "Accuracy:",
  (acc * 100).toFixed(2) + "%",
);
console.log("Confusion matrix (gold → pred):");
console.table(confusion);
