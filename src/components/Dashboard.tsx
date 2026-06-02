'use client';

import { useState, useEffect } from 'react';
import { getCards, deleteCard } from '@/lib/firestore';
import type { Card } from '@/lib/types';
import { centsToDisplay, centsToDollars } from '@/lib/types';

interface DashboardProps {
  uid: string;
  onAddCard: () => void;
  onSelectCard: (card: Card) => void;
  refreshKey: number;
}

export default function Dashboard({ uid, onAddCard, onSelectCard, refreshKey }: DashboardProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCards();
  }, [uid, refreshKey]);

  async function loadCards() {
    try {
      setLoading(true);
      setError(null);
      const data = await getCards(uid);
      setCards(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }

  const totalBalance = cards.reduce((sum, c) => sum + c.balance + c.bonusBalance, 0);
  const totalSaved = cards.reduce((sum, c) => sum + c.totalBonus, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-500">Loading cards...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-2">{error}</p>
        <button onClick={loadCards} className="text-orange-600 underline">Try again</button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-5 text-white mb-6 shadow-lg">
        <div className="text-sm opacity-90">Total Balance</div>
        <div className="text-3xl font-bold mt-1">{centsToDisplay(totalBalance)}</div>
        {totalSaved > 0 && (
          <div className="text-sm opacity-90 mt-2">
            💰 You&apos;ve earned {centsToDisplay(totalSaved)} in free credit!
          </div>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={onAddCard}
        className="w-full bg-white border-2 border-dashed border-gray-300 rounded-xl p-4 text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors mb-4"
      >
        ➕ Add a card
      </button>

      {/* Cards list */}
      {cards.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">💳</div>
          <p className="text-gray-500">No cards yet. Add your first stored-value card!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <CardRow key={card.id} card={card} onClick={() => onSelectCard(card)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardRow({ card, onClick }: { card: Card; onClick: () => void }) {
  const totalBalance = card.balance + card.bonusBalance;
  const isExpiringSoon = card.expiryDate && new Date(card.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const isExpired = card.expiryDate && new Date(card.expiryDate) < new Date();

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-orange-200 transition-colors text-left"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-900">{card.storeName}</div>
        <div className="text-lg font-bold text-gray-900">{centsToDisplay(totalBalance)}</div>
      </div>
      {card.bonusBalance > 0 && (
        <div className="text-sm text-green-600 mt-1">
          💰 Includes {centsToDisplay(card.bonusBalance)} bonus
        </div>
      )}
      {card.expiryDate && (
        <div className={`text-xs mt-1 ${isExpired ? 'text-red-600 font-semibold' : isExpiringSoon ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
          {isExpired ? '❌ Expired' : isExpiringSoon ? '⚠️ Expiring soon' : `Expiry: ${card.expiryDate}`}
        </div>
      )}
      <div className="text-xs text-gray-400 mt-1">
        Updated {new Date(card.lastUpdated).toLocaleDateString('en-SG')}
      </div>
    </button>
  );
}