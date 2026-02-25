export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const { coin = 'BTC' } = req.query;
  const SYMS = {BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',BNB:'BNBUSDT',XRP:'XRPUSDT',ADA:'ADAUSDT',AVAX:'AVAXUSDT',DOGE:'DOGEUSDT',MATIC:'MATICUSDT',DOT:'DOTUSDT',LINK:'LINKUSDT',SHIB:'SHIBUSDT',PEPE:'PEPEUSDT',WIF:'WIFUSDT',ARB:'ARBUSDT',SUI:'SUIUSDT',TRUMP:'TRUMPUSDT',NEAR:'NEARUSDT',APT:'APTUSDT'};
  const sym = SYMS[coin.toUpperCase()] || coin.toUpperCase() + 'USDT';
  const errs = [];

  async function sf(url, label) {
    try {
      const r = await fetch(url);
      const txt = await r.text();
      if (!r.ok) { errs.push(label + ':HTTP' + r.status + ':' + txt.substring(0,200)); return null; }
      try { return JSON.parse(txt); } catch(e) { errs.push(label + ':PARSE:' + txt.substring(0,200)); return null; }
    } catch (e) { errs.push(label + ':ERR:' + e.message); return null; }
  }

  // Try MULTIPLE Binance endpoints (some work from US, some don't)
  const priceUrls = [
    'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + sym,
    'https://api.binance.com/api/v3/ticker/24hr?symbol=' + sym,
    'https://api1.binance.com/api/v3/ticker/24hr?symbol=' + sym,
    'https://api2.binance.com/api/v3/ticker/24hr?symbol=' + sym,
  ];

  let priceRes = null;
  for (const url of priceUrls) {
    priceRes = await sf(url, 'price');
    if (priceRes && priceRes.lastPrice) break;
    priceRes = null;
  }

  // Futures endpoints (try multiple)
  const [fundingRes, oiRes, lsRes] = await Promise.all([
    sf('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + sym, 'funding'),
    sf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + sym, 'oi'),
    sf('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + sym + '&period=4h&limit=1', 'ls'),
  ]);

  // Fallback: CoinGecko if Binance price fails
  let cgPrice = null;
  if (!priceRes) {
    const geckoIds = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',DOGE:'dogecoin',PEPE:'pepe',SUI:'sui',LINK:'chainlink',ADA:'cardano',AVAX:'avalanche-2',SHIB:'shiba-inu',ARB:'arbitrum',TRUMP:'official-trump'};
    const gid = geckoIds[coin.toUpperCase()] || coin.toLowerCase();
    cgPrice = await sf('https://api.coingecko.com/api/v3/simple/price?ids=' + gid + '&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true', 'coingecko');
  }

  const price = priceRes && priceRes.lastPrice ? {
    price: parseFloat(priceRes.lastPrice), high24: parseFloat(priceRes.highPrice),
    low24: parseFloat(priceRes.lowPrice), change24: parseFloat(priceRes.priceChangePercent),
    volume: parseFloat(priceRes.quoteVolume), source: 'binance',
  } : cgPrice ? {
    price: Object.values(cgPrice)[0]?.usd || 0,
    change24: Object.values(cgPrice)[0]?.usd_24h_change || 0,
    volume: Object.values(cgPrice)[0]?.usd_24h_vol || 0,
    high24: 0, low24: 0, source: 'coingecko',
  } : null;

  const funding = fundingRes && fundingRes.lastFundingRate ? {
    rate: parseFloat(fundingRes.lastFundingRate), markPrice: parseFloat(fundingRes.markPrice),
  } : null;

  const oi = oiRes && oiRes.openInterest ? {
    value: parseFloat(oiRes.openInterest),
    valueUSD: parseFloat(oiRes.openInterest) * (price ? price.price : 0),
  } : null;

  const ls = Array.isArray(lsRes) && lsRes[0] ? {
    longRatio: parseFloat(lsRes[0].longAccount), shortRatio: parseFloat(lsRes[0].shortAccount),
  } : null;

  return res.status(200).json({
    success: true, coin: coin.toUpperCase(), symbol: sym, timestamp: Date.now(),
    source: price ? (price.source === 'binance' ? 'BINANCE (real-time)' : 'CoinGecko (server)') : 'NONE',
    price, funding, openInterest: oi, longShortRatio: ls,
    _errors: errs.length > 0 ? errs : undefined,
  });
}
