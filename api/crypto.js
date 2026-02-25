// ═══════════════════════════════════════════════════════════════
// CRYPTO PRICE BACKEND — Vercel Serverless Function
// Deploy: Vercel (free tier)
// Fetches Binance real-time data (no CORS issues server-side)
// ═══════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS headers — allow any frontend to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { coin = 'BTC' } = req.query;
  
  const SYMBOLS = {
    BTC:'BTCUSDT', ETH:'ETHUSDT', SOL:'SOLUSDT', BNB:'BNBUSDT',
    XRP:'XRPUSDT', ADA:'ADAUSDT', AVAX:'AVAXUSDT', DOGE:'DOGEUSDT',
    MATIC:'MATICUSDT', DOT:'DOTUSDT', LINK:'LINKUSDT', SHIB:'SHIBUSDT',
    PEPE:'PEPEUSDT', WIF:'WIFUSDT', ARB:'ARBUSDT', SUI:'SUIUSDT',
    TRUMP:'TRUMPUSDT', NEAR:'NEARUSDT', APT:'APTUSDT',
  };
  
  const sym = SYMBOLS[coin.toUpperCase()] || coin.toUpperCase() + 'USDT';
  
  try {
    // Fetch ALL data in parallel from Binance (no CORS on server!)
    const [priceRes, fundingRes, oiRes, lsRes] = await Promise.all([
      // 1. Price + 24h data
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`)
        .then(r => r.json()).catch(() => null),
      
      // 2. Funding rate (futures)
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`)
        .then(r => r.json()).catch(() => null),
      
      // 3. Open Interest (futures)
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`)
        .then(r => r.json()).catch(() => null),
      
      // 4. Long/Short ratio (futures)
      fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=4h&limit=1`)
        .then(r => r.json()).catch(() => null),
    ]);
    
    // Parse price
    const price = priceRes?.lastPrice ? {
      price: parseFloat(priceRes.lastPrice),
      high24: parseFloat(priceRes.highPrice),
      low24: parseFloat(priceRes.lowPrice),
      change24: parseFloat(priceRes.priceChangePercent),
      volume: parseFloat(priceRes.quoteVolume),
      trades: parseInt(priceRes.count),
    } : null;
    
    // Parse funding
    const funding = fundingRes?.lastFundingRate ? {
      rate: parseFloat(fundingRes.lastFundingRate),
      markPrice: parseFloat(fundingRes.markPrice),
      indexPrice: parseFloat(fundingRes.indexPrice),
      nextFundingTime: fundingRes.nextFundingTime,
    } : null;
    
    // Parse OI
    const oi = oiRes?.openInterest ? {
      value: parseFloat(oiRes.openInterest),
      valueUSD: parseFloat(oiRes.openInterest) * (price?.price || 0),
    } : null;
    
    // Parse L/S ratio
    const ls = Array.isArray(lsRes) && lsRes[0] ? {
      longRatio: parseFloat(lsRes[0].longAccount),
      shortRatio: parseFloat(lsRes[0].shortAccount),
      longShortRatio: parseFloat(lsRes[0].longShortRatio),
      timestamp: lsRes[0].timestamp,
    } : null;
    
    return res.status(200).json({
      success: true,
      coin: coin.toUpperCase(),
      symbol: sym,
      timestamp: Date.now(),
      source: 'BINANCE (real-time)',
      price,
      funding,
      openInterest: oi,
      longShortRatio: ls,
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      coin: coin.toUpperCase(),
    });
  }
}
