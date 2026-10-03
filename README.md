# Owl Volume Tracker (FAU)

FAU-themed market volume tracker with a beige theme. The page opens with up to 20 stocks, and a toggle picks which list: **At/below WMA** (default: S&P 500 stocks at or below their 200-week moving average, deepest discount first), **S&P Top 20** (the 20 largest companies by index weight) or **Extended** (S&P 500 stocks more than 30% above their 200 WMA, most extended first). The choice is remembered in the browser. Click any card to drill in. For any ticker it shows:

- **Volume by hour, day, week and month.** Each timeframe shows the last completed period, the current period so far, the average, and relative volume (RVOL).
- **200-week moving average (200 WMA)** charted against weekly closes, with a +10% buy-zone band.
- **Buy signals.** DOWN PRESSURE when price is more than 30% below the 200 WMA; WEAK BUY when it is 10–30% below; STRONG BUY when it is at the 200 WMA or up to 10% below; BUY ZONE when it is up to 10% above. A day RVOL of 1.5× or more counts as volume confirmation.
- **Owl Scanner.** A watchlist ranked by distance to the 200 WMA, so the best opportunities sit at the top. The watchlist is saved in the browser.

Data comes from Yahoo Finance's public chart API (no API key) through a Netlify Function. Educational use only, not financial advice.

## AI City (`/ecosystem/`)

A 3D map of Resilience Enterprise's AI ecosystem as a small city. Districts are departments (Sales, CRM, Automation, Delivery, Creative, Build), buildings are AI tools and systems, and named agents walk the streets between them doing tasks, with a live activity feed and output counters. Click a building to see what it runs on and what it hands work to; click an agent to see its task loop or follow it with the camera.

Edit `public/ecosystem/data.js` to change districts, buildings, agents and their tasks. Three.js is vendored in `public/vendor/three/`.

## Structure

```
public/                        static site (index.html, styles.css, app.js, vendored Chart.js)
netlify/functions/market.mjs   GET /api/market?symbol=XYZ, fetches and summarizes Yahoo data
netlify/functions/top.mjs      GET /api/top, snapshot of the S&P 500 top 20 (cached 5 min)
netlify/functions/screen.mjs   GET /api/screen, screens all S&P 500 stocks vs the 200 WMA (cached 15 min)
netlify/lib/sp500.mjs          full S&P 500 constituent list (refresh when the index changes)
netlify/lib/top20.mjs          top 20 ticker list (edit when rankings shift)
netlify/lib/metrics.mjs        volume, 200 WMA and signal math
public/ecosystem/              AI City 3D page (data.js holds the city, city.js the layout, app.js the scene)
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
