# Top Up Lah — Roadmap & Architecture Decisions

> Living document for milestones, tech choices, and the path from web PWA to native iOS app.

---

## Milestone 1: MVP Web App ✅ (in progress)

**Goal:** Get a working web app to track SG restaurant stored-value balances.

**Status (as of June 2026):**
- [x] Google Sign-In via Firebase Auth (popup + redirect fallback for COOP)
- [x] Dashboard: total balance, card list, expiry warnings
- [x] Add Card: manual entry + screenshot OCR
- [x] Card Detail: top-up / spend / delete + history
- [x] Firestore data model (cents-based, ISO dates)
- [x] Deployed to GitHub Pages via `output: "export"`
- [x] Tesseract.js OCR (in-browser, no API key needed)

**OCR accuracy:** ~70% on well-lit English receipts, ~50% on Chinese / mixed.

**Known issues:**
- Firebase Hosting not deployed (causes COOP issues on `/__/auth/handler`)
- OCR store name matching has false positives (e.g., "POS" matched "POSB")
- Dead deps: `dexie`, `idb` (v2 offline cache — not implemented)
- Dead code: `src/lib/ocr.ts` (server-side OCR — not wired up)
- README mentions `src/lib/auth.ts` that doesn't exist (auth is inline in `page.tsx`)

---

## Milestone 2: LLM-Assisted Receipt Parsing (Option B)

**Goal:** Use a small LLM (Qwen3:7B) server-side to interpret OCR output and return structured fields. Universal, works on any receipt format, including Chinese.

**Architecture (two-stage):**

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Browser    │────▶│ Tesseract.js     │────▶│ /api/parse-      │
│              │     │ (in-browser OCR) │     │  receipt         │
│  image ──────│     │                  │     │  (server route)  │
└──────────────┘     │  text + bboxes   │     │                  │
                     └──────────────────┘     │  Ollama          │
                                              │  Qwen3:7B-INT4   │
                                              │                  │
                                              │  JSON:           │
                                              │  {store,balance, │
                                              │  bonus,date,...} │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ Save to          │
                                              │ Firestore        │
                                              └──────────────────┘
