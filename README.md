# Bitcoin Forecast Lab — Draw • Predict • Verify

A single-chart, browser-based BTC/USD forecasting experiment for GitHub Pages. **This version replaces the old two-chart layout** and runs an automated, timestamped research loop:

1. Get real, **fully closed** exchange candles from Coinbase (Kraken fallback). Coinbase calls are split into 275-candle windows to respect its 300-candle maximum.
2. Compute a forecast **before its target candles close**. The new prediction and all its method outputs are frozen with an absolute creation time, input-candle cutoff, data source, and weights.
3. Allow the user to **draw an optional purple path on the same chart**. Releasing the pointer automatically saves a separate prediction with the drawn path and a fresh model forecast. No separate confirmation or second graph is needed.
4. Draw the algorithm's frozen predicted path in amber; as real BTC candles finish, draw actual outcomes in cyan. The predictions **never shift forward** as prices change.
5. Score each checkpoint only from real future closed candles (not a chart interpolation or synthetic price). The app shows forecast MAPE, direction, and the user's own accuracy where available.
6. After at least eight **fully resolved** historical forecasts per candidate method, change future ensemble weights using **only previously verified** errors. Older predictions never change. This is evidence-based recalibration/selection, **not retraining Timestral's neural-network weights**.
7. Retain previous forecasts for review; provide an export/import format and **read-only share links** that include the original prediction. Visitors opening such a link can fetch the actual market history and review the result without needing the creator's browser storage.

## Use

Open `https://tbenitz.github.io/bitcoin-risk-sentinel/`. The site forecasts automatically on opening once enough real BTC candles load, and whenever another selected-horizon candle closes (minimum spacing configured in Settings). Draw a line in the right-hand shaded future area and release the mouse/finger; it is saved automatically. Choose a previous prediction in the history to review it. **Viewing latest** returns to the current forecast.

Choose 1h/6h/24h/7d. Candles are 5m/15m/1h/6h, respectively. Timestral's local ONNX export has a 512-candle context and a 32-step horizon, sufficient for these four ranges.

The model downloads around 21MB when first used and runs through WebAssembly in a dedicated browser Worker; no Hugging Face inference server, Cloudflare Worker, or model API key. If it cannot initialize, the page explicitly falls back to deterministic momentum and historical-analog forecasts generated from real candles. The amber line **may be mostly flat** when the model finds little directional evidence; the code does not synthesize exciting swings.

## What really gets learned

Each completed forecast is a frozen record of the input time, source, historical context, horizon, original forecast, each candidate method's path and weighting, and the subsequently observed closing prices. A method's weight for **new** predictions can change only when it has sufficient older outcomes at the same horizon. When the naive unchanged-price baseline has consistently beaten forecasting methods, future predictions are shrunk toward that baseline. History is scored without look-ahead. A sudden market change does not guarantee prediction quality.

The saved local forecast is never re-anchored to the current price. When historical data is missing, a checkpoint remains pending. The app refuses to fabricate historical candles or predictions. Actual prices can disagree slightly between Coinbase and Kraken; forecasts are scored only against candles from the original source.

## Previous results and public sharing

- Browser `localStorage` retains up to 250 forecasts by default (adjustable); the old `btc-comparison-ledger-v2` sketches are imported once where timestamps exist, including linked Timestral predictions if they were saved.
- **Share selected result** copies a read-only `#review=...` URL containing one complete frozen prediction and its source timestamps. Another browser can open the link and fetch the actual closed-candle data. **No DeepSeek key is included in links.**
- **Export history / Import** moves your full research ledger between browsers. Clearing site storage deletes the local ledger unless previously exported.
- GitHub Pages has no shared database: there is **no automatic public all-users history feed**. People can review a result you share, but cannot automatically browse other users' private local predictions. That would require explicit shared storage.

## Optional DeepSeek live sentiment and budgeting

Settings allow entering a **direct** DeepSeek API key for news sentiment only; no cloud relay is required. It is optional, independent of the price model, and not claimed to influence a forecast's numerical path. Users can schedule checks from every 15 minutes to 6 hours, inspect expected input/output token usage, a full planned-session token/cost estimate, and actual tokens returned by DeepSeek. Caps are best-effort client-side controls, not provider-level billing guarantees. Browser cross-origin restrictions (CORS) can prevent direct DeepSeek calls; the app reports errors rather than pretending it succeeded. Keys are stored only in this tab's `sessionStorage`, never committed to GitHub, included in exports, or shared links.

Market feeds use public Coinbase WebSocket/REST, with Kraken ticker and OHLC fallbacks. No exchange keys or wallets, and no trading functionality. Risk alerts include 24h change and a fast-candle threshold.

## Technical notes

- Primary files: `index.html` (single responsive view), `app.js` (live data, chart, automation, persistence, sharing), `forecast-core.js` (pure prediction/scoring/calibration), `timestral-worker.js`, `timestral-prep.js`, and `deepseek.js`.
- Public Coinbase Exchange candles: `https://api.exchange.coinbase.com/products/BTC-USD/candles`, array `[time,low,high,open,close,volume]`; maximum 300 buckets/request. Kraken REST OHLC up to 720 observations.
- ONNX weights: [onnx-community/Timestral-5M-ONNX](https://huggingface.co/onnx-community/Timestral-5M-ONNX), © Mistral AI 2026, **Modified MIT**. Original model source: [mistralai/timestral](https://github.com/mistralai/timestral), code Apache-2.0. The `onnx-community` export's browser-safe context length is 512, prediction length 32.
- **GitHub Pages static-site limitation:** while a browser is closed, new predictions are not generated. On returning, previously saved forecasts can be scored retroactively against publicly available actual market candles; this is *not* backdating or fabricating forecasts. To operate 24/7 unattended across devices, a server/scheduled GitHub Action/public store would be needed. The current browser workflow does not claim to operate in the background when closed.

## Tests

Run `npm test` and `node --check app.js && node --check forecast-core.js`. Browser smoke testing uses intercepted Coinbase responses and a mocked model worker to validate the complete UI path without claiming live inference; tests cover frozen timestamp creation, closed-candle-only settlement, and future-only learning.

**Experimental research only, not financial advice.** Bitcoin forecasts are uncertain and are not guaranteed to beat a no-change baseline.