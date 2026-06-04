'use client';

import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import type { OcrResult } from '@/lib/types';
import { preprocessImage } from '@/lib/imagePreprocess';

// Known Singapore restaurant/store names for matching
const STORE_NAMES = [
  'Haidilao', '海底捞', 'Din Tai Fung', '鼎泰丰', 'Imperial Treasure', '御宝',
  'Beauty in the Pot', 'Jumbo Seafood', '珍宝海鲜', 'Peach Garden', '桃园',
  'Putien', '莆田', 'Soup Restaurant', "Swensen's", 'Pizza Hut', 'KFC',
  "McDonald's", 'Starbucks', 'Coffee Bean', 'Gong Cha', '贡茶', 'LiHo',
  'Koi', 'Sharetea', 'Ippudo', '一風堂', 'Gyukaku', '牛角', 'Sukiya',
  'Pepper Lunch', 'Coco Ichibanya', 'Sakae Sushi', 'Genki Sushi',
  'Sheng Siong', '昇菘', 'NTUC FairPrice', 'FairPrice', 'Cold Storage',
  'Giant', 'Watsons', 'Guardian', 'Grab', 'Shopee',
  // Chinese / mixed-language stores
  'Qin Ji', 'Qin Ji Rougamo', '肉夹馍', 'Rougamo',
  'Lao Wang', '老王', 'Mei Ling', '美玲', 'Tian Tian', '天天',
  'Crayfish', '小龙虾', 'BBQ', '烧烤', 'Hotpot', '火锅', 'Steam Pot', '蒸锅',
];

