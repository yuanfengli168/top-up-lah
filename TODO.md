# TODO Log

> Living document for active tasks, decisions, and follow-ups.

---

## 🔴 In Progress (Active Work)

- [ ] **Set up Vercel deployment** for top-up-lah
  - [x] Push code to origin/main (commit `866ab64`)
  - [x] Remove `output: "export"` from `next.config.ts`
  - [x] Fix TypeScript build errors (PSM enum, bbox type)
  - [x] `npm run build` succeeds — all 5 routes compile
  - [ ] Connect repo to Vercel (web UI or CLI)
  - [ ] Add 8 env vars in Vercel dashboard
  - [ ] Add Vercel domain to Firebase authorized domains
  - [ ] First public deploy at `top-up-lah.vercel.app`
  - See: conversation thread on Vercel deployment

- [ ] **Set up Ollama locally** for LLM receipt parsing
  - [ ] `brew install ollama`
  - [ ] `ollama serve` in background
  - [ ] `ollama pull qwen3:8b` (5.2GB download)
  - [ ] Test "🤖 Parse with AI" button end-to-end
  - Note: Ollama on `localhost:11434` won't work on Vercel — would need
    to deploy Ollama to Fly.io/VPS and update `OLLAMA_URL`

---

## 🟡 Backlog (Not Started)

### OCR / Receipt Parsing
- [ ] Add "paste from iScreen" fallback — let users paste pre-extracted text
      when Tesseract is bad
- [ ] Try PaddleOCR instead of Tesseract (better Chinese support, ~10MB model)
- [ ] Add image preprocessing to fix EXIF rotation (already done — verify)
- [ ] Add bounding box filtering to remove Tesseract noise lines

### App Features
- [ ] PWA manifest (`public/manifest.json`)
- [ ] PWA icons (replace default Next.js SVGs)
- [ ] Service worker for offline caching
- [ ] Install prompt for mobile users

### Code Cleanup
- [ ] Remove dead deps: `dexie`, `idb` (v2 offline cache — not implemented)
- [ ] Remove dead code: `src/lib/ocr.ts` (server-side OCR — not wired up)
- [ ] Fix README's `auth.ts` reference (auth is inline in `page.tsx`)
- [ ] Update `docs/DESIGN.md` to reflect in-browser OCR + Vercel deploy
- [ ] Fix workspace root warning (`turbopack.root` in `next.config.ts`)

### iOS App (Future — Milestone 3)
- [ ] Create new repo (e.g., `top-up-lah-ios`)
- [ ] Apple Vision framework for OCR (better than Tesseract)
- [ ] MLX integration for on-device Qwen3-8B
- [ ] CloudKit for sync
- [ ] App Store submission

---

## 🟢 Completed (Recent)

- [x] **2026-06-04** Node 18 → 20 (via nvm) for Next.js 16 compatibility
- [x] **2026-06-04** Fixed Tailwind native binding missing (`@tailwindcss/oxide-darwin-arm64`)
- [x] **2026-06-04** Switched from `signInWithPopup` to `signInWithRedirect` (COOP issues)
  - Then back to popup with redirect fallback
- [x] **2026-06-04** Added Levenshtein fuzzy matcher for store names
- [x] **2026-06-04** Added 4-tier balance extraction (Balance: label, large text, etc.)
- [x] **2026-06-04** Added Chinese patterns (余额, 卡内余额, 剩余) for balance detection
- [x] **2026-06-04** Built `/api/parse-receipt` route with Qwen3:8b prompt
- [x] **2026-06-04** Added "🤖 Parse with AI" button in `AddCard.tsx`
- [x] **2026-06-04** Added "🔍 Raw OCR text" debug panel + 📋 Copy button
- [x] **2026-06-04** Added image preprocessing (EXIF rotation, resize to 2000px)
- [x] **2026-06-04** Quality heuristic — flag OCR as low-confidence when output is fragmented
- [x] **2026-06-04** Created `docs/ROADMAP.md` with architecture decisions
- [x] **2026-06-04** Pushed `866ab64` to origin/main

