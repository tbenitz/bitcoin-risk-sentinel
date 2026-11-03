# Bitcoin Risk Sentinel — direct DeepSeek edition

A single-page Bitcoin monitor for GitHub Pages, with an interactive scenario sketch, configurable risk alerts, live BTC/USD data, optional DeepSeek news sentiment analysis and projected versus actual token accounting.

**No Cloudflare account, Worker, Node server, API gateway, database, or crypto exchange account is required for the dashboard.** `index.html`, `core.js`, and `deepseek.js` make up the functional browser app. There is no trading or wallet access.

## Live market data: no API keys required

- Coinbase Exchange WebSocket `wss://ws-feed.exchange.coinbase.com`, public `ticker` for BTC-USD. Updates on trades, rather than on a fixed one-second timer.
- Coinbase public REST fallback `https://api.exchange.coinbase.com/products/BTC-USD/ticker` and 24-hour statistics endpoint `.../stats`.
- Kraken public REST backup `https://api.kraken.com/0/public/Ticker?pair=XBTUSD` and public OHLC history.
- Candle history and charts reflect observed exchange data. If feeds are unavailable the UI says so; it never invents market prices.

Data sources: [Coinbase Exchange](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview), [Kraken](https://docs.kraken.com/api/docs/rest-api/get-ticker-information/).

## DeepSeek: enter your own key in Settings

1. Open the dashboard and click **Settings**.
2. Paste your DeepSeek API key under **DeepSeek API connection**; choose Search API + Flash (default) or V4 Pro web search.
3. Save, then select **Check now** to run one analysis. You can set a repeating interval and select **Start auto-checks**.
4. Draw part of a future path and click **AI continue** to extend that *hypothetical drawing*, not to predict Bitcoin's future.

DeepSeek calls from your browser are made directly to `https://api.deepseek.com/v1/tools/search` and `https://api.deepseek.com/responses` using the key you supplied. The search API provides up-to-date article summaries for the Flash model; V4 Pro has built-in web search. The app shows real input/output tokens reported by DeepSeek and per-search estimates. **Price streaming consumes zero DeepSeek tokens.**

### Important direct-browser limitation: CORS

**A static GitHub Pages site cannot force DeepSeek to accept cross-origin browser requests.** The DeepSeek documentation documents the API endpoints but does not guarantee browser CORS compatibility. If DeepSeek blocks `Origin: https://tbenitz.github.io`, a direct `fetch` will fail before the API response is made available to the page. The dashboard will tell you the failure rather than claiming the AI ran. That is a server policy outside the site's control; price monitoring, charting, and risk alerts still run without AI. No client-side trick can safely defeat browser CORS restrictions. To guarantee AI calls in all browsers would require an API provider that explicitly supports browser clients, or a server-side relay; **this project deliberately does not require or deploy either relay.**

### Key handling and safety

Your DeepSeek key is never committed to GitHub. It is sent in the HTTPS Authorization header to DeepSeek when you invoke AI, and stored in this tab's `sessionStorage` to survive refresh, not in `localStorage` or exported session JSON. Clearing the tab's session data removes it. Because this is a public browser app, use only your own key, keep your device secure, and set a spending budget in the DeepSeek account as well. **Frontend code cannot provide server-side secrecy or guarantee a billing cap.** Do not share screenshots containing your key. The app does not store exchange credentials, seed phrases or wallet keys.

## GitHub Pages

In your repo, open **Settings → Pages**, choose **Deploy from a branch**, `main`, `/ (root)`, and save. Expected public URL: `https://tbenitz.github.io/bitcoin-risk-sentinel/`. You can also open `index.html` locally in Chrome; internet access is required for live prices and DeepSeek.

## Risk monitoring and scenarios

Configurable price drop, 24h drawdown, volatility range, absolute price floor, entry-based stop-loss warning, position allocation, bearish AI sentiment, sketched downside and alert cooldown. Position size, entry price and portfolio value are optional. No financial recommendations or trade execution. Notifications depend on browser permission.

AI checks run only while the page is open; tab sleep can delay them. Sketch continuation uses DeepSeek Flash for *illustration*, not validated forecasting. Sentiment scores are subjective and sources can be incomplete or wrong. No simulated price data is shown.

## Token/cost projections

Estimate hours, interval, assumed input/output tokens per call, model and peak/off-peak prices. The dashboard projects checks and token/cost totals, counts successful DeepSeek calls, and records actual input/output/cache token usage returned by the API. Search/Fetch calls are billed separately from tokens. Budget limits are preliminary **client-side estimates**, not a guarantee that a partially completed or failed request cannot incur charges. A web search can incur a separate fee even when the following model request fails.

See [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/), [DeepSeek Responses](https://api-docs.deepseek.com/guides/responses_api/), [official pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## On-device Timestral-5M Bitcoin forecasting

The **Forecast Lab** runs the actual Mistral Timestral-5M weights on your own device in Chrome/Chromium via ONNX Runtime Web. No Hugging Face Space, Cloudflare Worker, Python backend, subscription, or inference API key is required. The CPU/WebAssembly backend is used inside a Web Worker, so inference does not freeze the interface.

1. Open your GitHub Pages dashboard in Chrome and click **Forecast now** (or open **Forecast settings** and press **Download / initialize model**).
2. The browser fetches the **21,212,151-byte / 21.2 MB** Timestral-5M ONNX model directly from Hugging Face once and caches it in **IndexedDB** for subsequent visits. The ONNX Runtime JavaScript/WASM files are fetched from jsDelivr. A network connection is needed for initial assets and fresh BTC candles. If site data or cache is cleared, the model downloads again.
3. Public Coinbase Exchange REST endpoints supply real, complete historical candles. This is **price-data retrieval**, not a Timestral inference API. The observed BTC prices stay in the browser for the forecast; model inference is local.
4. Forecast output includes median, 10th and 90th quantile levels over a maximum **32-step horizon**, the limit of this published ONNX export. Available choices are 1h (12×5min), 6h (24×15min), 24h (24×1h) and 7d (28×6h).
5. As real future candles close, the app records realized error, directional accuracy, 80% interval coverage, and a *no-price-change* benchmark. The adaptive calibration uses only already-settled outcomes; it does **not retrain the model's weights**. Forecast history is saved in localStorage. No imaginary market prices are used for performance scoring.

The browser-on-device ONNX export is hosted at [onnx-community/Timestral-5M-ONNX](https://huggingface.co/onnx-community/Timestral-5M-ONNX) and derives from [Mistral AI's Timestral-5M](https://huggingface.co/mistralai/Timestral-5M). The weights are provided under **Mistral's Modified MIT License** (model attribution: © 2026 Mistral AI; restrictions apply to some high-revenue commercial uses). Original `timestral` inference code is under Apache 2.0. See the model's license before redistributing weights or using them commercially. This repository does not ship model weights and downloads the official ONNX weights from Hugging Face on first use. Browser normalization/masks/denormalization match the published ONNX reference's fixed 512-context, 32-output shape.

**Important:** The underlying example [Sketch-a-Series](https://huggingface.co/spaces/townbox/sketch-a-series) uses Timestral inference on the Space server's CPU. This implementation instead runs a separate published ONNX conversion of the same Timestral-5M model **inside your browser**. A server is not needed for model predictions, but Internet connectivity is needed for new BTC market data and optional DeepSeek sentiment. Background auto checks run only while the tab is open; browser tab throttling may delay them. Financial price forecasts are uncertain and are not trading advice.

## Development and tests

No frontend build process is needed. The forecasting runner is `timestral-worker.js`, preprocessing is `timestral-prep.js`, and the UI is `forecast-ui.js`. The ONNX Runtime package downloads on first use. Run:

```bash
npm test
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Unit tests verify preprocessing, output dimensions, pricing/risk calculations, and mocked DeepSeek requests, not live model execution, market response, or DeepSeek browser CORS.


## Locked drawing vs Timestral vs verified BTC (new)

The **Draw · Lock · Verify** chart records predictions at the BTC price and timestamp that existed when drawing began. It does not recenter the drawing on later live quotes or slide the prediction window as time passes. Draw in the shaded area, click **Lock & compare**, and select saved predictions from the Review dropdown. The locally executed Timestral model is requested for the same horizon, with its actual forecast origin recorded separately. The chart overlays the immutable purple drawing, amber Timestral median and range, and cyan **real** exchange price observations at their original timestamps. A vertical LIVE marker moves forward; *the drawings do not*.

Coinbase closed candles are backfilled on page reopen and periodically refreshed every minute. Live ticker samples are shown when the tab is open; **accuracy is calculated only from completed actual candles**, never from fabricated prices or candles that have not closed. Counts and percentage errors are displayed separately for your sketch and Timestral, and shared-checkpoint comparisons use identical actual observations to avoid misleading side-by-side scores. Entries store the original drawing, price, time, and model association in localStorage (up to 60), with JSON export. Automatic forecasts are still governed by the Forecast Lab's separate timer; the drawing itself is immutable after locking.

A locked forecast cannot truthfully be graded before its target timestamps arrive. Older drawings created in the previous version were not saved with a timestamp, so they cannot be reconstructed into accurate historical forecasts. Starting a new drawing creates a properly timestamped record. The verification timeline is based on actual UTC epoch timestamps; the displayed labels use the local browser timezone. The model is not retrained in-place; the existing calibration adjusts future model output based on previously settled predictions. Historical performance is not a guarantee of future accuracy.


## Why Timestral can look flat, and new local forecast methods

Timestral-5M predicts a **conditional median**, which can be close to the last Bitcoin price even when its quantile bands are wide. That is a legitimate model output, not a software error; the median alone is not a promise of a flat market. The small on-device model may not find an exploitable trend in BTC.

To provide other meaningful *testable* predictions, the Draw · Lock · Verify chart now displays optional independent paths computed on-device **only from previously closed Coinbase candles**:

- **Historical pattern analog (lime):** finds past BTC return sequences resembling the latest 24 candles, takes their actual next-price continuations, volatility-adjusts them, and computes a weighted candidate continuation.
- **Recent momentum (pink):** extrapolates the recent 6/18/48-candle trend with decaying weights, so up, down and slowing moves derive from observations rather than drawn decoration.
- **Closest historical continuation (pale dashed):** the single closest past match. This is an *illustrative analog*, not a conditional mean, confidence interval or guarantee; it often turns sharply but need not recur.
- **Walk-forward winner (blue):** selects the lowest-error method among analog, momentum, and a no-change baseline on up to 16 strictly historical rolling trials. If no-change wins, the blue line stays flat rather than fabricating oscillations. The original Timestral forecast remains separate and amber.

At lock time, each path is frozen with its origin timestamp, candle count, prices, and backtest summary. Prediction history and the checkpoint table compare all methods with subsequent **real completed BTC candles**; old records are never filled in using future information. Two requests of no more than 280 Coinbase candles retrieve up to 512 closes for Timestral and signal calculations. Candles are cached per timeframe and candle close to avoid repeated requests while waiting for the next bar. Forecasting is local and free of DeepSeek tokens. None of these models should be relied on to predict investment returns; price signals are experimental and can underperform a no-change baseline.