```

**Why two stages:**
- **OCR** is good at reading characters, bad at understanding layout
- **LLM** is good at layout/context, bad at character recognition
- Combined: better than either alone
- Bounding boxes from Tesseract give the LLM spatial reasoning

**Why Qwen3:7B specifically:**
- Multilingual (Chinese + English + Singlish mixes)
- Excellent at structured JSON output / function calling
- 4-bit quantization = ~4.5GB RAM (fits on cheap VPS)
- Apple Silicon optimized (future iOS app)

**Cost:**
- Free in dev (Ollama on local Mac)
- ~$5/mo in prod (Fly.io / Hetzner VPS with 8GB RAM)
- No per-request API cost (vs ~$0.01/image for GPT-4 Vision)

**Privacy:**
- All inference happens on the server we control
- No third-party API calls
- Images not stored by anyone except the user's own Firestore

**Plan:**
1. Add `/api/parse-receipt` Next.js route (breaks `output: "export"`)
2. Deploy backend to Fly.io / Vercel Serverless with Ollama sidecar
3. Add "🤖 Parse with AI" button next to manual entry
4. Send Tesseract output + bounding boxes as structured prompt
5. Return JSON: `{store, balance, bonus, expiryDate, confidence}`

**UI flow:**
- User uploads screenshot
- Tesseract runs in-browser (1-2s)
- Auto-fill fields with regex-based extraction (current behavior)
- Show "🤖 Parse with AI" button if any field is empty or low confidence
- User clicks → 2-3s wait → fields re-populated with LLM results
- User confirms/edits → Save

---

## Milestone 3: Native iOS App (Future)

**Goal:** Move from web PWA to native iOS app. Use on-device LLM for full offline operation + privacy.

**Architecture (single device, fully offline-capable):**

```
┌──────────────────────────────────────────────┐
│  iPhone App (SwiftUI)                        │
│                                              │
│  ┌────────────┐    ┌────────────────────┐    │
│  │ Camera     │───▶│ Apple Vision       │    │
│  │ capture    │    │ Framework (OCR)    │    │
│  └────────────┘    │ 99%+ accuracy,     │    │
│                    │ on-device          │    │
│                    └─────────┬──────────┘    │
│                              │ text + boxes │
│                              ▼              │
│                    ┌────────────────────┐    │
│                    │ MLX / llama.cpp    │    │
│                    │ Qwen3-7B-INT4      │    │
│                    │ ~5 tok/s on A17 Pro│    │
│                    │ ~10 tok/s on A18   │    │
│                    └─────────┬──────────┘    │
│                              │ JSON         │
│                              ▼              │
│                    ┌────────────────────┐    │
│                    │ CloudKit           │    │
│                    │ (free sync,        │    │
│                    │  Apple ID login)   │    │
│                    └────────────────────┘    │
└──────────────────────────────────────────────┘
```

**Why iOS first (not Android):**
- Apple Neural Engine + MLX framework = best on-device LLM perf
- Predictable hardware (5 years of iPhone support)
- Privacy is a strong marketing angle
- You have an iPhone (presumably)

**Why CloudKit (not Firebase) for iOS:**
- Free tier is generous (10GB storage, 200GB transfer, 1M notifications)
- Apple handles auth (Sign in with Apple)
- No per-row costs like Firestore
- Works offline, syncs when online
- iCloud Keychain for credentials

**Migration path from web:**
- Keep Firestore for web users (or migrate)
- Or: Firebase → CloudKit one-time export
- Or: Ship both, let user pick (more code)

**Timeline estimate:**
- iOS dev kit: 2-3 months (SwiftUI basics)
- Apple Vision integration: 1 week
- MLX/LLM integration: 2-3 weeks (this is the hard part)
- CloudKit sync: 1-2 weeks
- App Store review: 1-2 weeks
- Total: ~4-6 months part-time

**Revenue options:**
- Free with 3 cards limit, $2.99 IAP for unlimited
- $0.99 one-time, no ads
- Tip jar (Apple's "Tip Jar" IAP)
- Subscription ($0.99/mo) for cloud sync + AI features

---

## Architectural Principles

1. **Privacy first** — no data leaves device unless user opts in
2. **Offline-first** — must work without internet
3. **No vendor lock-in** — easy to swap OCR engine, LLM, or storage
4. **Small models, big wins** — Qwen3-7B is the sweet spot for SG receipts
5. **Server is optional** — web app works without server, server is enhancement

---

## Tech Stack Decision Log

| Date | Decision | Why |
|---|---|---|
| Jun 2026 | Next.js 16 + Turbopack | Latest stable, fast HMR |
| Jun 2026 | Firebase Auth + Firestore | Free, no server needed, easy PWA deploy |
| Jun 2026 | Tesseract.js in-browser | No API key, no server, good enough for v1 |
| Jun 2026 | signInWithPopup + redirect fallback | COOP issues in some browsers |
| Jun 2026 | Qwen3:7B for receipt parsing (planned) | Best multilingual, small enough for mobile |
| Jun 2026 | Apple Vision + MLX for iOS (planned) | Best on-device OCR + LLM perf |

---

## Open Questions / Backlog

- [ ] How to handle "spend" vs "balance" when OCR picks up both?
  - Current heuristic: pick the LAST "Balance:" label, ignore "Stored Card" amount
  - Future: LLM decides based on context
- [ ] Multi-currency support (USD, MYR, IDR)?
  - v1: SGD only
  - v2: detect currency from text, store as separate field
- [x] ~~Should we log OCR text for ML training later?~~ → No, privacy concern
- [ ] **Backend deployment** — once we removed `output: "export"`, no more GitHub Pages
  - Options: Vercel (free + separate Ollama host) | Fly.io single app (~$10/mo) | own VPS
  - Decision: Fly.io single app (chosen by user for personal use)
- [ ] **LLM model choice** — `qwen3:8b` is current default (was originally `qwen3:7b` in planning)
  - Why Qwen3:8b over Qwen2.5:7b: better JSON output, better multilingual, better Chinese
  - User confirmed Qwen2.5:7b works too, but Qwen3:8b is preferred
  - 5.2GB download, 4-bit quantization

## Option B Implementation — In Progress

- [x] Removed `output: "export"` from `next.config.ts`
- [x] Created `/api/parse-receipt` route with Qwen3:8b prompt
- [x] Created `src/lib/parseReceipt.ts` client helper
- [x] Added `onRawOcr` callback to `OcrUploader.tsx` to expose bounding boxes
- [x] Added "🤖 Parse with AI" button to `AddCard.tsx`
- [x] Updated `.env.example` with `OLLAMA_URL` and `OLLAMA_MODEL`
- [x] Updated `ROADMAP.md` with milestone discussion
- [ ] **TODO: Image preprocessing** (auto-rotate + contrast boost) before Tesseract — improves OCR accuracy on phone photos
- [ ] **TODO: Show raw OCR text** in collapsible debug panel below upload
- [ ] **TODO: Add "Copy raw OCR" button** for testing/manual LLM calls
- [ ] **TODO: Set up Ollama locally** for dev testing (brew install + ollama pull qwen3:8b)
- [ ] **TODO: Deploy to Fly.io** with Next.js + Ollama in one app
- [ ] **TODO: Bounding box optimization** — pass spatial coords to LLM so it can use "top of receipt" / "below Balance:" reasoning

## Milestone 2.5: User-Facing Polish (post Option B)

- [ ] Empty state for OCR (when no receipt detected)
- [ ] Better error messages (Ollama not running, model not pulled, etc.)
- [ ] Loading state for AI parsing (currently 2-5s with no spinner)
- [ ] Show AI reasoning/confidence to user so they can decide to trust it
- [ ] "Why is this wrong?" feedback button to improve heuristics over time

---

## Future Ideas (Backlog)

- 📲 Apple Watch quick-add (Complications)
- 🔔 Local notifications for expiring cards
- 🏪 Community-shared store list (CRDT over CloudKit)
- 💱 Multi-currency with auto-conversion to SGD
- 🧾 Export to CSV / Notion / Excel
- 🤝 Family sharing (shared cards for household)
- 🎨 Themes (per-restaurant colors)
- 📊 Spending analytics (charts over time)
