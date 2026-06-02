'use client';

import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import type { OcrResult } from '@/lib/types';

// Known Singapore restaurant/store names for matching
const STORE_NAMES = [
  'Haidilao', '海底捞', 'Din Tai Fung', '鼎泰丰', 'Imperial Treasure', '御宝',
  'Beauty in the Pot', 'Jumbo Seafood', '珍宝海鲜', 'Peach Garden', '桃园',
  'Putien', '莆田', 'Soup Restaurant', "Swensen's", 'Pizza Hut', 'KFC',
  "McDonald's", 'Starbucks', 'Coffee Bean', 'Gong Cha', '贡茶', 'LiHo',
  'Koi', 'Sharetea', 'Ippudo', '一風堂', 'Gyukaku', '牛角', 'Sukiya',
  'Pepper Lunch', 'Coco Ichibanya', 'Sakae Sushi', 'Genki Sushi',
  'Sheng Siong', '昇菘', 'NTUC FairPrice', 'FairPrice', 'Cold Storage',
  'Giant', 'Watsons', 'Guardian', 'DBS', 'POSB', 'OCBC', 'UOB',
  'Grab', 'Shopee',
];

async function ocrScreenshotLocal(imageData: string): Promise<OcrResult> {
  // Use createWorker for line-level bounding boxes
  let sizedLines: Array<{ text: string; height: number; y0: number }> = [];
  try {
    const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
    const ret = await worker.recognize(imageData, {}, { text: true, blocks: true });
    for (const block of (ret.data.blocks || [])) {
      for (const para of (block.paragraphs || [])) {
        for (const line of (para.lines || [])) {
          if (line.bbox) {
            sizedLines.push({
              text: line.text.trim(),
              height: line.bbox.y1 - line.bbox.y0,
              y0: line.bbox.y0,
            });
          }
        }
      }
    }
    await worker.terminate();
  } catch {
    // fallback
  }

  const result = await Tesseract.recognize(imageData, 'eng', { logger: () => {} });
  const text = result.data.text;
  const confidence = result.data.confidence / 100;

  // Sort lines by height (largest first)
  sizedLines.sort((a, b) => b.height - a.height);

  // Build "large text" — lines taller than 1.5x median
  const heights = sizedLines.map(l => l.height).filter(h => h > 0);
  const medianHeight = heights.length > 0 ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 0;
  const largeLines = sizedLines.filter(l => l.height > medianHeight * 1.5);
  const largeText = largeLines.map(l => l.text).join(' ');

  // Extract store name
  let storeName: string | null = null;
  for (const name of STORE_NAMES) {
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(text)) {
      storeName = name;
      break;
    }
  }
  if (!storeName && largeLines.length > 0) {
    const nameLine = largeLines.find(l =>
      l.text.length > 2 && !l.text.match(/SGD|\$|\d{2,}/i) && !l.text.match(/^(successful|completed|paid|sent)/i)
    );
    if (nameLine) storeName = nameLine.text;
  }

  // Extract balance — large text first
  let balance: number | null = null;
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

  return { storeName, balance, bonusBalance, currency, expiryDate, rawText: text, confidence };
}

interface OcrUploaderProps {
  onResult: (result: OcrResult) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string) => void;
}

export default function OcrUploader({ onResult, onLoading, onError }: OcrUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Convert to data URL for tesseract
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = (ev) => resolve(ev.target?.result as string);
      r.readAsDataURL(file);
    });

    onLoading(true);
    onError('');
    try {
      const result = await ocrScreenshotLocal(dataUrl);
      onResult(result);
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