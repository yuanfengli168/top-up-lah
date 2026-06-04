// Client-side helper to call /api/parse-receipt

import type { OcrResult } from './types';

export interface ParseReceiptRequest {
  text: string;
  lines?: Array<{ text: string; bbox?: [number, number, number, number] }>;
}

export interface ParseReceiptResponse {
  storeName: string | null;
  balance: number | null;
  bonusBalance: number | null;
  currency: string | null;
  expiryDate: string | null;
  confidence: number;
  reasoning: string;
}

export async function parseReceiptWithAI(
  request: ParseReceiptRequest
): Promise<ParseReceiptResponse> {
  const res = await fetch('/api/parse-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Convert the AI response to the app's OcrResult shape
export function aiResponseToOcrResult(ai: ParseReceiptResponse): OcrResult {
  return {
    storeName: ai.storeName,
    balance: ai.balance,
    bonusBalance: ai.bonusBalance,
    currency: ai.currency,
    expiryDate: ai.expiryDate,
    rawText: '', // already used by tesseract
    confidence: ai.confidence,
  };
}