interface OcrLine {
  text: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

interface OcrInternalResult {
  result: OcrResult;
  lines: OcrLine[]; // ordered top-to-bottom, with bounding boxes
}

async function ocrScreenshotLocal(imageData: string): Promise<OcrInternalResult> {
  // Use createWorker for line-level bounding boxes
  let sizedLines: Array<{ text: string; height: number; y0: number }> = [];
  try {
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {},
    });
    // Configure Tesseract for receipts: PSM 3 = fully auto. Works well for
    // mixed layouts (logos, itemized lists, totals, footer text).
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
    });
    const ret = await worker.recognize(imageData, {}, { text: true, blocks: true });
    for (const block of (ret.data.blocks || [])) {
      for (const para of (block.paragraphs || [])) {
        for (const line of (para.lines || [])) {
          if (line.bbox) {
            const height = line.bbox.y1 - line.bbox.y0;
            const text = line.text.trim();
            // Keep all non-empty lines; let the LLM/heuristics filter noise
            if (text.length > 0) {
              sizedLines.push({
                text,
                height,
                y0: line.bbox.y0,
              });
            }
          }
        }
      }
    }
    await worker.terminate();
  } catch (err) {
    console.warn('[OCR] Worker initialization failed:', err);
  }

  // Build a single full-text version from sizedLines (top-to-bottom)
  sizedLines.sort((a, b) => a.y0 - b.y0);
  const text = sizedLines.map(l => l.text).join('\n');

  // Quality heuristic: if too many "lines" but few real words, the OCR is broken
  // (typical of low-quality photos, dense Chinese text, or wrong image)
  const totalChars = text.replace(/\s/g, '').length;
  const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
  const alphaRatio = totalChars > 0 ? alphaChars / totalChars : 0;
  let confidence: number;
  if (sizedLines.length === 0) {
    confidence = 0;
  } else if (alphaRatio < 0.1 && totalChars > 50) {
    // Almost no Latin letters — likely failed Chinese/dense/symbol image
    confidence = 0.1;
    console.warn('[OCR] Low quality: very few Latin letters', { totalChars, alphaChars, alphaRatio });
  } else if (sizedLines.length > 40 && totalChars < sizedLines.length * 3) {
    // Too many lines for too little text — fragmentation
    confidence = 0.2;
    console.warn('[OCR] Low quality: fragmented output', { lines: sizedLines.length, totalChars });
  } else {
    confidence = 0.7;
  }

  // Sort lines by height (largest first) for the "large text" detection
  const heightSorted = [...sizedLines].sort((a, b) => b.height - a.height);

  // Build "large text" — lines taller than 1.5x median
  const heights = heightSorted.map(l => l.height).filter(h => h > 0);
  const medianHeight = heights.length > 0
    ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]
    : 0;
  const largeLines = heightSorted.filter(l => l.height > medianHeight * 1.5);
  const largeText = largeLines.map(l => l.text).join(' ');

  // Extract store name — try fuzzy match against known names
  // OCR can mangle chars (Q→ie, M→HD, etc.), so use Levenshtein distance
  let storeName: string | null = null;
  const lowerText = text.toLowerCase();

  // Build word-level tokens for fuzzy sliding-window match
  // (e.g., "Qin Ji Rougamo" should fuzzy-match "QJ ROUGAHD" or "QIN JI ROUGAMO")
  const rawTokens = lowerText.split(/\s+/).filter(t => t.length >= 2);

  // Filter out common receipt keywords that aren't store names
  const receiptKeywords = new Set([
    'pos', 'ref', 'card', 'bill', 'type', 'number', 'member', 'name',
    'date', 'time', 'open', 'closed', 'order', 'dine', 'qty', 'price',
    'total', 'subtotal', 'gst', 'tax', 'cash', 'change', 'inclusive',
    'thank', 'you', 'see', 'again', 'tel', 'email', 'reg', 'no',
    'street', 'road', 'avenue', 'singapore', 'set', 'free', 'item',
    'inclusive', 'inclusive', 'rounding', 'amount', 'paid', 'tip',
    'spending', 'receipt', 'customer', 'server', 'table', 'take',
    'away', 'pickup', 'delivery', 'address', 'unit', 'block',
  ]);
  const tokens = rawTokens.filter(t => !receiptKeywords.has(t.replace(/[^a-z]/g, '')));

  function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const m: number[][] = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          m[i][j] = m[i - 1][j - 1];
        } else {
          m[i][j] = Math.min(
            m[i - 1][j - 1] + 1, // substitution
            m[i][j - 1] + 1,     // insertion
            m[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return m[b.length][a.length];
  }

  // Try each store name; find the one with best (lowest) total edit distance
  // across its constituent words, allowing up to 2 edits per word
  // (with minimum word length to avoid false positives on short tokens)
  let bestStore: { name: string; score: number; position: number } | null = null;
  for (const name of STORE_NAMES) {
    const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (nameWords.length === 0) continue;

    // For single-word store names, search the whole text
    // For multi-word names, try to find a substring of tokens that fuzzy-matches
    if (nameWords.length === 1) {
      const word = nameWords[0];
      // Only match single-word store names if word is long enough
      if (word.length < 4) continue;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].replace(/[^a-z0-9一-鿿]/g, '');
        if (!t || t.length < 4) continue;
        const dist = levenshtein(word, t);
        const maxAllowed = Math.max(1, Math.floor(word.length * 0.3));
        if (dist <= maxAllowed) {
          const score = dist / word.length;
          if (!bestStore || score < bestStore.score) {
            bestStore = { name, score, position: i };
          }
        }
      }
    } else {
      // Sliding window of nameWords.length over tokens
      const winSize = nameWords.length;
      for (let i = 0; i <= tokens.length - winSize; i++) {
        let totalDist = 0;
        for (let w = 0; w < winSize; w++) {
          const t = tokens[i + w].replace(/[^a-z0-9一-鿿]/g, '');
          if (!t || t.length < 3) {
            totalDist = Infinity;
            break;
          }
          const dist = levenshtein(nameWords[w], t);
          const maxAllowed = Math.max(1, Math.floor(nameWords[w].length * 0.3));
          if (dist > maxAllowed) {
            totalDist = Infinity;
            break;
          }
          totalDist += dist;
        }
        if (totalDist !== Infinity) {
          const totalLen = nameWords.reduce((s, w) => s + w.length, 0);
          const score = totalDist / totalLen;
          // Prefer matches that appear earlier in the text (store name is usually near top)
          const positionPenalty = i * 0.01;
          const adjustedScore = score + positionPenalty;
          if (!bestStore || adjustedScore < bestStore.score) {
            bestStore = { name, score: adjustedScore, position: i };
          }
        }
      }
    }
  }

  if (bestStore) {
    storeName = bestStore.name;
  }

  // Fallback: first large text line that looks like a name
  if (!storeName && largeLines.length > 0) {
    const nameLine = largeLines.find(l =>
      l.text.length > 2 &&
      !l.text.match(/SGD|\$|\d{2,}/i) &&
      !l.text.match(/^(successful|completed|paid|sent)/i)
    );
    if (nameLine) storeName = nameLine.text.trim();
  }

  // Extract balance — three-tier strategy:
  //   1. Look for explicit "Balance:" label (most reliable)
  //   2. Look for "Stored Card:" amount but only if there's no Balance label
  //   3. Fall back to large-text / first currency, but EXCLUDE known non-balance lines
  let balance: number | null = null;

  // Tier 1: explicit "Balance:" label — try many SG patterns
  const balanceLabelPatterns: RegExp[] = [
    // English patterns
    /(?:remaining\s+)?balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /(?:card\s+)?balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /(?:available\s+)?balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /current\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /previous\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /new\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /(?:card|stored)\s+value\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /remaining\s+value\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /available\s+(?:stored\s+)?value\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /credit\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /wallet\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    // Chinese patterns
    /余额\s*[:：]?\s*(?:SGD|\$|S\$)?\s*(\d+\.?\d*)/i,
    /卡内余额\s*[:：]?\s*(?:SGD|\$|S\$)?\s*(\d+\.?\d*)/i,
    /剩余\s*[:：]?\s*(?:SGD|\$|S\$)?\s*(\d+\.?\d*)/i,
    // E-wallet / payment app patterns
    /top[\s-]?up\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /account\s+balance\s*[:\-]?\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
  ];

  // Collect ALL matches with their positions, then prefer the LAST one
  // (since receipts often show "Previous: $X, New: $Y" and we want the current)
  const candidates: { value: number; position: number }[] = [];
  for (const pattern of balanceLabelPatterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = parseFloat(m[1]);
      if (!isNaN(value) && value >= 0) {
        candidates.push({ value, position: m.index });
      }
    }
  }
  if (candidates.length > 0) {
    // Prefer "current/new" matches if any (their pattern names start with those words)
    // Otherwise pick the LAST occurrence (most recent / final state)
    candidates.sort((a, b) => b.position - a.position);
    balance = candidates[0].value;
  }

  // Tier 2: "Stored Card: $X.XX" — but this is often the spend, not balance
  // Skip this tier; Tier 1 + Tier 3 are safer

  // Tier 3: search for currency amount but skip lines with "total", "sub", "tax", "gst"
  if (balance === null) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const skipKeywords = /\b(gst|tax|sub\s*total|grand\s*total|total|change|cash|tendered|ref\b|reference|order|qty|price)\b/i;
    const candidatePattern = /(?:SGD|\$)?\s*(\d+\.\d{2})\b/;

    for (const line of lines) {
      if (skipKeywords.test(line)) continue;
      const match = line.match(candidatePattern);
      if (match) {
        const value = parseFloat(match[1]);
        // Reject implausibly small values (< 1.00) — usually tax or item price
        if (value >= 1.00) {
          balance = value;
          break;
        }
      }
    }
  }

  // Tier 4: last-resort fallback to the original large-text strategy
  if (balance === null) {
    const balancePatterns = [
      /SGD\s*(\d+\.?\d*)/i, /\$\s*(\d+\.?\d*)/, /(\d+\.?\d*)\s*SGD/i, /(\d+\.\d{2})/,
    ];
    for (const pattern of balancePatterns) {
      const match = largeText.match(pattern);
      if (match) { balance = parseFloat(match[1]); break; }
    }
    if (balance === null) {
      for (const pattern of balancePatterns) {
        const match = text.match(pattern);
        if (match) { balance = parseFloat(match[1]); break; }
      }
    }
  }

  // Currency
  let currency: string | null = null;
  if (/SGD/i.test(text)) currency = 'SGD';
  else if (/USD/i.test(text)) currency = 'USD';
  else if (/\$/i.test(text)) currency = 'SGD';

  // Bonus
  let bonusBalance: number | null = null;
  const bonusPatterns = [
    /(?:free|bonus|extra|credit)\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /\+\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
  ];
  for (const pattern of bonusPatterns) {
    const match = text.match(pattern);
    if (match) { bonusBalance = parseFloat(match[1]); break; }
  }

  // Expiry
  let expiryDate: string | null = null;
  const expiryPatterns = [
    /(?:expir|valid until|valid till)[\s:]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
    /(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:expir|valid)/i,
  ];
  for (const pattern of expiryPatterns) {
    const match = text.match(pattern);
    if (match) { expiryDate = match[1]; break; }
  }

  // Build lines array for the LLM (ordered top-to-bottom with bounding boxes)
  // Use sizedLines if available (sorted by Y coordinate), else fall back to text lines
  const orderedLines: OcrLine[] = sizedLines.length > 0
    ? [...sizedLines]
        .sort((a, b) => a.y0 - b.y0) // top-to-bottom
        .map(l => ({
          text: l.text,
          bbox: [0, l.y0, 0, l.height] as [number, number, number, number],
        }))
    : text.split('\n')
        .filter(l => l.trim().length > 0)
        .map((l, i) => ({ text: l.trim(), bbox: [0, i * 20, 0, 20] as [number, number, number, number] }));

  return {
    result: { storeName, balance, bonusBalance, currency, expiryDate, rawText: text, confidence },
    lines: orderedLines,
  };
}

