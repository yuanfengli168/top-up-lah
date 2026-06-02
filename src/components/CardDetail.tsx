'use client';

import { useState, useEffect } from 'react';
import { getCard, getHistory, updateCardBalance, deleteCard } from '@/lib/firestore';
import type { Card, HistoryEntry } from '@/lib/types';
import { centsToDisplay, centsToDollars } from '@/lib/types';

interface CardDetailProps {
  uid: string;
  card: Card;
  onBack: () => void;
  onUpdated: () => void;
}

export default function CardDetail({ uid, card, onBack, onUpdated }: CardDetailProps) {
  const [currentCard, setCurrentCard] = useState<Card>(card);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateType, setUpdateType] = useState<'topup' | 'spend'>('topup');
  const [updateAmount, setUpdateAmount] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    loadData();
  }, [uid, card.id]);

  async function loadData() {
    try {
      const [c, h] = await Promise.all([
        getCard(uid, card.id),
        getHistory(uid, card.id),
      ]);
      if (c) setCurrentCard(c);
      setHistory(h);
    } catch {
      // Card might be deleted
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    const amount = parseFloat(updateAmount);
    if (!amount || amount <= 0) return;

    setSaving(true);
    try {
      const amountCents = Math.round(amount * 100);
      const currentBalanceCents = currentCard.balance;
      let newBalanceCents: number;

      if (updateType === 'topup') {
        newBalanceCents = currentBalanceCents + amountCents;
      } else {
        newBalanceCents = Math.max(0, currentBalanceCents - amountCents);
      }

      await updateCardBalance(
        uid,
        card.id,
        newBalanceCents,
        updateType,
        amountCents,
        updateNote,
      );

      // Refresh
      const updated = await getCard(uid, card.id);
      if (updated) setCurrentCard(updated);
      setHistory(await getHistory(uid, card.id));

      setShowUpdate(false);
      setUpdateAmount('');
      setUpdateNote('');
    } catch (err: unknown) {
      alert('Failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteCard(uid, card.id);
      onUpdated();
    } catch (err: unknown) {
      alert('Failed to delete: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  const totalBalance = currentCard.balance + currentCard.bonusBalance;
  const isExpiringSoon = currentCard.expiryDate && new Date(currentCard.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const isExpired = currentCard.expiryDate && new Date(currentCard.expiryDate) < new Date();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">← Back</button>
        <h2 className="text-xl font-bold text-gray-900">{currentCard.storeName}</h2>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-5 text-white mb-4 shadow-lg">
        <div className="text-sm opacity-90">Current Balance</div>
        <div className="text-3xl font-bold mt-1">{centsToDisplay(totalBalance)}</div>
        {currentCard.bonusBalance > 0 && (
          <div className="text-sm opacity-90 mt-1">
            Main: {centsToDisplay(currentCard.balance)} · Bonus: {centsToDisplay(currentCard.bonusBalance)}
          </div>
        )}
        {currentCard.totalBonus > 0 && (
          <div className="text-sm opacity-90 mt-2">
            💰 You&apos;ve earned {centsToDisplay(currentCard.totalBonus)} in free credit
          </div>
        )}
        {currentCard.expiryDate && (
          <div className={`text-sm mt-2 ${isExpired ? 'text-red-200 font-semibold' : isExpiringSoon ? 'text-yellow-200 font-semibold' : 'opacity-80'}`}>
            {isExpired ? '❌ Expired' : isExpiringSoon ? '⚠️ Expiring soon' : `Expiry: ${currentCard.expiryDate}`}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setUpdateType('topup'); setShowUpdate(true); }}
          className="flex-1 bg-green-500 text-white rounded-lg py-2 font-medium hover:bg-green-600"
        >
          ➕ Top Up
        </button>
        <button
          onClick={() => { setUpdateType('spend'); setShowUpdate(true); }}
          className="flex-1 bg-blue-500 text-white rounded-lg py-2 font-medium hover:bg-blue-600"
        >
          💸 Spend
        </button>
      </div>

      {/* Update form */}
      {showUpdate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-900">
            {updateType === 'topup' ? '➕ Top Up' : '💸 Spend'}
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (SGD)</label>
            <input
              type="number"
              step="0.01"
              value={updateAmount}
              onChange={e => setUpdateAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={updateNote}
              onChange={e => setUpdateNote(e.target.value)}
              placeholder="e.g. lunch with family"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUpdate}
              disabled={!updateAmount || saving}
              className="flex-1 bg-orange-500 text-white rounded-lg py-2 font-medium hover:bg-orange-600 disabled:bg-gray-300"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowUpdate(false); setUpdateAmount(''); setUpdateNote(''); }}
              className="px-4 bg-gray-200 text-gray-700 rounded-lg py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 mb-2">History</h3>
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 p-3">
                <div>
                  <span className="text-sm font-medium">
                    {entry.type === 'topup' ? '➕' : entry.type === 'spend' ? '💸' : '🔄'} {centsToDisplay(entry.amount)}
                  </span>
                  {entry.note && <span className="text-sm text-gray-500 ml-2">{entry.note}</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(entry.date).toLocaleDateString('en-SG')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="pt-4 border-t border-gray-200">
        {confirmDelete ? (
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-red-700 font-medium mb-2">Delete {currentCard.storeName} card?</p>
            <p className="text-sm text-red-600 mb-3">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={saving} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="bg-gray-200 text-gray-700 rounded-lg px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-red-500 text-sm hover:text-red-700"
          >
            🗑 Delete this card
          </button>
        )}
      </div>
    </div>
  );
}