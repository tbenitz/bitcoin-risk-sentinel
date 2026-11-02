# Bitcoin Risk Sentinel — Timestral Forecast Lab + DeepSeek

A self-contained Bitcoin monitoring dashboard for GitHub Pages: live BTC/USD spot, risk thresholds, optional position monitoring, hand-drawn future scenarios, DeepSeek sentiment analysis, and estimated versus actual AI token usage.

**No Cloudflare account or Worker. No market API key. No trading credentials.**

## Bitcoin Forecast Lab — real Mistral Timestral-5M

**This is an actual probabilistic time-series forecast, not a drawing extrapolation or a DeepSeek-written prediction.** It uses the Mistral Timestral-5M checkpoint, the same model family as [Sketch-a-Series](https://huggingface.co/spaces/townbox/sketch-a-series), with real BTC candles. It generates a median and 10–90% uncertainty band. The original freehand scenario tool is still available below the forecasting panel.

**To activate genuine model inference (one-time setup):**

1. Create a **Docker Space** at [Hugging Face Spaces](https://huggingface.co/new-space). Name it e.g. \`btc-timestral-model\`.
2. Copy the contents of the repository's [\`timestral-space/\`](timestral-space/) directory into the **root** of your new Space repository: \`README.md\`, \`Dockerfile\`, \`app.py\`.
3. Wait for the Space to build and run. Its base URL will look like \`https://YOURNAME-btc-timestral-model.hf.space\`; test \`/health\`.
4. Open https://tbenitz.github.io/bitcoin-risk-sentinel/ → **Forecast model settings**, paste that URL, and press **Save model settings**.
5. Select 1h, 6h, 24h or 7d and press **Forecast now** or **Start auto**. Each successful forecast persists in your browser.

GitHub Pages hosts the user interface but **cannot execute this Python/PyTorch model on its own**. This project deliberately includes a separate Hugging Face deployment template, not a Cloudflare Worker. The Space may sleep when idle and CPU processing/network limits vary. A model endpoint is not deployed automatically by uploading these files to GitHub. Without the endpoint, the site will honestly say a forecast is unavailable.

### How it measures and improves prediction quality

- Coinbase public **completed candles** are passed into Timestral (5-minute bars for 1h; 15-minute for 6h; hourly for 24h; 6-hour for 7d).
- The prediction is recorded with its as-of candle, model quantiles and target timestamps. We never label a hypothetical or future price as an observation.
- When future candles actually close, the page matches each forecast to its due time. It calculates percentage error, directional accuracy and how often the 10–90% band contains the actual BTC close.
- A **flat-price/no-change baseline** is scored side-by-side. After 24 verified prediction steps in a horizon, a simple adaptive layer updates model-versus-baseline weighting, bias correction and interval width from **previously scored data only**. Historical forecasts are never retroactively changed.
- Use **Export prediction history** to inspect every stored original median, adjusted forecast, quantile bounds and actual price. History remains in browser localStorage; clearing browser storage loses it. **This is calibration/model selection, not training Timestral weights.**

Important: 24 scored steps may be correlated or overlap because forecasts have multiple steps. Apparent improvements may be temporary; a model can have worse performance than a flat baseline during some market conditions. There is no guaranteed accuracy, profit, or financial advice. Neither a free public website nor a sleeping Space can run background checks while your browser is closed.

## Live Bitcoin prices (free public APIs)

- **Coinbase:** `wss://ws-feed.exchange.coinbase.com` public BTC-USD ticker for real-time trades, plus REST for the spot price, 24-hour statistics and price candles.
- **Kraken:** `https://api.kraken.com/0/public/Ticker?pair=XBTUSD` and public OHLC history as fallback.
- Market prices update independently of DeepSeek. If markets are inaccessible the UI reports an error, rather than inventing numbers.

## DeepSeek connection

1. Open your GitHub Pages site: https://tbenitz.github.io/bitcoin-risk-sentinel/
2. Open **Settings** → **DeepSeek API connection** and paste your own key.
3. Choose **DeepSeek Search API + Flash** (default) or **V4 Pro + built-in web search**, then select your sentiment-check interval.
4. Click **Check now** for an immediate news analysis, or **Start auto-checks** to repeat while the tab stays open.
5. Optionally draw a partial trajectory on the chart and select **AI continue**. The AI extension is illustrative, **not a price prediction**.

The browser sends requests directly to official DeepSeek endpoints:

- `POST https://api.deepseek.com/v1/tools/search` (Flash live search mode).
- `POST https://api.deepseek.com/responses` (Flash sentiment, optional sketch continuation, or V4 Pro with built-in web search).

The key is kept in **sessionStorage for this tab**, not committed to GitHub, written to localStorage, or included in session exports. Only enter it on a device you trust.

**Important browser CORS limitation:** The official DeepSeek documentation does *not* guarantee cross-origin requests from GitHub Pages are supported. If their API refuses browser origins, browsers will block direct `fetch` and the app will show a CORS/network error. A static site cannot override the provider's CORS policy. The Bitcoin price and risk features continue working without AI. Guaranteed cross-browser DeepSeek access would require a provider-supported browser API or a server relay, which is deliberately **not included** here.

## GitHub Pages publishing

On GitHub: **Settings → Pages → Deploy from a branch → main → / (root) → Save**. You do not need npm install, secrets, build steps, or Cloudflare to serve the site. A local `index.html` can also be opened in Chrome (internet is needed for live data).

## Risk options

Edit percentage drop, 24-hour drawdown, intraday range, stop-loss level relative to entry, hard USD price floor, BTC quantity, optional portfolio size and allocation cap, bearish sentiment threshold, hypothetical scenario downside, and notification cooldown. All trades are informational alerts only; **no order execution, wallets or accounts**.

## Usage and cost estimates

Set session duration, DeepSeek analysis frequency, expected input and output tokens/call, model, pricing assumptions and optional token / USD caps. The dashboard projects session-wide usage and records real usage from successful DeepSeek model API responses; web searches are counted separately. Price feeds use **zero DeepSeek tokens**.

A search may be billed even if its later model call fails. The browser's budgets are estimates rather than strict billing restrictions; set provider account limits if needed. Auto-checking only runs while the page is open, subject to background-tab throttling.

## Testing

```sh
npm test
node --check core.js
node --check deepseek.js
node --check forecast-engine.js
node --check forecast-ui.js
python3 -m http.server 8000
```

The tests mock the DeepSeek API so they do not use an actual API key. They verify request shapes, authentication headers, parsing, usage accounting and CORS error handling; they do not prove that DeepSeek permits browser CORS.

## Official references

- [Timestral-5M model card](https://huggingface.co/mistralai/Timestral-5M)
- [Official Timestral Python inference](https://github.com/mistralai/timestral)
- [Sketch-a-Series original demo](https://huggingface.co/spaces/townbox/sketch-a-series)
- [Coinbase Exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)
- [Kraken REST market data](https://docs.kraken.com/api/docs/rest-api/get-ticker-information/)
- [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

This dashboard is for personal research only, not financial advice.
