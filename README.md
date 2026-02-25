# Crypto Trade Analyzer v2.0

## Deploy (5 min, FREE)

### Step 1: Get Gemini API Key (FREE)
1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key" → Copy it

### Step 2: Upload ALL files to GitHub repo
Replace ALL files in your repo with these files.

### Step 3: Add API Key in Vercel
1. Vercel → Your project → Settings → Environment Variables
2. Add: GEMINI_API_KEY = your_key
3. Optional: DEEPSEEK_API_KEY, QWEN_API_KEY, ANTHROPIC_API_KEY

### Step 4: Redeploy
Vercel auto-deploys on commit. Or go to Deployments → Redeploy.

## Files
- api/crypto.js — Binance real-time price + funding + OI + L/S
- api/analyze.js — AI proxy (Gemini/DeepSeek/Qwen/Anthropic)
- public/index.html — Trade Analyzer UI
- vercel.json — Config
