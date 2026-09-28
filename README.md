# Owl Volume Tracker (FAU)

FAU-themed market volume tracker with a beige theme. The page opens with the **S&P 500 Top 20**: the 20 largest companies by index weight, each with price, day change, volume and a 200 WMA signal. Click any card to drill in. For any ticker it shows:

- **Volume by hour, day, week and month.** Each timeframe shows the last completed period, the current period so far, the average, and relative volume (RVOL).
- **200-week moving average (200 WMA)** charted against weekly closes, with a +10% buy-zone band.
- **Buy signals.** STRONG BUY when price is at or below the 200 WMA; BUY ZONE when it is up to 10% above. A day RVOL of 1.5× or more counts as volume confirmation.
- **Owl Scanner.** A watchlist ranked by distance to the 200 WMA, so the best opportunities sit at the top. The watchlist is saved in the browser.

Data comes from Yahoo Finance's public chart API (no API key) through a Netlify Function. Educational use only, not financial advice.

## Structure

```
public/                        static site (index.html, styles.css, app.js, vendored Chart.js)
netlify/functions/market.mjs   GET /api/market?symbol=XYZ, fetches and summarizes Yahoo data
netlify/functions/top.mjs      GET /api/top, snapshot of the S&P 500 top 20 (cached 5 min)
netlify/lib/top20.mjs          top 20 ticker list (edit when rankings shift)
netlify/lib/metrics.mjs        volume, 200 WMA and signal math
tests/                         node:test unit tests (npm test)
netlify.toml                   Netlify config (publish dir, functions dir)
```

## Deploy to Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub → `worm676/ISM4421`**.
2. Branch: whichever branch holds this code. Leave the build settings alone; `netlify.toml` sets them (publish `public`, functions `netlify/functions`).
3. Deploy. No environment variables or API keys are needed.

Using the CLI instead: `npm i -g netlify-cli && netlify deploy --prod`.

## Local dev

```
npm i -g netlify-cli
netlify dev        # serves the site plus /api/market at http://localhost:8888
npm test
```
