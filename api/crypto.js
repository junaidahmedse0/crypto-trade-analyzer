export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { coin = 'BTC' } = req.query;
  const SYMS = {BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',BNB:'BNBUSDT',XRP:'XRPUSDT',ADA:'ADAUSDT',AVAX:'AVAXUSDT',DOGE:'DOGEUSDT',MATIC:'MATICUSDT',DOT:'DOTUSDT',LINK:'LINKUSDT',SHIB:'SHIBUSDT',PEPE:'PEPEUSDT',WIF:'WIFUSDT',ARB:'ARBUSDT',SUI:'SUIUSDT',TRUMP:'TRUMPUSDT',NEAR:'NEARUSDT',APT:'APTUSDT',BONK:'BONKUSDT',FLOKI:'FLOKIUSDT'};
  const sym = SYMS[coin.toUpperCase()] || coin.toUpperCase() + 'USDT';
  const errs = [];

  // ═══ HELPER: Safe fetch with timeout ═══
  async function sf(url, label, timeout = 5000) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) { errs.push(label + ':HTTP' + r.status); return null; }
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { errs.push(label + ':parse'); return null; }
    } catch (e) { errs.push(label + ':' + (e.name === 'AbortError' ? 'timeout' : e.message)); return null; }
  }

  // ═══════════════════════════════════════════════════
  // 1. BINANCE SPOT — Price, 24h range, volume
  // ═══════════════════════════════════════════════════
  const priceUrls = [
    'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + sym,
    'https://api1.binance.com/api/v3/ticker/24hr?symbol=' + sym,
    'https://api2.binance.com/api/v3/ticker/24hr?symbol=' + sym,
    'https://api.binance.com/api/v3/ticker/24hr?symbol=' + sym,
  ];
  let priceData = null;
  for (const url of priceUrls) {
    const d = await sf(url, 'binance-price');
    if (d && d.lastPrice) { priceData = d; break; }
  }

  // CoinGecko fallback for price
  if (!priceData) {
    const GECKO = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',DOGE:'dogecoin',PEPE:'pepe',SUI:'sui',LINK:'chainlink',ADA:'cardano',AVAX:'avalanche-2',SHIB:'shiba-inu',ARB:'arbitrum',TRUMP:'official-trump',DOT:'polkadot',NEAR:'near',APT:'aptos',WIF:'dogwifhat',BONK:'bonk',FLOKI:'floki'};
    const gid = GECKO[coin.toUpperCase()] || coin.toLowerCase();
    const cg = await sf(`https://api.coingecko.com/api/v3/coins/${gid}?localization=false&tickers=false&community_data=false&developer_data=false`, 'coingecko');
    if (cg && cg.market_data) {
      priceData = {
        lastPrice: String(cg.market_data.current_price?.usd || 0),
        highPrice: String(cg.market_data.high_24h?.usd || 0),
        lowPrice: String(cg.market_data.low_24h?.usd || 0),
        priceChangePercent: String(cg.market_data.price_change_percentage_24h || 0),
        quoteVolume: String(cg.market_data.total_volume?.usd || 0),
        _source: 'coingecko'
      };
    }
  }

  const price = priceData ? {
    price: parseFloat(priceData.lastPrice),
    high24: parseFloat(priceData.highPrice),
    low24: parseFloat(priceData.lowPrice),
    change24: parseFloat(priceData.priceChangePercent),
    volume: parseFloat(priceData.quoteVolume),
    source: priceData._source || 'binance'
  } : null;

  const currentPrice = price ? price.price : 0;

  // ═══════════════════════════════════════════════════
  // 2. BINANCE FUTURES — Funding Rate + Mark Price
  // ═══════════════════════════════════════════════════
  const fundingUrls = [
    'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + sym,
    'https://fapi.binance.com/fapi/v2/premiumIndex?symbol=' + sym,
  ];
  let fundingData = null;
  for (const url of fundingUrls) {
    const d = await sf(url, 'binance-funding');
    if (d && d.lastFundingRate) { fundingData = d; break; }
  }

  const funding = fundingData ? {
    rate: parseFloat(fundingData.lastFundingRate),
    ratePct: (parseFloat(fundingData.lastFundingRate) * 100).toFixed(4) + '%',
    markPrice: parseFloat(fundingData.markPrice),
    nextFundingTime: fundingData.nextFundingTime,
  } : null;

  // ═══════════════════════════════════════════════════
  // 3. BINANCE FUTURES — Open Interest (EXACT)
  // ═══════════════════════════════════════════════════
  const oiRes = await sf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + sym, 'binance-oi');
  const openInterest = oiRes && oiRes.openInterest ? {
    coins: parseFloat(oiRes.openInterest),
    valueUSD: parseFloat(oiRes.openInterest) * currentPrice,
    formatted: '$' + ((parseFloat(oiRes.openInterest) * currentPrice) / 1e9).toFixed(2) + 'B',
  } : null;

  // ═══════════════════════════════════════════════════
  // 4. BINANCE — Long/Short Account Ratio (EXACT)
  // ═══════════════════════════════════════════════════
  const lsRes = await sf('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + sym + '&period=4h&limit=1', 'binance-ls');
  const longShort = Array.isArray(lsRes) && lsRes[0] ? {
    longPct: (parseFloat(lsRes[0].longAccount) * 100).toFixed(2) + '%',
    shortPct: (parseFloat(lsRes[0].shortAccount) * 100).toFixed(2) + '%',
    longRatio: parseFloat(lsRes[0].longAccount),
    shortRatio: parseFloat(lsRes[0].shortAccount),
    longShortRatio: parseFloat(lsRes[0].longShortRatio),
    timestamp: lsRes[0].timestamp,
  } : null;

  // ═══════════════════════════════════════════════════
  // 5. BINANCE — Top Trader Long/Short (Position)
  // ═══════════════════════════════════════════════════
  const topTraderRes = await sf('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=' + sym + '&period=4h&limit=1', 'binance-toptrader');
  const topTrader = Array.isArray(topTraderRes) && topTraderRes[0] ? {
    longPct: (parseFloat(topTraderRes[0].longAccount) * 100).toFixed(2) + '%',
    shortPct: (parseFloat(topTraderRes[0].shortAccount) * 100).toFixed(2) + '%',
    longShortRatio: parseFloat(topTraderRes[0].longShortRatio),
  } : null;

  // ═══════════════════════════════════════════════════
  // 6. BINANCE — Taker Buy/Sell Volume (aggression)
  // ═══════════════════════════════════════════════════
  const takerRes = await sf('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=' + sym + '&period=4h&limit=1', 'binance-taker');
  const takerVolume = Array.isArray(takerRes) && takerRes[0] ? {
    buySellRatio: parseFloat(takerRes[0].buySellRatio),
    buyVol: parseFloat(takerRes[0].buyVol),
    sellVol: parseFloat(takerRes[0].sellVol),
    dominance: parseFloat(takerRes[0].buySellRatio) > 1 ? 'BUYERS' : 'SELLERS',
  } : null;

  // ═══════════════════════════════════════════════════
  // 7. BINANCE — Kline/Candles for RSI + EMA calculation
  // ═══════════════════════════════════════════════════
  // Get 4H candles (need 200+ for EMA200)
  const kline4h = await sf('https://fapi.binance.com/fapi/v1/klines?symbol=' + sym + '&interval=4h&limit=210', 'binance-kline4h');
  // Get Daily candles for EMA200 daily
  const kline1d = await sf('https://fapi.binance.com/fapi/v1/klines?symbol=' + sym + '&interval=1d&limit=210', 'binance-kline1d');

  let indicators = null;
  if (Array.isArray(kline4h) && kline4h.length > 14) {
    const closes4h = kline4h.map(k => parseFloat(k[4]));
    const volumes4h = kline4h.map(k => parseFloat(k[5]));

    // RSI 14 (4H)
    const rsi4h = calcRSI(closes4h, 14);

    // EMA 20 (4H)
    const ema20_4h = calcEMA(closes4h, 20);

    // ADX 14 (4H) 
    const adx4h = calcADX(kline4h, 14);

    // Daily indicators
    let ema200d = null, ema20d = null, rsi1d = null, adx1d = null;
    if (Array.isArray(kline1d) && kline1d.length > 200) {
      const closes1d = kline1d.map(k => parseFloat(k[4]));
      ema200d = calcEMA(closes1d, 200);
      ema20d = calcEMA(closes1d, 20);
      rsi1d = calcRSI(closes1d, 14);
      adx1d = calcADX(kline1d, 14);
    }

    // SSL Channel (EMA10 high vs EMA10 low)
    const highs4h = kline4h.map(k => parseFloat(k[2]));
    const lows4h = kline4h.map(k => parseFloat(k[3]));
    const sslHigh = calcEMA(highs4h, 10);
    const sslLow = calcEMA(lows4h, 10);
    const sslSignal = sslHigh > sslLow ? 'BULLISH' : 'BEARISH';

    // Volume analysis
    const avgVol = volumes4h.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastVol = volumes4h[volumes4h.length - 1];
    const volRatio = lastVol / avgVol;

    // Candle strength (last 3 candles)
    const last3 = kline4h.slice(-3);
    let bullCandles = 0, bearCandles = 0;
    for (const k of last3) {
      const open = parseFloat(k[1]), close = parseFloat(k[4]);
      if (close > open) bullCandles++; else bearCandles++;
    }
    const candleStrength = bullCandles > bearCandles ? 'BULLISH' : bearCandles > bullCandles ? 'BEARISH' : 'NEUTRAL';

    indicators = {
      rsi4h: Math.round(rsi4h * 100) / 100,
      rsi1d: rsi1d ? Math.round(rsi1d * 100) / 100 : null,
      ema20_4h: Math.round(ema20_4h * 100) / 100,
      ema200d: ema200d ? Math.round(ema200d * 100) / 100 : null,
      ema20d: ema20d ? Math.round(ema20d * 100) / 100 : null,
      adx4h: adx4h ? Math.round(adx4h * 100) / 100 : null,
      adx1d: adx1d ? Math.round(adx1d * 100) / 100 : null,
      sslChannel: sslSignal,
      sslHigh: Math.round(sslHigh * 100) / 100,
      sslLow: Math.round(sslLow * 100) / 100,
      priceVsEma200: ema200d ? (currentPrice > ema200d ? 'ABOVE' : 'BELOW') : null,
      priceVsEma20: ema20d ? (currentPrice > ema20d ? 'ABOVE' : 'BELOW') : null,
      volumeRatio: Math.round(volRatio * 100) / 100,
      volumeStatus: volRatio > 1.5 ? 'HIGH' : volRatio < 0.5 ? 'LOW' : 'NORMAL',
      candleStrength,
    };
  }

  // ═══════════════════════════════════════════════════
  // 8. FEAR & GREED INDEX (alternative.me — EXACT)
  // ═══════════════════════════════════════════════════
  const fgRes = await sf('https://api.alternative.me/fng/?limit=1', 'fear-greed');
  const fearGreed = fgRes && fgRes.data?.[0] ? {
    value: parseInt(fgRes.data[0].value),
    label: fgRes.data[0].value_classification,
    timestamp: fgRes.data[0].timestamp,
  } : null;

  // ═══════════════════════════════════════════════════
  // 9. BINANCE — Recent Liquidations proxy (from OI changes)
  // ═══════════════════════════════════════════════════
  const oiHistRes = await sf('https://fapi.binance.com/futures/data/openInterestHist?symbol=' + sym + '&period=1h&limit=5', 'binance-oi-hist');
  let oiChange = null;
  if (Array.isArray(oiHistRes) && oiHistRes.length >= 2) {
    const latest = parseFloat(oiHistRes[oiHistRes.length - 1].sumOpenInterestValue);
    const prev = parseFloat(oiHistRes[oiHistRes.length - 2].sumOpenInterestValue);
    oiChange = {
      latest: latest,
      previous: prev,
      changePct: ((latest - prev) / prev * 100).toFixed(2) + '%',
      direction: latest > prev ? 'INCREASING' : 'DECREASING',
    };
  }

  // ═══════════════════════════════════════════════════
  // FINAL RESPONSE — ALL DATA
  // ═══════════════════════════════════════════════════
  return res.status(200).json({
    success: true,
    coin: coin.toUpperCase(),
    symbol: sym,
    timestamp: Date.now(),
    source: price ? (price.source === 'binance' ? 'BINANCE (real-time)' : 'CoinGecko') : 'NONE',

    // Core price data
    price,

    // Derivatives data (ALL from Binance Futures API — EXACT)
    funding,
    openInterest,
    longShortRatio: longShort,
    topTraderRatio: topTrader,
    takerVolume,
    oiChange,

    // Technical indicators (CALCULATED from real candles)
    indicators,

    // Sentiment
    fearGreed,

    // Debug
    _errors: errs.length > 0 ? errs : undefined,
    _dataQuality: {
      price: price ? '✅ EXACT' : '❌ MISSING',
      funding: funding ? '✅ EXACT' : '❌ MISSING',
      openInterest: openInterest ? '✅ EXACT' : '❌ MISSING',
      longShort: longShort ? '✅ EXACT' : '❌ MISSING',
      indicators: indicators ? '✅ CALCULATED' : '❌ MISSING',
      fearGreed: fearGreed ? '✅ EXACT' : '❌ MISSING',
    }
  });
}

