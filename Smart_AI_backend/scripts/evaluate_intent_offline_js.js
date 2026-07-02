#!/usr/bin/env node
// Offline evaluator (Node.js) using natural Bayes classifier
// Usage: node scripts/evaluate_intent_offline_js.js test_intent_dataset.jsonl

const fs = require('fs');
const path = require('path');
const natural = require('natural');

const datasetPath = process.argv[2] || path.join(__dirname, '..', 'test_intent_dataset.jsonl');
const useCV = !(process.argv.includes('--no-cv'));
const kDefault = 5;

if (!fs.existsSync(datasetPath)) {
  console.error('Dataset not found:', datasetPath);
  process.exit(1);
}

const lines = fs.readFileSync(datasetPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const samples = lines.map((ln, i) => {
  try {
    return JSON.parse(ln);
  } catch (e) {
    console.warn('Skipping invalid JSON at line', i+1);
    return null;
  }
}).filter(Boolean);

if (samples.length < 1) {
  console.error('No valid labeled samples found.');
  process.exit(1);
}

const labels = ['product_query','small_talk','complaint'];
for (const s of samples) {
  if (!s.label || !labels.includes(s.label)) {
    console.error('Invalid or missing label in a sample. Allowed labels:', labels);
    process.exit(1);
  }
}

// shuffle (in-place)
for (let i = samples.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [samples[i], samples[j]] = [samples[j], samples[i]];
}

function zeroConf() {
  const c = {};
  labels.forEach(a => { c[a] = {}; labels.forEach(b => c[a][b] = 0); });
  return c;
}

function addConf(target, other) {
  labels.forEach(a => labels.forEach(b => { target[a][b] += other[a][b] || 0 }));
}

if (useCV) {
  const k = Math.min(kDefault, samples.length);
  const foldSize = Math.floor(samples.length / k);
  let total = 0, correct = 0;
  const confusion = zeroConf();

  for (let fold = 0; fold < k; fold++) {
    const start = fold * foldSize;
    const end = fold === k -1 ? samples.length : start + foldSize;
    const test = samples.slice(start, end);
    const train = samples.slice(0, start).concat(samples.slice(end));

    const classifier = new natural.BayesClassifier();
    train.forEach(s => classifier.addDocument(s.text || s.message || s.query || '', s.label));
    classifier.train();

    const foldConf = zeroConf();
    let foldTotal = 0, foldCorrect = 0;

    test.forEach(s => {
      foldTotal++;
      const gold = s.label;
      const pred = classifier.classify(s.text || s.message || s.query || '') || 'product_query';
      if (pred === gold) foldCorrect++;
      foldConf[gold][pred] = (foldConf[gold][pred] || 0) + 1;
    });

    addConf(confusion, foldConf);
    total += foldTotal; correct += foldCorrect;
    console.log(`Fold ${fold+1}/${k}: ${foldCorrect}/${foldTotal} correct (${(foldTotal? (foldCorrect/foldTotal*100).toFixed(2):0)}%)`);
  }

  const accuracy = total ? (correct/total) : 0;
  console.log('\nOverall Test samples:', total);
  console.log('Overall Correct:', correct);
  console.log('Overall Accuracy:', (accuracy*100).toFixed(2) + '%');
  console.log('\nConfusion matrix (gold → pred):');
  console.table(confusion);

  // classification report
  console.log('\nClassification report:');
  console.log('label\tprecision\trecall\tf1\tsupport');
  labels.forEach(label => {
    const tp = confusion[label][label] || 0;
    const fp = labels.reduce((sum, l) => sum + (confusion[l][label] || 0), 0) - tp;
    const fn = labels.reduce((sum, l) => sum + (confusion[label][l] || 0), 0) - tp;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const support = labels.reduce((sum,l) => sum + (confusion[label][l]||0), 0);
    console.log(`${label}\t${(precision*100).toFixed(2)}%\t${(recall*100).toFixed(2)}%\t${(f1*100).toFixed(2)}%\t${support}`);
  });

} else {
  // previous 80/20 fallback
  const split = Math.max(1, Math.floor(samples.length * 0.8));
  const train = samples.slice(0, split);
  const test = samples.slice(split);

  const classifier = new natural.BayesClassifier();
  train.forEach(s => classifier.addDocument(s.text || s.message || s.query || '', s.label));
  classifier.train();

  let total = 0, correct = 0;
  const confusion = zeroConf();
  test.forEach(s => {
    total++;
    const gold = s.label;
    const pred = classifier.classify(s.text || s.message || s.query || '') || 'product_query';
    if (pred === gold) correct++;
    confusion[gold][pred] = (confusion[gold][pred] || 0) + 1;
  });

  const accuracy = total ? (correct/total) : 0;
  console.log('Test samples:', total);
  console.log('Correct:', correct);
  console.log('Accuracy:', (accuracy*100).toFixed(2) + '%');
  console.log('\nConfusion matrix (gold → pred):');
  console.table(confusion);
}
