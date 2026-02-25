export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { coin = 'BTC' } = req.query;
  const CU = coin.toUpperCase();
  const SYMS = {BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',BNB:'BNBUSDT',XRP:'XRPUSDT',ADA:'ADAUSDT',AVAX:'AVAXUSDT',DOGE:'DOGEUSDT',DOT:'DOTUSDT',LINK:'LINKUSDT',SHIB:'SHIBUSDT',PEPE:'PEPEUSDT',WIF:'WIFUSDT',ARB:'ARBUSDT',SUI:'SUIUSDT',TRUMP:'TRUMPUSDT',NEAR:'NEARUSDT',APT:'APTUSDT',BONK:'BONKUSDT',FLOKI:'FLOKIUSDT'};
  const sym = SYMS[CU] || CU + 'USDT';
  const GECKO = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',DOGE:'dogecoin',PEPE:'pepe',SUI:'sui',LINK:'chainlink',ADA:'cardano',AVAX:'avalanche-2',SHIB:'shiba-inu',ARB:'arbitrum',TRUMP:'official-trump',DOT:'polkadot',NEAR:'near',APT:'aptos',WIF:'dogwifhat',BONK:'bonk',FLOKI:'floki'};
  const errs = [];

  async function sf(url, label, timeout = 7000) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeout);
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(t);
      if (!r.ok) { errs.push(label + ':HTTP' + r.status); return null; }
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { errs.push(label + ':parse'); return null; }
    } catch (e) { errs.push(label + ':' + (e.name === 'AbortError' ? 'timeout' : e.message)); return null; }
  }

  // ══════════════════════════════════════════════════════════════
  // PROVEN WORKING ENDPOINTS:
  //   ✅ data-api.binance.vision — Spot price + klines (global)
  //   ✅ api.coingecko.com — Price fallback + derivatives data
  //   ✅ api.alternative.me — Fear/Greed index
  //   ⚠️ fapi.binance.com — Futures (blocked from US/Vercel)
  // ══════════════════════════════════════════════════════════════

  // ═══ 1. PRICE — Binance SPOT (always works!) ═══
  let priceData = null;
  const d1 = await sf('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + sym, 'spot-price');
  if (d1 && d1.lastPrice) priceData = d1;
  if (!priceData) {
    const gid = GECKO[CU] || CU.toLowerCase();
    const cg = await sf('https://api.coingecko.com/api/v3/coins/' + gid + '?localization=false&tickers=false&community_data=false&developer_data=false', 'cg-price');
    if (cg && cg.market_data) {
      priceData = { lastPrice: String(cg.market_data.current_price.usd||0), highPrice: String(cg.market_data.high_24h.usd||0), lowPrice: String(cg.market_data.low_24h.usd||0), priceChangePercent: String(cg.market_data.price_change_percentage_24h||0), quoteVolume: String(cg.market_data.total_volume.usd||0), _src: 'coingecko' };
    }
  }
  const price = priceData ? { price:+priceData.lastPrice, high24:+priceData.highPrice, low24:+priceData.lowPrice, change24:+priceData.priceChangePercent, volume:+priceData.quoteVolume, source: priceData._src || 'binance' } : null;
  const cp = price ? price.price : 0;

  // ═══ 2. KLINES — Binance SPOT (always works! All indicators from these) ═══
  const [k4hRes, k1dRes] = await Promise.all([
    sf('https://data-api.binance.vision/api/v3/klines?symbol=' + sym + '&interval=4h&limit=210', 'spot-k4h'),
    sf('https://data-api.binance.vision/api/v3/klines?symbol=' + sym + '&interval=1d&limit=210', 'spot-k1d'),
  ]);

  // ═══ 3. CALCULATE INDICATORS from real candle data ═══
  let indicators = null;
  if (Array.isArray(k4hRes) && k4hRes.length > 20) {
    const c4 = k4hRes.map(k => +k[4]);
    const h4 = k4hRes.map(k => +k[2]);
    const l4 = k4hRes.map(k => +k[3]);
    const v4 = k4hRes.map(k => +k[5]);
    const avgV = v4.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const lastV = v4[v4.length - 1];
    const sH = calcEMA(h4, 10);
    const sL = calcEMA(l4, 10);

    // Last 3 candles direction
    let bull = 0, bear = 0;
    for (const k of k4hRes.slice(-3)) { if (+k[4] > +k[1]) bull++; else bear++; }

    // Daily indicators
    let e200d = null, e20d = null, r1d = null, a1d = null;
    if (Array.isArray(k1dRes) && k1dRes.length > 20) {
      const c1d = k1dRes.map(k => +k[4]);
      if (c1d.length > 200) e200d = calcEMA(c1d, 200);
      e20d = calcEMA(c1d, 20);
      r1d = calcRSI(c1d, 14);
      a1d = calcADX(k1dRes, 14);
    }

    indicators = {
      rsi4h: r2(calcRSI(c4, 14)),
      rsi1d: r1d !== null ? r2(r1d) : null,
      ema20_4h: r2(calcEMA(c4, 20)),
      ema200d: e200d !== null ? r2(e200d) : null,
      ema20d: e20d !== null ? r2(e20d) : null,
      adx4h: r2(calcADX(k4hRes, 14) || 0),
      adx1d: a1d !== null ? r2(a1d) : null,
      sslChannel: sH > sL ? 'BULLISH' : 'BEARISH',
      sslHigh: r2(sH),
      sslLow: r2(sL),
      priceVsEma200: e200d !== null ? (cp > e200d ? 'ABOVE' : 'BELOW') : null,
      priceVsEma20: e20d !== null ? (cp > e20d ? 'ABOVE' : 'BELOW') : null,
      volumeRatio: r2(lastV / avgV),
      volumeStatus: (lastV / avgV) > 1.5 ? 'HIGH' : (lastV / avgV) < 0.5 ? 'LOW' : 'NORMAL',
      candleStrength: bull > bear ? 'BULLISH' : bear > bull ? 'BEARISH' : 'NEUTRAL',
      _source: 'binance-spot-klines',
    };
  }

  // ═══ 4. DERIVATIVES — CoinGecko (free, works globally!) ═══
  let funding = null, openInterest = null;
  const derivs = await sf('https://api.coingecko.com/api/v3/derivatives?include_tickers=unexpired', 'cg-derivs');
  if (Array.isArray(derivs)) {
    const perps = derivs.filter(d => d.symbol && d.symbol.toUpperCase().includes(CU) && d.contract_type === 'perpetual');
    if (perps.length > 0) {
      let totalOI = 0, fSum = 0, fCount = 0;
      for (const p of perps) {
        if (p.open_interest) totalOI += p.open_interest;
        if (p.funding_rate != null) { fSum += p.funding_rate; fCount++; }
      }
      if (totalOI > 0) {
        openInterest = { coins: totalOI / cp, valueUSD: totalOI, formatted: '$' + (totalOI / 1e9).toFixed(2) + 'B', _source: 'coingecko' };
      }
      if (fCount > 0) {
        const avgF = fSum / fCount;
        funding = { rate: avgF, ratePct: (avgF * 100).toFixed(4) + '%', _source: 'coingecko' };
      }
    }
  }

  // ═══ 5. LONG/SHORT + OI + FUNDING — Try Bybit FIRST (free, works globally!) ═══
  let longShort = null, topTrader = null, takerVolume = null;

  // 5a. Bybit L/S Ratio (FREE, no key, works from US!)
  const bybitLS = await sf('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=' + sym + '&period=4h&limit=1', 'bybit-ls');
  if (bybitLS && bybitLS.result && bybitLS.result.list && bybitLS.result.list[0]) {
    const b = bybitLS.result.list[0];
    const buyR = parseFloat(b.buyRatio);
    const sellR = parseFloat(b.sellRatio);
    longShort = { longPct: (buyR * 100).toFixed(2) + '%', shortPct: (sellR * 100).toFixed(2) + '%', longRatio: buyR, shortRatio: sellR, _source: 'bybit' };
  }

  // 5b. Bybit OI (FREE, works globally!)
  if (!openInterest) {
    const bybitOI = await sf('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=' + sym + '&intervalTime=4h&limit=1', 'bybit-oi');
    if (bybitOI && bybitOI.result && bybitOI.result.list && bybitOI.result.list[0]) {
      const oi = parseFloat(bybitOI.result.list[0].openInterest);
      openInterest = { coins: oi, valueUSD: oi * cp, formatted: '$' + (oi * cp / 1e9).toFixed(2) + 'B', _source: 'bybit' };
    }
  }

  // 5c. Bybit Funding Rate (FREE!)
  if (!funding) {
    const bybitFund = await sf('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=' + sym + '&limit=1', 'bybit-fund');
    if (bybitFund && bybitFund.result && bybitFund.result.list && bybitFund.result.list[0]) {
      const fr = parseFloat(bybitFund.result.list[0].fundingRate);
      funding = { rate: fr, ratePct: (fr * 100).toFixed(4) + '%', _source: 'bybit' };
    }
  }

  // 5d. Binance Futures fallback (may fail from US — 451)
  const [lsRes, topRes, takerRes, oiRes, fundRes] = await Promise.all([
    sf('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + sym + '&period=4h&limit=1', 'bn-ls'),
    sf('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=' + sym + '&period=4h&limit=1', 'bn-top'),
    sf('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=' + sym + '&period=4h&limit=1', 'bn-taker'),
    sf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + sym, 'bn-oi'),
    sf('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + sym, 'bn-fund'),
  ]);

  // Use Binance futures data ONLY if not already filled by Bybit/CoinGecko
  if (!longShort && Array.isArray(lsRes) && lsRes[0] && lsRes[0].longAccount) {
    longShort = { longPct: (+lsRes[0].longAccount * 100).toFixed(2) + '%', shortPct: (+lsRes[0].shortAccount * 100).toFixed(2) + '%', longRatio: +lsRes[0].longAccount, shortRatio: +lsRes[0].shortAccount, _source: 'binance' };
  }
  if (Array.isArray(topRes) && topRes[0]) {
    topTrader = { longPct: (+topRes[0].longAccount * 100).toFixed(2) + '%', shortPct: (+topRes[0].shortAccount * 100).toFixed(2) + '%' };
  }
  if (Array.isArray(takerRes) && takerRes[0]) {
    takerVolume = { buySellRatio: +takerRes[0].buySellRatio, dominance: +takerRes[0].buySellRatio > 1 ? 'BUYERS' : 'SELLERS' };
  }
  if (!openInterest && oiRes && oiRes.openInterest) {
    openInterest = { coins: +oiRes.openInterest, valueUSD: +oiRes.openInterest * cp, formatted: '$' + (+oiRes.openInterest * cp / 1e9).toFixed(2) + 'B', _source: 'binance' };
  }
  if (!funding && fundRes && fundRes.lastFundingRate) {
    funding = { rate: +fundRes.lastFundingRate, ratePct: (+fundRes.lastFundingRate * 100).toFixed(4) + '%', _source: 'binance' };
  }

  // ═══ 6. FEAR & GREED INDEX ═══
  const fgRes = await sf('https://api.alternative.me/fng/?limit=1', 'fear-greed');
  const fearGreed = fgRes && fgRes.data && fgRes.data[0] ? { value: parseInt(fgRes.data[0].value), label: fgRes.data[0].value_classification } : null;

  // ═══ RESPONSE ═══
  return res.status(200).json({
    success: true,
    coin: CU,
    symbol: sym,
    timestamp: Date.now(),
    source: price ? (price.source === 'binance' ? 'BINANCE (real-time)' : 'CoinGecko') : 'NONE',
    price,
    funding,
    openInterest,
    longShortRatio: longShort,
    topTraderRatio: topTrader,
    takerVolume,
    indicators,
    fearGreed,
    _errors: errs.length > 0 ? errs : undefined,
    _dataQuality: {
      price: price ? '✅ EXACT (' + price.source + ')' : '❌ MISSING',
      funding: funding ? '✅ (' + funding._source + ')' : '❌ MISSING',
      openInterest: openInterest ? '✅ (' + openInterest._source + ')' : '❌ MISSING',
      longShort: longShort ? '✅ (' + longShort._source + ')' : '❌ MISSING',
      indicators: indicators ? '✅ CALCULATED (' + indicators._source + ')' : '❌ MISSING',
      fearGreed: fearGreed ? '✅ EXACT' : '❌ MISSING',
    },
  });
}

// ═══ MATH ═══
function r2(n) { return Math.round((n || 0) * 100) / 100; }

function calcRSI(c, p) {
  p = p || 14;
  if (c.length < p + 1) return 50;
  var g = 0, l = 0;
  for (var i = c.length - p; i < c.length; i++) {
    var d = c[i] - c[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  var ag = g / p, al = l / p;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function calcEMA(data, p) {
  if (data.length < p) return data[data.length - 1];
  var k = 2 / (p + 1);
  var ema = 0;
  for (var i = 0; i < p; i++) ema += data[i];
  ema = ema / p;
  for (var i = p; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

function calcADX(kl, p) {
  p = p || 14;
  if (kl.length < p * 2) return null;
  var h = [], l = [], c = [];
  for (var i = 0; i < kl.length; i++) { h.push(+kl[i][2]); l.push(+kl[i][3]); c.push(+kl[i][4]); }
  var tr = [], pd = [], md = [];
  for (var i = 1; i < kl.length; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    var u = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pd.push(u > dn && u > 0 ? u : 0);
    md.push(dn > u && dn > 0 ? dn : 0);
  }
  if (tr.length < p) return null;
  var atr = 0, ap = 0, am = 0;
  for (var i = 0; i < p; i++) { atr += tr[i]; ap += pd[i]; am += md[i]; }
  atr /= p; ap /= p; am /= p;
  var dx = [];
  for (var i = p; i < tr.length; i++) {
    atr = (atr * (p - 1) + tr[i]) / p;
    ap = (ap * (p - 1) + pd[i]) / p;
    am = (am * (p - 1) + md[i]) / p;
    var pi = (ap / atr) * 100, mi = (am / atr) * 100, s = pi + mi;
    if (s > 0) dx.push(Math.abs(pi - mi) / s * 100);
  }
  if (dx.length < p) return dx.length > 0 ? dx[dx.length - 1] : null;
  var adx = 0;
  for (var i = 0; i < p; i++) adx += dx[i];
  adx /= p;
  for (var i = p; i < dx.length; i++) adx = (adx * (p - 1) + dx[i]) / p;
  return adx;
}
