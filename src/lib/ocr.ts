import Tesseract from 'tesseract.js';
import type { OcrResult } from './types';

// Known Singapore restaurant names for fuzzy matching
const STORE_NAMES = [
  'Haidilao', '海底捞',
  'Din Tai Fung', '鼎泰丰',
  'Imperial Treasure', '御宝',
  'Beauty in the Pot', '美美锅',
  'Jumbo Seafood', '珍宝海鲜',
  'Peach Garden', '桃园',
  'Putien', '莆田',
  'Soup Restaurant',
  'Swensen\'s',
  'Pizza Hut',
  'KFC',
  'McDonald\'s',
  'Starbucks',
  'Coffee Bean',
  'Gong Cha', '贡茶',
  'LiHo',
  'Koi',
  'Sharetea',
  'Twelve Cupcakes',
  'Awfully Chocolate',
  'Burnt Cones',
  'Nakiryu',
  'Tsujita',
  'Ippudo', '一風堂',
  'Tamago-EN',
  'Gyukaku', '牛角',
  'Sukiya', 'すき家',
  'Pepper Lunch',
  'Coco Ichibanya', '咖喱屋',
  'Sakae Sushi',
  'Genki Sushi',
  'Sushi Express',
  'Sheng Siong', '昇菘',
  'NTUC FairPrice',
  'Cold Storage',
  'Giant',
  'Watsons',
  'Guardian',
  'FairPrice Finest',
  'Shopee',
  'Grab',
  'DBS',
  'POSB',
  'OCBC',
  'UOB',
];

export async function ocrScreenshot(imageBuffer: Buffer): Promise<OcrResult> {
  // Use createWorker for line-level bounding boxes (large-font detection)
  let sizedLines: Array<{ text: string; height: number; y0: number }> = [];
  try {
    const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
    const ret = await worker.recognize(imageBuffer, {}, { text: true, blocks: true });
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
    // Fall back to simple recognize
  }

  // Also run simple recognize for full text
  const result = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: () => {},
  });

  const text = result.data.text;
  const confidence = result.data.confidence / 100;

  // Sort lines by height descending (largest font first)
  sizedLines.sort((a, b) => b.height - a.height);

  // Build "large text" — lines taller than 1.5x median
  const heights = sizedLines.map(l => l.height).filter(h => h > 0);
  const medianHeight = heights.length > 0
    ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)]
    : 0;
  const largeLines = sizedLines.filter(l => l.height > medianHeight * 1.5);
  const largeText = largeLines.map(l => l.text).join(' ');

  // Extract store name — search known names first, then large text
  let storeName: string | null = null;
  for (const name of STORE_NAMES) {
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(text)) {
      storeName = name;
      break;
    }
  }
  // Fallback: first large text line that looks like a name
  if (!storeName && largeLines.length > 0) {
    const nameLine = largeLines.find(l =>
      l.text.length > 2 &&
      !l.text.match(/SGD|\$|\d{2,}/i) &&
      !l.text.match(/^(successful|completed|paid|sent)/i)
    );
    if (nameLine) storeName = nameLine.text;
  }

  // Extract balance — large text first, then all text
  let balance: number | null = null;
  const balancePatterns = [
    /SGD\s*(\d+\.?\d*)/i,
    /\$\s*(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*SGD/i,
    /(\d+\.\d{2})/,
  ];

  for (const pattern of balancePatterns) {
    const match = largeText.match(pattern);
    if (match) {
      balance = parseFloat(match[1]);
      break;
    }
  }
  if (balance === null) {
    for (const pattern of balancePatterns) {
      const match = text.match(pattern);
      if (match) {
        balance = parseFloat(match[1]);
        break;
      }
    }
  }

  // Extract currency
  let currency: string | null = null;
  if (/SGD/i.test(text)) currency = 'SGD';
  else if (/USD/i.test(text)) currency = 'USD';
  else if (/CNY/i.test(text)) currency = 'CNY';
  else if (/\$/i.test(text)) currency = 'SGD';

  // Extract bonus — look for "+X.XX" or "free X" or "bonus X" patterns
  let bonusBalance: number | null = null;
  const bonusPatterns = [
    /(?:free|bonus|extra|credit)\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /\+\s*(?:SGD|\$)?\s*(\d+\.?\d*)/i,
    /(\d+\.?\d*)\s*(?:free|bonus|extra|credit)/i,
  ];
  for (const pattern of bonusPatterns) {
    const match = text.match(pattern);
    if (match) {
      bonusBalance = parseFloat(match[1]);
      break;
    }
  }

  // Extract expiry date
  let expiryDate: string | null = null;
  const expiryPatterns = [
    /(?:expir|valid until|valid till|expir\w*\s*(?:on|date)?)[\s:]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
    /(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:expir|valid)/i,
  ];
  for (const pattern of expiryPatterns) {
    const match = text.match(pattern);
    if (match) {
      expiryDate = match[1];
      break;
    }
  }

  return {
    storeName,
    balance,
    bonusBalance,
    currency,
    expiryDate,
    rawText: text,
    confidence,
  };
}