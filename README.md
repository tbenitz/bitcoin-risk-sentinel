# Bitcoin Risk Sentinel — Direct DeepSeek edition

A self-contained Bitcoin monitoring dashboard for GitHub Pages: live BTC/USD spot, risk thresholds, optional position monitoring, hand-drawn future scenarios, DeepSeek sentiment analysis, and estimated versus actual AI token usage.

**No Cloudflare account or Worker. No market API key. No trading credentials.**

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
python3 -m http.server 8000
```

The tests mock the DeepSeek API so they do not use an actual API key. They verify request shapes, authentication headers, parsing, usage accounting and CORS error handling; they do not prove that DeepSeek permits browser CORS.

## Official references

- [Coinbase Exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)
- [Kraken REST market data](https://docs.kraken.com/api/docs/rest-api/get-ticker-information/)
- [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

This dashboard is for personal research only, not financial advice.
