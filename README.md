# Bitcoin Forecast Lab — one chart, automatic predictions

**Open:** https://tbenitz.github.io/bitcoin-risk-sentinel/

The app is intentionally simple: **the computer predicts automatically** using *real, completed BTC/USD market candles*; you can optionally draw a purple prediction **one time** and leave it on screen. The app then watches Bitcoin, verifies each forecast against **actual future completed candles**, records the results, and adjusts **future** method weights after enough completed results exist. There is **only one graph**. Previous results are one click away in a separate window.

## What you'll see

- **Gold:** the model's forecast, frozen before the later prices are known.
- **Blue:** live/verified BTC price movement after the forecast, at original timestamps.
- **Purple:** optional line you draw over the *remaining future* portion of that existing model forecast. **Your line is saved and pinned** to the chart on mouse release. It stays there even if the system makes additional automatic predictions. You never need to draw again to keep automatic forecasting running.
- **Green:** the actual, historical Coinbase/Kraken prices used as input.
- **Four small numbers:** predicted move, observed move, verified error, completed-forecast learning count.

The chart stays on your pinned drawing even after the prediction ends, so you can see the outcome. Press **Go to newest forecast** when **you** want to return to live automatic forecasts. Previous predictions are accessible via **See all results**, not an endless scrolling page.

## How it actually predicts and scores

1. Gets **real, completed** public BTC/USD candles (Coinbase Exchange, Kraken fallback) at the selected horizon (1h/6h/24h/7d). Historical candles are fetched in batches smaller than Coinbase's 300-row maximum.
2. Generates a frozen prediction using a real on-device Timestral-5M ONNX model (if initialized) combined with price-history analog and momentum methods, never invented market observations. Timestral downloads about 21 MB for local WASM inference; if it fails, history-based methods are clearly indicated.
3. Once the subsequent candles **actually close**, it saves exact matching observed prices and scores mean absolute percentage error and directional accuracy; future samples are never counted as correct or incorrect prematurely.
4. Recalibrates **only later forecasts** after at least 8 completed and independently scored forecasts per method. The forecasts already saved are never changed. A no-change baseline may outperform fancier methods, and the app can shrink toward it.
5. Keeps your saved records (including drawings) in your browser. Selecting history *does not* stop automatic background forecasts. Drawings are attached to one existing model record, **not** created as a separate new prediction that gets replaced when the next market candle closes.

This is a probability/forecasting experiment and **cannot promise profitable predictions**.

## Automatic public history, including when the site is closed

A new GitHub Actions workflow (`.github/workflows/public-forecast.yml`) tries to run at **:17 and :47 every hour** (best effort; GitHub may delay or suspend scheduled jobs). It independently fetches completed Coinbase candles, creates one public **historical-pattern + momentum** forecast, grades outcomes that have since closed, and commits the append-only **frozen prediction ledger** at `data/public-history.json` with a maximum of 350 recent records. It does **not** claim that Timestral ran on GitHub. There is no account, wallet, cloud Worker, or API key required.

Anyone visiting the site can open **See all results → Public archive** to review these public forecasts and see their actual outcomes. The public archive initially has no entries until GitHub Actions successfully runs. If scheduled actions are disabled or repository `GITHUB_TOKEN` lacks `contents: write`, go to **Actions → Public BTC forecast history**, enable workflows/permissions as needed, and run it once using **Run workflow**.

Browser forecasts can run every newly completed market candle while the tab is open; **scheduled public forecasts run separately**. Opening your saved results later backfills real prices to score them. A closed browser cannot keep its on-device Timestral session running, but the public GitHub Actions job can keep its simpler historical-model archive updated.

GitHub Pages is public and static. Locally drawn predictions stay *private to that browser* unless you use **Share selected**, which copies a read-only link containing the frozen prediction; others opening it can verify its results. Public results are shared automatically by the scheduled workflow.

## Optional DeepSeek web sentiment

Settings include an optional direct DeepSeek key and scheduled live news searches. **News analysis does not secretly alter the price forecast.** It is a separate sentiment signal, with per-check token estimates, total session projections, actual token counts, and best-effort budget caps. No proxy/Cloudflare Worker is required. Some browsers/providers may block direct requests with CORS; the app will report this honestly rather than fake a result. The key lives in `sessionStorage` only and never enters GitHub or shared links.

Risk alerts for a 24h drop or a fast candle jump also live under Settings.

## Deployment & files

- `index.html` — the single-screen, single-chart user interface.
- `app.js` — live exchange feeds, automatic forecasting, pinned drawings, persistence, optional DeepSeek, and review dialogs.
- `forecast-core.js` — deterministic preprocessing, on-device forecast blending, frozen results, closed-candle scoring and adaptation.
- `timestral-worker.js` and `timestral-prep.js` — client-only Timestral-5M ONNX inference.
- `scripts/publish-forecasts.cjs` — GitHub Actions public archive job, no secrets.
- `data/public-history.json` — publicly reviewable, timestamped forecasts; empty until the first workflow success.
- `.github/workflows/ci.yml`, `.github/workflows/public-forecast.yml` — tests and the scheduled public archive.

Set GitHub **Settings → Pages → Deploy from main branch `/`**. The static dashboard works without installing Node; the scheduled archiver runs in GitHub Actions with Node 22.

Run local tests: `npm test`. These verify pinned-sketch logic, non-retroactive scoring, real-data-only public archive, model preprocessing, and UI integrity. A browser smoke test uses **intercepted/mock market prices and model replies** to verify interaction, not live-market forecasting skill.

**Research only, not financial advice. No automated trading or wallet access.** Predictions are uncertain and can underperform a simple unchanged-price baseline.
