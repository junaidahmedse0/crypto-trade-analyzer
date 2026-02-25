# Crypto Trade Analyzer v3.0 — 100% Real Data

## What's New in v3
- ALL indicators calculated from REAL Binance candle data (RSI, EMA, ADX, SSL)
- Fear/Greed Index from Alternative.me API (EXACT)
- Open Interest EXACT from Binance Futures
- Long/Short Ratio + Top Trader Ratio from Binance
- Taker Buy/Sell volume dominance
- OI change tracking (increasing/decreasing)
- AI receives VERIFIED data — no more guessing

## Deploy (5 min)
1. Get Gemini API Key FREE: https://aistudio.google.com/apikey
2. Replace ALL files in GitHub repo
3. Vercel → Settings → Environment Variables → GEMINI_API_KEY
4. Auto-deploy done!

## Data Sources
- Price: Binance Spot (4 mirror endpoints + CoinGecko fallback)
- Funding Rate: Binance Futures /fapi/v1/premiumIndex
- Open Interest: Binance Futures /fapi/v1/openInterest
- L/S Ratio: Binance Futures /futures/data/globalLongShortAccountRatio
- Top Traders: Binance Futures /futures/data/topLongShortPositionRatio
- Taker Volume: Binance Futures /futures/data/takerlongshortRatio
- RSI/EMA/ADX/SSL: Calculated from Binance kline candles (4H + Daily)
- Fear/Greed: Alternative.me /fng API
- News/Whale: AI web search (Gemini Google Search)
