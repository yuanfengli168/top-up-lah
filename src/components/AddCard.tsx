'use client';

import { useState } from 'react';
import { saveCard } from '@/lib/firestore';
import OcrUploader from './OcrUploader';
import type { OcrResult } from '@/lib/types';
import { dollarsToCents } from '@/lib/types';
import { parseReceiptWithAI, aiResponseToOcrResult } from '@/lib/parseReceipt';

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

  // AI parsing state
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [rawOcrData, setRawOcrData] = useState<{ text: string; lines: Array<{ text: string; bbox?: [number, number, number, number] }> } | null>(null);

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

  function handleRawOcr(data: { text: string; lines: Array<{ text: string; bbox?: [number, number, number, number] }> }) {
    setRawOcrData(data);
  }

  async function handleParseWithAI() {
    if (!rawOcrData) return;
    setAiParsing(true);
    setAiError(null);
    try {
      const aiResult = await parseReceiptWithAI({
        text: rawOcrData.text,
        lines: rawOcrData.lines,
      });
      const ocr = aiResponseToOcrResult(aiResult);
      setOcrResult(ocr);
      if (ocr.storeName) setStoreName(ocr.storeName);
      if (ocr.balance !== null) setBalance(ocr.balance.toString());
      if (ocr.bonusBalance !== null) setBonusBalance(ocr.bonusBalance.toString());
      if (ocr.expiryDate) setExpiryDate(ocr.expiryDate);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'AI parsing failed');
    } finally {
      setAiParsing(false);
    }
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
                onRawOcr={handleRawOcr}
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
                <div className={`rounded-lg p-3 text-sm ${
                  ocrResult.confidence < 0.3
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {ocrResult.confidence < 0.3 ? '⚠️' : '✅'} OCR quality: {Math.round(ocrResult.confidence * 100)}% —{' '}
                  {ocrResult.confidence < 0.3
                    ? 'low confidence. Try a clearer photo or use Manual entry.'
                    : `Detected: ${ocrResult.storeName || 'Unknown store'}, ${ocrResult.balance !== null ? `SGD ${ocrResult.balance}` : 'amount not detected'}`}
                </div>
              )}

              {/* "Parse with AI" button — re-analyzes OCR output via LLM */}
              {rawOcrData && (
                <div className="space-y-2">
                  <button
                    onClick={handleParseWithAI}
                    disabled={aiParsing}
                    className="w-full bg-purple-500 text-white rounded-lg p-3 font-medium hover:bg-purple-600 disabled:bg-gray-300 transition-colors text-sm"
                  >
                    {aiParsing ? '🤖 Asking AI...' : '🤖 Parse with AI (better accuracy)'}
                  </button>
                  {aiError && (
                    <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">
                      AI parse failed: {aiError}. Make sure Ollama is running locally with <code>qwen3:8b</code>.
                    </div>
                  )}
                </div>
              )}

              {/* Debug panel: show raw OCR text + copy button */}
              {rawOcrData && <RawOcrPanel text={rawOcrData.text} lines={rawOcrData.lines} />}
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

function RawOcrPanel({
  text,
  lines,
}: {
  text: string;
  lines: Array<{ text: string; bbox?: [number, number, number, number] }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Format the lines as "L000: text" for easy copy-paste into the LLM prompt
  const formattedLines = lines
    .map((l, i) => {
      const bbox = l.bbox ? ` [x:${Math.round(l.bbox[0])},y:${Math.round(l.bbox[1])}]` : '';
      return `L${i.toString().padStart(3, '0')}${bbox}: ${l.text}`;
    })
    .join('\n');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formattedLines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const textarea = document.createElement('textarea');
      textarea.value = formattedLines;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>🔍 Raw OCR text ({lines.length} lines, confidence: {Math.round((lines.length > 0 ? 1 : 0) * 100)}%)</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="p-3 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-gray-500">
              Useful for debugging OCR mistakes. Click copy to grab the formatted lines.
            </p>
            <button
              onClick={handleCopy}
              className="text-xs bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 transition-colors"
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
          <pre className="bg-white border border-gray-200 rounded p-2 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
            {formattedLines || text || '(no text extracted)'}
          </pre>
        </div>
      )}
    </div>
  );
}