# Bitcoin Risk Sentinel

A polished browser dashboard combining **live BTC/USD spot quotes**, user-defined **risk alerts**, an interactive **sketch-a-series-style downside/upside scenario canvas**, **DeepSeek live-news sentiment**, and transparent **AI token/cost projections**. No trade execution or hidden sample prices.

![Status](https://img.shields.io/badge/price-Coinbase%20%2F%20Kraken-4adeb6) ![Runtime](https://img.shields.io/badge/frontend-static%20HTML-blue) ![Backend](https://img.shields.io/badge/DeepSeek-Cloudflare%20Worker-yellow)

## What's included

- **BTC/USD:** Coinbase Exchange public WebSocket ticker with REST polling and Kraken REST fallback. No market API key needed. Historical candles from Coinbase REST, falling back to Kraken OHLC. When neither responds, the chart says so; it will not invent data.
- **Optional AI continuation:** Draw the beginning of a hypothetical line in the future area and press **AI continue** to let DeepSeek Flash visually extend the remaining curve. The completion is a plausible *illustration*, never a validated price forecast. This request uses tokens but no web search and is counted in session actuals, not recurring-news projections.
- **Four chart ranges:** 1 day, 1 week, 1 month, 3 months. The future area accepts mouse, touch, or stylus drawings over 1h, 6h, 24h, or 7d. The line is a **user-drawn hypothetical**, not a model prediction or financial recommendation.
- **Risk thresholds:** 24h % drop, drawdown from the day's high, high–low range, configurable price floor, stop-loss relative to your entry, portfolio allocation, bearish news-sentiment level, and sketch downside. A notification/cooldown system triggers when an applicable rule is crossed.
- **DeepSeek web research:** Cheaper **Search API + DeepSeek Flash** mode is the default; optional **V4 Pro** with built-in web_search. Displays news links in Search+Flash mode, factors, score, confidence and freshness. A search tool call is not guaranteed to yield trustworthy or fresh news; if it does not return results, confidence should be low.
- **User-defined schedule:** every 5/10/15/30/60/180/360 minutes, only while the page is open. Click **Check now** for one-off analysis. Does not charge DeepSeek tokens for price streaming.
- **Token meter:** live estimates **per upcoming call** and across a configurable projected **whole session**; records provider-reported actual input/output/cached tokens, web searches/page fetches, historical checks, *estimated* USD cost, token budget and cost budget. Export a session JSON report. Browser refresh retains metering history **for this tab**. Auto-checks do not restart after refresh unless you click Start.
- **Security:** The public website never asks for or stores the actual DeepSeek API key. The Cloudflare Worker holds it as a secret; a separate random dashboard access token is required and is only stored in the tab's sessionStorage.

## 1. Create a new GitHub repository (public or private)

Create a repo called `bitcoin-risk-sentinel` via <https://github.com/new>, leave the GitHub-generated README unchecked, and upload **all files in this folder** (not the ZIP itself). This project includes a static frontend, Cloudflare Worker, unit tests, and a GitHub Actions validation workflow.

If you want a publicly accessible dashboard, choose **Public**. For a private repository, static Pages availability depends on your GitHub plan.

## 2. Enable GitHub Pages

Go to **Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**. Your site will be at:

`https://YOURNAME.github.io/bitcoin-risk-sentinel/`

Price streaming, drawing, and historical charting don't require the Worker; DeepSeek news sentiment and optional AI sketch completion do.

## 3. Set up the secure DeepSeek Worker

A Cloudflare account and a DeepSeek API key are required for AI analysis. The Worker deployment is separate from GitHub Pages because a public site cannot hide an API key.

1. In this repository, open `worker/wrangler.toml`, replace `https://YOURNAME.github.io` with your **exact website origin** (example: `https://tbenitz.github.io`). The origin is the scheme + hostname, **not** the `/bitcoin-risk-sentinel/` path. Multiple origins can be comma-separated; to test `file://` locally, include the literal origin `null` after checking your browser behavior.
2. In a terminal with Node.js 20+ (a GitHub Codespace is fine), run:

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put DASHBOARD_ACCESS_TOKEN
   npm run deploy
   ```

3. For `DASHBOARD_ACCESS_TOKEN`, use a unique random string of at least 16 characters, different from your DeepSeek key. Don't commit your secrets, paste them into GitHub Issues, or post them publicly.
4. Copy the Worker URL reported by Wrangler (e.g. `https://bitcoin-risk-sentinel-api.ACCOUNT.workers.dev`). Open your GitHub Pages site → **Settings** → enter that URL and the **dashboard access token** (not the DeepSeek API key) → **Save settings**.
5. Click **Check now** to test DeepSeek sentiment. To monitor it on a schedule, select an interval and click **Start auto-checks**.

**No CLI alternative:** In the Cloudflare dashboard, create a Worker, paste the contents of `worker/worker.js`, set **secrets** `DEEPSEEK_API_KEY` and `DASHBOARD_ACCESS_TOKEN`, and set a regular text variable `ALLOWED_ORIGIN` to the exact GitHub Pages origin. Deploy it, then use its URL in the app.

**Important:** If your Worker endpoint or access token becomes publicly known, unauthorized users could spend your DeepSeek credits. Restrict the origin and add Cloudflare rate limiting/Turnstile for public or multi-user deployments. CORS is browser protection, not a complete server-side access-control boundary; the access token is still needed.

## 4. Configure the application

- Price/market data starts automatically after loading the page; green dot means a real price was received. The quoted exchange is shown under the spot price.
- Set alert thresholds in **Settings**. Position quantity, entry, portfolio value, and price floor can stay `0` to disable those specific calculations.
- Choose **Search API + Flash** (default) for inexpensive current-web research and direct links to sources, or **V4 Pro + web search** if you want the model to perform searches internally. Pro mode may perform a variable number of tool calls; only reported successes are counted.
- Under **Session token and cost estimate**, set your monitoring length, per-call token assumptions, auto-check frequency, session caps, and peak/off-peak pricing assumption.
- Browser desktop alerts require a user gesture and notification permission. In-app activity still logs alerts even when desktop notifications are blocked.

## AI pricing and accounting

Prices in `core.js` are assumptions from the [official DeepSeek pricing page](https://api-docs.deepseek.com/quick_start/pricing/) checked November 2026. Flash and Pro cache-hit, cache-miss and output rates differ between peak and off-peak. The [Search & Fetch API](https://api-docs.deepseek.com/guides/search/) separately costs **$0.75 per 1,000 successful requests** for each search/fetch. These rates can change; update `core.js` if necessary. Peak hours also have calendar exceptions that the app does not detect automatically; pick the relevant cost assumption in Settings.

**Projected whole-session sentiment-check tokens** = tokens already recorded by successful calls + `max(0, ceil(sessionHours × 60 / intervalMinutes) − completedChecks)` × estimated tokens per check. Actual tokens come from `response.usage` after a *successful* DeepSeek call. If Search succeeds but an ensuing model request fails, the app may not be able to account for that separately billed search in its session total. Token and dollar budgets are conservative *pre-call estimates*, **not guaranteed hard provider billing ceilings**. Cloudflare or DeepSeek quotas are the actual enforcement points.

Example (not live market data): 6 hours with 30-minute checks means **12 planned calls**. If you estimate 2,500 input + 550 output tokens per check, the starting projected budget is **36,600 tokens** plus separately billed web searches.

## Privacy and limitations

- Browser risk settings, optional position details, and non-secret Worker URL are in `localStorage`; metering and your access token are in `sessionStorage`. Clearing browser storage resets them.
- No backend database, financial account connection, deposits, trades, or on-chain wallet keys.
- The website must stay open and online for scheduled checks; background-tab throttling or sleep can delay them. For reliable 24/7 checks use a separately scheduled Worker (not included).
- Exchange quotes can differ, REST feeds can be stale, and a failed history request means historical risk indicators may be unavailable. All user-drawn prices are **scenario illustrations only**.
- AI scores are subjective judgments of selected search results, not measured market probabilities. News can be incomplete, inaccurate, or malicious. Never treat a numerical sentiment score as a trading signal without your own research.
- Cloudflare Worker deployment may incur fees depending on usage and plan. DeepSeek requests are billed against your account.

## Development and tests

Open `index.html` in Chrome directly, or serve this folder with `python3 -m http.server 8000`. A local `file://` page can receive market WebSocket data, but the Worker will reject a `null` origin unless you explicitly allow it; HTTPS GitHub Pages is recommended.

```bash
npm test
node --check core.js
node --check worker/worker.js
```

The GitHub Actions workflow runs unit tests after each push.

## APIs and inspiration

- [Coinbase Exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)
- [DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/) and [DeepSeek Search & Fetch](https://api-docs.deepseek.com/guides/search/)
- [Sketch-a-Series demo](https://huggingface.co/spaces/townbox/sketch-a-series/): interaction inspiration; this project doesn't copy its code or model.

**For research and personal monitoring, not financial advice.**