interface OcrUploaderProps {
  onResult: (result: OcrResult) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string) => void;
  onRawOcr?: (data: { text: string; lines: OcrLine[] }) => void; // For "Parse with AI" button
}

export default function OcrUploader({ onResult, onLoading, onError, onRawOcr }: OcrUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    // Show preview (use raw file for preview, before preprocessing)
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    onLoading(true);
    onError('');
    try {
      // Preprocess: just auto-rotate (EXIF), optionally resize if huge.
      // No contrast/brightness/grayscale by default — Tesseract usually works
      // best on the original image, and over-processing destroys detail.
      const dataUrl = await preprocessImage(file, {
        maxDimension: 2000,
        // contrast, brightness, grayscale all default to off
      });

      const { result, lines } = await ocrScreenshotLocal(dataUrl);
      onResult(result);
      onRawOcr?.({ text: result.rawText, lines });
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      onLoading(false);
    }
  }

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        className="hidden"
        id="screenshot-upload"
        ref={inputRef}
      />
      <label htmlFor="screenshot-upload" className="cursor-pointer">
        {preview ? (
          <img src={preview} alt="Screenshot" className="max-h-48 mx-auto rounded" />
        ) : (
          <div>
            <div className="text-4xl mb-2">📷</div>
            <p className="text-gray-500">Tap to take a photo or choose from gallery</p>
          </div>
        )}
      </label>
    </div>
  );
}