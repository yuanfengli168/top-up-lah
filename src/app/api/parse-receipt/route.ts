// /api/parse-receipt — Server route that uses a small LLM (Qwen3:7B) to
// interpret OCR text from a receipt and return structured fields.
//
// Input:  { text: string, lines?: Array<{text: string, bbox: [x,y,w,h]}> }
// Output: { storeName, balance, bonusBalance, currency, expiryDate, confidence, reasoning }

interface ParseRequest {
  text: string;
  lines?: Array<{ text: string; bbox?: [number, number, number, number] }>;
}

type LineWithBbox = { text: string; bbox?: [number, number, number, number] };

interface ParseResponse {
  storeName: string | null;
  balance: number | null;
  bonusBalance: number | null;
  currency: string | null;
  expiryDate: string | null;
  confidence: number;
  reasoning: string;
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Qwen3:8b is the sweet spot for SG receipts: best JSON output, multilingual (CN+EN),
// ~5.2GB download. Qwen2.5:7b is also a good fallback if Qwen3 isn't available.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

const SYSTEM_PROMPT = `You are a receipt parser for Singapore restaurant stored-value cards.

Your job: extract these fields from OCR text of a receipt:
- storeName: the restaurant/merchant name (e.g., "Qin Ji Rougamo", "Haidilao", "Din Tai Fung")
- balance: the REMAINING stored-value balance in dollars (e.g., 94.56 for "Balance: 94.56")
- bonusBalance: any bonus/free credit balance in dollars (e.g., 10.00 for "Bonus: $10")
- currency: "SGD" by default, "USD" if dollars sign shown without SGD label
- expiryDate: ISO date string (YYYY-MM-DD) if shown, else null
- confidence: 0.0 to 1.0 how confident you are in the parsing
- reasoning: brief 1-sentence explanation of how you parsed it

CRITICAL RULES:
1. The "balance" is the REMAINING value on the card, NOT the charge/total paid.
   - If you see "Stored Card: $5.80, Balance: 94.56" → balance is 94.56, not 5.80
   - "Grand Total" / "Sub Total" / "GST" are NEVER the balance
   - Prefer the LAST "Balance:" line if multiple are shown
2. If a label is ambiguous, prefer the number that looks like a remaining/available amount.
3. Store name is usually near the TOP of the receipt, in larger text.
4. Ignore "POS", "REF", "Bill", "Card" prefixes — those are receipt metadata.
5. If a field can't be determined, return null for that field.
6. Return ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON.`;

// Build a compact prompt with bounding box data so the LLM has spatial context
function buildPrompt(body: ParseRequest): string {
  const lines: LineWithBbox[] = body.lines && body.lines.length > 0
    ? body.lines
    : body.text.split('\n').map(t => ({ text: t }));

  // Format with line numbers and (optional) bbox hints
  const formattedLines = lines
    .filter(l => l.text && l.text.trim().length > 0)
    .slice(0, 200) // cap at 200 lines to avoid context bloat
    .map((l, i) => {
      const bbox = (l.bbox && l.bbox.length >= 2)
        ? ` [x:${Math.round(l.bbox[0])},y:${Math.round(l.bbox[1])}]`
        : '';
      return `L${i.toString().padStart(3, '0')}${bbox}: ${l.text}`;
    })
    .join('\n');

  return `OCR text from a Singapore restaurant receipt (lines are numbered, top of receipt is L000, bottom is last line). Larger text on receipts usually has higher Y coordinates on screen but appears earlier in the document.

${formattedLines}

Return JSON only. Example format:
{"storeName": "...", "balance": 0.00, "bonusBalance": null, "currency": "SGD", "expiryDate": null, "confidence": 0.0, "reasoning": "..."}`;
}

async function callOllama(prompt: string): Promise<ParseResponse> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      format: 'json', // Ollama JSON mode — forces valid JSON output
      options: {
        temperature: 0.1, // low temperature for deterministic parsing
        num_predict: 512,
      },
    }),
    // 60s timeout — LLM calls are slow on CPU
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.message?.content || data.response || '';

  // Parse the JSON response (Ollama JSON mode should guarantee valid JSON)
  let parsed: ParseResponse;
  try {
    parsed = JSON.parse(content);
  } catch {
    // If JSON mode failed, try to extract JSON from the response
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM returned non-JSON: ${content.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  // Sanity check & coerce
  return {
    storeName: typeof parsed.storeName === 'string' ? parsed.storeName.trim() : null,
    balance: typeof parsed.balance === 'number' && parsed.balance >= 0 ? parsed.balance : null,
    bonusBalance: typeof parsed.bonusBalance === 'number' && parsed.bonusBalance >= 0 ? parsed.bonusBalance : null,
    currency: typeof parsed.currency === 'string' ? parsed.currency : 'SGD',
    expiryDate: typeof parsed.expiryDate === 'string' ? parsed.expiryDate : null,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: ParseRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
    return Response.json({ error: 'Missing or empty `text` field' }, { status: 400 });
  }

  try {
    const prompt = buildPrompt(body);
    const result = await callOllama(prompt);
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/parse-receipt] Error:', message);
    return Response.json(
      { error: 'Failed to parse receipt', details: message },
      { status: 500 }
    );
  }
}

// Health check for deployment verification
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    return Response.json({
      status: 'ok',
      ollama: 'reachable',
      model: OLLAMA_MODEL,
      availableModels: data.models?.map((m: { name: string }) => m.name) || [],
    });
  } catch (err: unknown) {
    return Response.json({
      status: 'degraded',
      ollama: 'unreachable',
      model: OLLAMA_MODEL,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 503 });
  }
}