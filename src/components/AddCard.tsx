'use client';

import { useState } from 'react';
import { saveCard } from '@/lib/firestore';
import OcrUploader from './OcrUploader';
import type { OcrResult } from '@/lib/types';
import { dollarsToCents } from '@/lib/types';

interface AddCardProps {
  uid: string;
  onBack: () => void;
  onSaved: () => void;
}

export default function AddCard({ uid, onBack, onSaved }: AddCardProps) {
  const [mode, setMode] = useState<'choose' | 'upload' | 'manual'>('choose');
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [storeName, setStoreName] = useState('');
  const [balance, setBalance] = useState('');
  const [bonusBalance, setBonusBalance] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  function handleOcrResult(result: OcrResult) {
    setOcrResult(result);
    if (result.storeName) setStoreName(result.storeName);
    if (result.balance !== null) setBalance(result.balance.toString());
    if (result.bonusBalance !== null) setBonusBalance(result.bonusBalance.toString());
    if (result.expiryDate) setExpiryDate(result.expiryDate);
  }

  async function handleSave() {
    if (!storeName || !balance) return;
    setSaving(true);
    try {
      const balanceCents = dollarsToCents(parseFloat(balance) || 0);
      const bonusCents = dollarsToCents(parseFloat(bonusBalance) || 0);
      await saveCard(uid, {
        storeName,
        balance: balanceCents,
        bonusBalance: bonusCents,
        totalTopUp: balanceCents,
        totalBonus: bonusCents,
        totalSpent: 0,
        currency: 'SGD',
        expiryDate: expiryDate || null,
      });
      onSaved();
    } catch (err: unknown) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">← Back</button>
        <h2 className="text-xl font-bold text-gray-900">Add Card</h2>
      </div>

      {mode === 'choose' && (
        <div className="space-y-3">
          <button
            onClick={() => setMode('upload')}
            className="w-full bg-orange-500 text-white rounded-xl p-4 font-semibold hover:bg-orange-600 transition-colors"
          >
            📸 Upload Screenshot
          </button>
          <button
            onClick={() => setMode('manual')}
            className="w-full bg-white border border-gray-300 rounded-xl p-4 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ✏️ Enter Manually
          </button>
        </div>
      )}

      {(mode === 'upload' || mode === 'manual') && (
        <div className="space-y-4">
          {mode === 'upload' && (
            <>
              <OcrUploader
                onResult={handleOcrResult}
                onLoading={setOcrLoading}
                onError={setOcrError}
              />
              {ocrLoading && (
                <div className="text-center py-4">
                  <div className="text-lg text-gray-500">🔍 Reading screenshot...</div>
                </div>
              )}
              {ocrError && (
                <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">
                  {ocrError}. Please enter details manually.
                </div>
              )}
              {ocrResult && (
                <div className="bg-green-50 text-green-700 rounded-lg p-3 text-sm">
                  ✅ Detected: {ocrResult.storeName || 'Unknown store'}, {ocrResult.balance !== null ? `SGD ${ocrResult.balance}` : 'amount not detected'}
                </div>
              )}
            </>
          )}

          <CardForm
            storeName={storeName} setStoreName={setStoreName}
            balance={balance} setBalance={setBalance}
            bonusBalance={bonusBalance} setBonusBalance={setBonusBalance}
            expiryDate={expiryDate} setExpiryDate={setExpiryDate}
          />

          <button
            onClick={handleSave}
            disabled={!storeName || !balance || saving}
            className="w-full bg-orange-500 text-white rounded-xl p-4 font-semibold hover:bg-orange-600 disabled:bg-gray-300 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Card'}
          </button>
        </div>
      )}
    </div>
  );
}

function CardForm({
  storeName, setStoreName,
  balance, setBalance,
  bonusBalance, setBonusBalance,
  expiryDate, setExpiryDate,
}: {
  storeName: string; setStoreName: (v: string) => void;
  balance: string; setBalance: (v: string) => void;
  bonusBalance: string; setBonusBalance: (v: string) => void;
  expiryDate: string; setExpiryDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Store Name *</label>
        <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)}
          placeholder="e.g. Haidilao"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Balance (SGD) *</label>
        <input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
          placeholder="0.00"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Bonus Balance (SGD)</label>
        <input type="number" step="0.01" value={bonusBalance} onChange={e => setBonusBalance(e.target.value)}
          placeholder="0.00"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
        <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
    </div>
  );
}