---

## 💭 Discussion: iOS App (New)

> User proposed creating a separate repo for an iPhone app using:
> 1. iPhone's native Vision framework for OCR (much more accurate than Tesseract)
> 2. On-device Qwen3-8B via MLX / Apple Neural Engine

### Why this is a smart move

1. **Apple Vision framework is dramatically better** than Tesseract for the
   same photo. Reasons:
   - Trained on Apple's massive private dataset
   - Native Chinese + English + many other languages
   - Optimized for Apple's hardware (CoreML, Neural Engine)
   - Free, no API cost, no network call
   - ~99% accuracy on receipts (vs ~70% for Tesseract)

2. **Qwen3-8B on iPhone is now realistic**:
   - iPhone 15 Pro / 16 has 8GB+ RAM
   - Apple Neural Engine + GPU = fast inference
   - 4-bit quantized model: ~5GB download
   - 5-15 tokens/sec (good enough for parsing)
   - Fully offline, no privacy concerns

3. **Architecture is clean**:
   - Camera capture → Vision framework → text + bounding boxes (high accuracy)
   - Pass to Qwen3-8B via MLX → structured fields (reliable parsing)
   - Save to CloudKit (free sync via Apple ID)
   - All on-device, no servers, no API costs

### Comparison: Web (current) vs iOS (future)

| | Web (Tesseract) | iOS (Vision + MLX) |
|---|---|---|
| OCR accuracy | ~70% | ~99% |
| Cost | Free | Free |
| Offline | Yes | Yes |
| Privacy | Client-side only | On-device only |
| Multi-platform | Any browser | iPhone only |
| Maintenance | Easy (web) | App Store updates |
| LLM hosting | Need Ollama server | On-device |
| Storage | Firestore (Google) | CloudKit (Apple) |

### Migration path

1. **Now**: Keep building web app, fix Tesseract issues
2. **Later**: Create new repo `top-up-lah-ios` for Swift/SwiftUI app
3. **Optional**: Share business logic via shared TypeScript models
4. **Sunset**: Once iOS app is stable, deprecate web app or keep as backup

### Open questions to discuss

- [ ] Use CloudKit or stay with Firestore for backend?
  - CloudKit: free, Apple ID, iOS only
  - Firestore: same as web, works everywhere
  - Hybrid: Firestore for cross-platform, CloudKit for iOS-native feel

- [ ] Subscription model vs one-time purchase?
  - One-time $2.99 = simple, ~70% margin
  - Free with limits, $0.99/mo for cloud sync = recurring revenue
  - Tip jar = pure goodwill

- [ ] Apple Watch quick-add for adding cards on the go?
  - Complications show current balance
  - Tap to log a top-up

### Decision

- [ ] Create new repo `top-up-lah-ios` (yes / no)
- [ ] Choose backend (CloudKit / Firestore / both)
- [ ] Decide pricing model (free / one-time / subscription)

---

## 🐛 Known Issues

- **Tesseract is unreliable on hard photos** (Chinese, stylized fonts, blurry)
  - Mitigation: LLM assist + manual entry fallback
- **GitHub Pages deploy no longer works** (removed `output: export`)
  - Mitigation: Move to Vercel (in progress)
- **Auth COOP warning in console** (popup auth sometimes shows COOP warning)
  - Mitigation: Works anyway, just a warning
- **Workspace root warning** (parent `package-lock.json` confuses Turbopack)
  - Mitigation: Add `turbopack.root` to `next.config.ts`

---

## 📝 Notes

- Last deploy target: Vercel (in progress)
- Last commit: `866ab64` "put on vercil but not sure if it works better"
- Repo: `https://github.com/yuanfengli168/top-up-lah`
- Firebase project: `ai-idea-generator-d9e15` (reusing existing project)
- Local dev URL: `http://localhost:3000`
- Production URL: TBD (after Vercel deploy)
