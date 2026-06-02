import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import type { Card, HistoryEntry } from './types';

const CARDS_COLLECTION = 'cards';
const HISTORY_COLLECTION = 'history';

function cardsRef(uid: string) {
  return collection(db(), 'users', uid, CARDS_COLLECTION);
}

function cardDoc(uid: string, cardId: string) {
  return doc(db(), 'users', uid, CARDS_COLLECTION, cardId);
}

function historyRef(uid: string, cardId: string) {
  return collection(db(), 'users', uid, CARDS_COLLECTION, cardId, HISTORY_COLLECTION);
}

function historyDocRef(uid: string, cardId: string, entryId: string) {
  return doc(db(), 'users', uid, CARDS_COLLECTION, cardId, HISTORY_COLLECTION, entryId);
}

export async function getCards(uid: string): Promise<Card[]> {
  const q = query(cardsRef(uid), orderBy('lastUpdated', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Card));
}

export async function getCard(uid: string, cardId: string): Promise<Card | null> {
  const snap = await getDoc(cardDoc(uid, cardId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Card;
}

export async function saveCard(uid: string, card: Partial<Card> & { storeName: string }): Promise<Card> {
  const id = card.id || doc(cardsRef(uid)).id;
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    storeName: card.storeName,
    balance: card.balance ?? 0,
    bonusBalance: card.bonusBalance ?? 0,
    totalTopUp: card.totalTopUp ?? 0,
    totalBonus: card.totalBonus ?? 0,
    totalSpent: card.totalSpent ?? 0,
    currency: card.currency ?? 'SGD',
    expiryDate: card.expiryDate ?? null,
    lastUpdated: now,
    lastScreenshotUrl: card.lastScreenshotUrl ?? null,
    createdAt: card.createdAt ?? now,
  };
  await setDoc(cardDoc(uid, id), data, { merge: true });
  return { id, ...data } as Card;
}

export async function updateCardBalance(
  uid: string,
  cardId: string,
  newBalanceCents: number,
  entryType: 'topup' | 'spend' | 'adjustment',
  amountCents: number,
  note: string = '',
  screenshotUrl: string | null = null,
  ocrRawText: string | null = null
): Promise<void> {
  await updateDoc(cardDoc(uid, cardId), {
    balance: newBalanceCents,
    lastUpdated: new Date().toISOString(),
    ...(screenshotUrl ? { lastScreenshotUrl: screenshotUrl } : {}),
  });

  const entryId = doc(historyRef(uid, cardId)).id;
  await setDoc(historyDocRef(uid, cardId, entryId), {
    type: entryType,
    amount: amountCents,
    balanceAfter: newBalanceCents,
    note,
    screenshotUrl,
    ocrRawText,
    date: new Date().toISOString(),
  });
}

export async function deleteCard(uid: string, cardId: string): Promise<void> {
  const snap = await getDocs(historyRef(uid, cardId));
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
  await deleteDoc(cardDoc(uid, cardId));
}

export async function getHistory(uid: string, cardId: string): Promise<HistoryEntry[]> {
  const q = query(historyRef(uid, cardId), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, cardId, ...d.data() } as HistoryEntry));
}