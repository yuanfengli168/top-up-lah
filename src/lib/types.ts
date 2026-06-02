// Firestore data types for Top Up Lah

export interface Card {
  id: string;
  storeName: string;
  balance: number;       // in cents (SGD)
  bonusBalance: number;  // bonus/promo balance in cents
  totalTopUp: number;    // total topped up in cents
  totalBonus: number;    // total bonus received in cents
  totalSpent: number;    // total spent in cents
  currency: string;     // "SGD"
  expiryDate: string | null;  // ISO date or null
  lastUpdated: string;   // ISO timestamp
  lastScreenshotUrl: string | null;
  createdAt: string;      // ISO timestamp
}

export interface HistoryEntry {
  id: string;
  cardId: string;
  type: 'topup' | 'spend' | 'adjustment';
  amount: number;        // in cents
  balanceAfter: number;  // balance after this entry
  note: string;
  screenshotUrl: string | null;
  ocrRawText: string | null;
  date: string;          // ISO timestamp
}

export interface OcrResult {
  storeName: string | null;
  balance: number | null;     // in dollars (converted to cents on save)
  bonusBalance: number | null;
  currency: string | null;
  expiryDate: string | null;
  rawText: string;
  confidence: number;
}

// Helper: cents to display string
export function centsToDisplay(cents: number): string {
  return `SGD ${(cents / 100).toFixed(2)}`;
}

// Helper: dollars to cents
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// Helper: cents to dollars
export function centsToDollars(cents: number): number {
  return cents / 100;
}