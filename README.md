# Top Up Lah 🇸🇬

> Singapore restaurant stored-value card tracker — never lose track of your top-up balances again.

## The Problem

Many restaurants in Singapore offer "top up $100, get $120" deals. But keeping track of balances across Haidilao, Imperial Treasure, Beauty in the Pot, Din Tai Fung, and a dozen other places is a nightmare. Each store has its own app, website, or physical card. You forget how much is left, when it expires, or how much you've saved.

## The Solution

**Top Up Lah** lets you upload a screenshot of your stored-value balance, uses OCR to extract the store name and balance, and gives you a single dashboard to track everything.

### Key Features

- 🔐 **Google Login** — via [AuthKit](https://github.com/yuanfengli168/authkit), no new accounts
- 📸 **Screenshot Upload** — take a photo of your balance, OCR does the rest
- ✏️ **Manual Entry** — OCR can't read it? Enter it manually
- 📊 **Dashboard** — see all your store balances, savings, and expiry dates at a glance
- 📜 **History** — track every top-up and spend over time
- 📱 **PWA** — install on your phone, feels like a native app
- 🔒 **Privacy** — your data is yours, stored in your own Firebase project

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js + Tailwind CSS |
| Auth | [AuthKit](https://github.com/yuanfengli168/authkit) (Firebase Auth) |
| Database | Cloud Firestore |
| OCR | tesseract.js (large-font detection, shared with [auto-settle](https://github.com/yuanfengli168/auto-settle)) |
| Hosting | GitHub Pages |
| Caching | IndexedDB (v2) |

## MVP Scope

### v1 — Core Tracking

- [ ] Google Login via AuthKit
- [ ] Upload screenshot → OCR extract store name, balance, bonus info
- [ ] Manual entry fallback
- [ ] Create/update store card records
- [ ] Dashboard: store name, balance, bonus amount, expiry, last updated
- [ ] Top-up & spend history per store
- [ ] PWA installable

### v2 — Enhanced (Post-MVP)

- [ ] IndexedDB offline cache (last 30 days)
- [ ] Expiry reminders / push notifications
- [ ] Savings calculator (how much you saved vs paying cash)
- [ ] Community-shared store deals database
- [ ] Multi-currency support (SGD default)

## Quick Start

```bash
# Clone
git clone https://github.com/yuanfengli168/top-up-lah.git
cd top-up-lah

# Install
npm install

# Configure Firebase
cp .env.example .env.local
# Fill in your Firebase config

# Run
npm run dev
```

## Project Structure

```
top-up-lah/
├── src/
│   ├── app/              # Next.js app router
│   ├── components/        # UI components
│   ├── lib/
│   │   ├── auth.ts        # AuthKit integration
│   │   ├── firebase.ts    # Firebase config
│   │   ├── firestore.ts   # Data access layer
│   │   ├── ocr.ts         # Screenshot OCR logic
│   │   └── types.ts       # TypeScript types
│   └── public/
│       └── manifest.json  # PWA manifest
├── docs/
│   └── DESIGN.md          # Architecture & design doc
├── .env.example
└── README.md
```

## License

MIT