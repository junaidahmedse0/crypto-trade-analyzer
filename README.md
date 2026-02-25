# 🎯 Crypto Trade Analyzer

**18-Point SL Hunt + EMA/SSL/RSI Dual Strategy AI Analyzer**

Real-time Binance data · AI-powered analysis · Roman Urdu

## 🚀 Deploy on Vercel (FREE — 2 minutes)

### Method 1: GitHub + Vercel (Recommended)

1. **GitHub pe repo banao:**
   - GitHub.com → New Repository → naam: `crypto-trade-analyzer`
   - Saari files upload karo (drag & drop):
     ```
     api/crypto.js
     public/index.html
     vercel.json
     package.json
     ```

2. **Vercel pe deploy karo:**
   - https://vercel.com pe jao
   - "Sign up with GitHub" karo
   - "Add New Project" → apna `crypto-trade-analyzer` repo select karo
   - "Deploy" button press karo
   - ⏳ 30 seconds wait karo
   - ✅ Live URL milega: `https://crypto-trade-analyzer-xxx.vercel.app`

3. **Done!** URL kholo aur use karo

### Method 2: Vercel CLI (Terminal se)

```bash
npm i -g vercel
cd crypto-trade-analyzer
vercel
```

## 📡 Features

| Feature | Source | Status |
|---------|--------|--------|
| Real-time Price | Binance API (backend) | ✅ Exact |
| Funding Rate | Binance Futures API | ✅ Real-time |
| Open Interest | Binance Futures API | ✅ Real-time |
| L/S Ratio | Binance Futures API | ✅ Real-time |
| Fear/Greed Index | alternative.me | ✅ Real-time |
| AI Analysis | Claude Sonnet | ✅ 18-point scoring |
| Manual Price | User input | ✅ Override option |

## 💰 Cost: FREE

- Vercel: Free tier (100K requests/month)
- Binance API: Free, no key needed
- Claude API: Included via artifact

## 📁 File Structure

```
├── api/
│   └── crypto.js       ← Backend: Binance data (serverless)
├── public/
│   └── index.html      ← Frontend: Trade Analyzer
├── vercel.json         ← Vercel config
├── package.json        ← Project config
└── README.md           ← This file
```
