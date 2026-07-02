#!/usr/bin/env python3
"""
Offline intent classifier evaluator.

Usage:
  python scripts/evaluate_intent_offline.py test_intent_dataset.jsonl

Expects a JSONL file where each line is: {"text": "...", "label": "product_query|small_talk|complaint"}

Trains a simple TF-IDF + LogisticRegression classifier and prints metrics.
"""
import sys
import os
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score


def load_jsonl(path):
    samples = []
    with open(path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get('text') or obj.get('message') or obj.get('query')
                label = obj.get('label')
                if text and label:
                    samples.append((text, label))
            except Exception as e:
                print(f'Warning: skipping invalid JSON at line {i}: {e}')
    return samples


def main():
    if len(sys.argv) < 2:
        print('Usage: python scripts/evaluate_intent_offline.py dataset.jsonl')
        sys.exit(1)

    dataset_path = Path(sys.argv[1])
    if not dataset_path.exists():
        print('Dataset not found:', str(dataset_path))
        sys.exit(1)

    samples = load_jsonl(dataset_path)
    if len(samples) < 5:
        print('Need at least 5 labeled samples. Found:', len(samples))
        sys.exit(1)

    texts, labels = zip(*samples)
    labels = list(labels)

    # Simple label set validation
    allowed = set(['product_query', 'small_talk', 'complaint'])
    invalid = [l for l in labels if l not in allowed]
    if invalid:
        print('Found invalid labels (allowed: product_query, small_talk, complaint):', set(invalid))
        sys.exit(1)

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    vect = TfidfVectorizer(ngram_range=(1,2), max_features=10000)
    Xtr = vect.fit_transform(X_train)
    Xte = vect.transform(X_test)

    clf = LogisticRegression(max_iter=1000)
    clf.fit(Xtr, y_train)

    ypred = clf.predict(Xte)

    acc = accuracy_score(y_test, ypred)
    print(f'Test samples: {len(y_test)}')
    print(f'Accuracy: {acc*100:.2f}%')
    print('\nClassification report:')
    print(classification_report(y_test, ypred, digits=4))
    print('\nConfusion matrix (rows=gold, cols=pred):')
    print(confusion_matrix(y_test, ypred, labels=['product_query','small_talk','complaint']))


if __name__ == '__main__':
    main()
