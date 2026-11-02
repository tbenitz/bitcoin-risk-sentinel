/* Risk Sentinel: pure, testable calculations. No trade execution or forecast claims. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BtcRiskCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RATES = {
    flash: { off: { input: 0.15, cached: 0.003, output: 0.60 }, peak: { input: 0.30, cached: 0.006, output: 1.20 } },
    pro: { off: { input: 0.66, cached: 0.022, output: 1.98 }, peak: { input: 1.32, cached: 0.044, output: 3.96 } }
  };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
  const finite = v => Number.isFinite(Number(v)) && v !== '' && v !== null;
  function estimateCost({ input = 0, cached = 0, output = 0, searches = 0, fetches = 0, mode = 'flash', pricing = 'off' } = {}) {
    const r = RATES[mode]?.[pricing] || RATES.flash.off;
    const cachedSafe = clamp(cached, 0, Number(input));
    return ((Number(input) - cachedSafe) * r.input + cachedSafe * r.cached + Number(output) * r.output) / 1e6 + (Number(searches) + Number(fetches)) * 0.00075;
  }
  function projectUsage({ intervalMinutes = 30, hours = 6, inputTokens = 2500, outputTokens = 550, searches = 1, mode = 'flash', pricing = 'off', actual = { input: 0, output: 0, cached: 0, searches: 0, fetches: 0, cost: 0 }, completed = 0 } = {}) {
    const totalCalls = Math.ceil(clamp(hours, 0.01, 24 * 30) * 60 / clamp(intervalMinutes, 1, 10080));
    const remainingCalls = Math.max(0, totalCalls - Math.max(0, completed));
    const nextTokens = Math.max(0, Number(inputTokens)) + Math.max(0, Number(outputTokens));
    const nextCost = estimateCost({ input: inputTokens, output: outputTokens, searches, mode, pricing });
    const actualTokens = Number(actual.input || 0) + Number(actual.output || 0);
    return { totalCalls, remainingCalls, nextTokens, nextCost, projectedTokens: actualTokens + remainingCalls * nextTokens, projectedCost: Number(actual.cost || 0) + remainingCalls * nextCost, actualTokens };
  }
  function calculateRisk({ price, reference24h, high24h, low24h, sentimentScore = null, sketchDownPct = null, settings = {} }) {
    if (!finite(price) || Number(price) <= 0) return { status: 'unavailable', triggers: [], change24h: null, drawdown24h: null, exposure: null, pnl: null };
    const p = Number(price), s = settings;
    const change24h = finite(reference24h) && Number(reference24h) > 0 ? ((p / Number(reference24h)) - 1) * 100 : null;
    const drawdown24h = finite(high24h) && Number(high24h) > 0 ? Math.max(0, (1 - p / Number(high24h)) * 100) : null;
    const range24h = finite(high24h) && finite(low24h) && Number(low24h) > 0 ? (Number(high24h) / Number(low24h) - 1) * 100 : null;
    const qty = finite(s.quantity) ? Math.max(0, Number(s.quantity)) : 0;
    const entry = finite(s.entryPrice) && Number(s.entryPrice) > 0 ? Number(s.entryPrice) : null;
    const exposure = qty * p;
    const pnl = entry !== null ? (p - entry) * qty : null;
    const portfolio = finite(s.portfolioUSD) ? Number(s.portfolioUSD) : 0;
    const exposurePercent = portfolio > 0 ? (exposure / portfolio) * 100 : null;
    const triggers = [];
    const add = (level, label, detail) => triggers.push({ level, label, detail });
    if (change24h !== null && change24h <= -Math.abs(Number(s.drop24hPct) || 0)) add('high', '24-hour drop', `${change24h.toFixed(2)}% vs -${Number(s.drop24hPct).toFixed(1)}% threshold`);
    if (drawdown24h !== null && drawdown24h >= Number(s.drawdownPct)) add('high', 'Drawdown from 24h high', `${drawdown24h.toFixed(2)}% vs ${Number(s.drawdownPct).toFixed(1)}% threshold`);
    if (range24h !== null && range24h >= Number(s.rangePct)) add('medium', 'Wide 24-hour range', `${range24h.toFixed(2)}% vs ${Number(s.rangePct).toFixed(1)}% threshold`);
    if (entry !== null && qty > 0 && p <= entry * (1 - Number(s.stopLossPct) / 100)) add('high', 'Entry-based stop-loss level', `Price below the entry-based -${Number(s.stopLossPct).toFixed(1)}% level`);
    if (finite(s.priceFloor) && Number(s.priceFloor) > 0 && p <= Number(s.priceFloor)) add('high', 'Absolute price floor', 'Price is at or below your configured alert level');
    if (exposurePercent !== null && exposurePercent > Number(s.maxAllocationPct)) add('medium', 'Position allocation', `${exposurePercent.toFixed(1)}% of portfolio vs ${Number(s.maxAllocationPct).toFixed(1)}% limit`);
    if (sentimentScore !== null && finite(sentimentScore) && Number(sentimentScore) <= Number(s.bearishScore)) add('medium', 'Bearish news sentiment', `AI news sentiment ${Number(sentimentScore).toFixed(0)}/100 (unverified signal)`);
    if (sketchDownPct !== null && finite(sketchDownPct) && Number(sketchDownPct) <= -Math.abs(Number(s.sketchLossPct))) add('medium', 'Drawn downside scenario', `Sketch ends ${Number(sketchDownPct).toFixed(2)}% below spot; scenario, not forecast`);
    const status = triggers.some(x => x.level === 'high') ? 'high' : triggers.length ? 'elevated' : 'normal';
    return { status, triggers, change24h, drawdown24h, range24h, exposure, exposurePercent, pnl };
  }
  function validSentiment(data) {
    if (!data || typeof data !== 'object' || !Number.isFinite(Number(data.score))) throw new Error('The AI did not return a valid sentiment score.');
    return {
      score: clamp(data.score, 0, 100),
      confidence: ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : 'low',
      label: String(data.label || 'Mixed').slice(0, 60),
      summary: String(data.summary || '').slice(0, 1600),
      factors: Array.isArray(data.factors) ? data.factors.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 250)) : []
    };
  }
  return { RATES, clamp, estimateCost, projectUsage, calculateRisk, validSentiment };
});