// ═══════════════════════════════════════════════════
// INDICATOR CALCULATIONS (from real candle data)
// ═══════════════════════════════════════════════════

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[closes.length - period - 1 + i] - closes[closes.length - period - 1 + i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // Smooth with remaining data
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcEMA(data, period) {
  if (data.length < period) return data[data.length - 1];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcADX(klines, period = 14) {
  if (klines.length < period * 2) return null;
  const highs = klines.map(k => parseFloat(k[2]));
  const lows = klines.map(k => parseFloat(k[3]));
  const closes = klines.map(k => parseFloat(k[4]));

  let trList = [], plusDM = [], minusDM = [];
  for (let i = 1; i < klines.length; i++) {
    const h = highs[i], l = lows[i], ph = highs[i-1], pl = lows[i-1], pc = closes[i-1];
    trList.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = h - ph, downMove = pl - l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (trList.length < period) return null;
  
  let atr = trList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let aPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let aMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;

  let dxList = [];
  for (let i = period; i < trList.length; i++) {
    atr = (atr * (period - 1) + trList[i]) / period;
    aPlusDM = (aPlusDM * (period - 1) + plusDM[i]) / period;
    aMinusDM = (aMinusDM * (period - 1) + minusDM[i]) / period;
    const plusDI = (aPlusDM / atr) * 100;
    const minusDI = (aMinusDM / atr) * 100;
    const diSum = plusDI + minusDI;
    if (diSum > 0) dxList.push(Math.abs(plusDI - minusDI) / diSum * 100);
  }

  if (dxList.length < period) return dxList.length > 0 ? dxList[dxList.length - 1] : null;
  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }
  return adx;
}
