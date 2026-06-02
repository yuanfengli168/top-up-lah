# Top Up Lah — Design Document

## Overview

**Top Up Lah** is a mobile-first PWA that helps Singapore residents track stored-value balances across restaurants. Users upload a screenshot of their balance, OCR extracts key info, and a dashboard shows all balances at a glance.

---

## User Flow

### First Upload (Create)

```
User opens app → Google Login (AuthKit)
  → Dashboard (empty) → "Add a card" button
  → Upload screenshot or enter manually
  → OCR processes screenshot
  → Shows extracted: Store name, Balance, Bonus, Expiry
  → User confirms/edits → Saved to Firestore
  → Dashboard now shows the card
```

### Subsequent Upload (Update)

```
User opens app → Dashboard shows cards
  → Tap a card → "Update balance" button
  → Upload new screenshot or enter manually
  → OCR extracts new balance
  → User confirms → Balance updated, history entry added
  → Dashboard reflects new balance
```

### View History

```
User taps a card → Card detail view
  → Shows: current balance, total top-up, total spent, total saved
  → Transaction history (top-ups and spends)
  → Expiry countdown (if applicable)
```

---

## Data Model

### Firestore Collections

```
users/{uid}
  ├── profile (auto-created by AuthKit)
  ├── savedKeys/ (AuthKit)
  └── cards/{cardId}
        ├── storeName: string          // "Haidilao", "Din Tai Fung"
        ├── balance: number             // current balance in cents (SGD)
        ├── bonusBalance: number        // bonus/promo balance in cents
        ├── totalTopUp: number          // total amount topped up in cents
        ├── totalBonus: number          // total bonus received in cents
        ├── totalSpent: number          // total amount spent in cents
        ├── currency: string           // "SGD" (default)
        ├── expiryDate: string | null   // ISO date or null
        ├── lastUpdated: string         // ISO timestamp
        ├── lastScreenshotUrl: string | null  // Firebase Storage URL
        ├── createdAt: string           // ISO timestamp
        └── history/{entryId}
              ├── type: "topup" | "spend" | "adjustment"
              ├── amount: number         // in cents
              ├── balanceAfter: number   // balance after this entry
              ├── note: string           // optional note
              ├── screenshotUrl: string | null
              ├── ocrRawText: string | null
              └── date: string           // ISO timestamp

```

### Why cents?

All monetary values stored as integers (cents) to avoid floating point issues. Display as SGD X.XX in the UI.

---

## Screens / Components

### 1. Login Screen
- AuthKit inline login
- Google OAuth (popup)
- Brand: "Top Up Lah 🇸🇬" with tagline

### 2. Dashboard (Home)
- Summary card: total balance across all stores, total saved
- List of store cards, each showing:
  - Store name + emoji/icon
  - Current balance (large)
  - Bonus balance (smaller, if > 0)
  - Expiry badge (if < 30 days, show red)
  - Last updated timestamp
- FAB: "Add card" button (camera icon)
- Pull to refresh

### 3. Add Card / Update Balance
- Two tabs: "Upload Screenshot" | "Enter Manually"
- **Screenshot flow:**
  1. Camera or gallery picker
  2. Image preview with crop option
  3. OCR processes → shows extracted fields
  4. User confirms/edits fields
  5. If store name matches existing card → offer to update instead of create
  6. Save to Firestore
- **Manual entry flow:**
  1. Form: Store name, Balance, Bonus, Expiry date
  2. Save to Firestore

### 4. Card Detail
- Current balance (large)
- Bonus balance
- Progress bar: spent vs total top-up
- "Savings" badge: "You saved $X.XX" or "You got $X.XX free credit"
- Expiry countdown
- Action buttons: "Update balance", "Add spend", "Delete card"
- Transaction history list (top-ups and spends)

### 5. Settings
- AuthKit settings page (profile, linked accounts)
- Data export (JSON)
- About / feedback

---

## OCR Strategy

Adapted from [auto-settle](https://github.com/yuanfengli168/auto-settle)'s large-font detection:

1. **Image preprocessing** — resize if too large, enhance contrast
2. **Large-font detection** — extract line-level bounding boxes, lines > 1.5x median height are "large text"
3. **Store name extraction** — look for known Singapore restaurant names in OCR text first, then fall back to large text
4. **Balance extraction** — search large text first for currency patterns (SGD X.XX, $X.XX), then all text
5. **Bonus extraction** — look for "bonus", "free", "extra", "+X.XX" patterns
6. **Expiry extraction** — date patterns near "expir", "valid until", "valid till"

### Known Store Patterns (for future improvement)

Common Singapore restaurants with stored-value programs:
- Haidilao 海底捞
- Din Tai Fung 鼎泰丰
- Imperial Treasure 御宝
- Beauty in the Pot 美美锅
- Jumbo Seafood 珍宝海鲜
- Peach Garden 桃园
- Putien 莆田
- Soup Restaurant
- Swensen's
- Pizza Hut

These can be used as a lookup dictionary for fuzzy store name matching.

---

## API / Data Flow

### Upload Screenshot

```
Client                          Server (Next.js API)
  │                                  │
  │── POST /api/ocr ──────────────▶ │
  │   (multipart: image file)       │
  │                                  │── tesseract.js OCR
  │                                  │── Extract: store, balance, bonus, expiry
  │◀── JSON { storeName, balance, ──│
  │    bonus, expiry, rawText }     │
  │                                  │
  │── Save to Firestore ──────────▶ │
  │   (client-side SDK)             │
  │                                  │
```

OCR runs on the server (API route) because tesseract.js needs to download language data (~10MB). Client sends image, server returns extracted data. Client then saves to Firestore.

### Manual Entry

Direct Firestore write from client, no server needed.

---

## PWA Configuration

- **manifest.json**: name, icons, theme color (#FF6B35 — warm orange), standalone display
- **Service Worker**: cache shell assets, IndexedDB for data (v2)
- **Install prompt**: show on first visit for mobile users

---

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // AuthKit managed
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /cards/{cardId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /history/{entryId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }

      match /savedKeys/{keyId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## Deployment (GitHub Pages)

1. `npm run build` → static export
2. GitHub Actions → deploy to `gh-pages` branch
3. Custom domain optional (topuplah.sg?)

### Environment Variables

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

---

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #FF6B35 | Buttons, links, accents |
| Primary Dark | #E85D2C | Hover states |
| Success | #16A34A | Balance positive, savings |
| Warning | #F59E0B | Expiry < 30 days |
| Danger | #DC2626 | Expiry < 7 days, low balance |
| Background | #F9FAFB | Page background |
| Surface | #FFFFFF | Card backgrounds |
| Text | #111827 | Primary text |
| Text Secondary | #6B7280 | Secondary text |
| Font | system-ui, -apple-system | Body font |

---

## Future Considerations (v2+)

- **Offline cache**: IndexedDB with Dexie.js for last 30 days
- **Push notifications**: expiry reminders via Firebase Cloud Messaging
- **Community deals**: shared database of which stores offer top-up bonuses
- **Multi-currency**: handle MYR, USD alongside SGD
- **Barcode/QR scanning**: some stores show balance via QR code
- **Auto-import from email**: parse top-up confirmation emails