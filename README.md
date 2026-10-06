# Owl Volume Tracker (FAU)

FAU-themed market volume tracker with a beige theme. The page opens with up to 20 stocks, and a toggle picks which list: **At/below WMA** (default: S&P 500 stocks at or below their 200-week moving average, deepest discount first), **Sweetspot** (stocks at the 200 WMA, up to 1% above, down to 7% below it; good buy setups first, then ones trading above last week's close, flagged "Turning up"), **S&P Top 20** (the 20 largest companies by index weight) or **Extended** (S&P 500 stocks more than 30% above their 200 WMA, most extended first). The choice is remembered in the browser. Click any card to drill in. For any ticker it shows:

- **Volume by hour, day, week and month.** Each timeframe shows the last completed period, the current period so far, the average, and relative volume (RVOL).
- **200-week moving average (200 WMA)** charted against weekly closes, with a +10% buy-zone band.
- **Buy signals.** DOWN PRESSURE when price is more than 30% below the 200 WMA; WEAK BUY when it is 10–30% below; STRONG BUY when it is at the 200 WMA or up to 10% below; BUY ZONE when it is up to 10% above. A day RVOL of 1.5× or more counts as volume confirmation.
- **Owl Scanner.** A watchlist ranked by distance to the 200 WMA, so the best opportunities sit at the top. The watchlist is saved in the browser.

Data comes from Yahoo Finance's public chart API (no API key) through a Netlify Function. Educational use only, not financial advice.

## Company profile and analyst ratings

Selecting a stock shows, in the same box as its name, an **About** section (what the company does, sector, industry, headquarters, employees, website) and **Analyst ratings**: the share of Wall Street analysts rating it Buy, Hold or Sell (out of 100%), the consensus, and the average 12-month price target. Data comes from Yahoo's quoteSummary through `GET /api/profile?symbol=XYZ` (cached 6 hours). That endpoint needs a Yahoo session cookie and crumb, which `netlify/lib/yahoo.mjs` fetches and reuses. Strong Buy counts as Buy and Strong Sell as Sell, and a tie leans to Hold. ETFs have no analyst ratings, so only the description shows.

## Market context, review and entry plan

Every signal is compared with the overall market:

- **Market phase.** The S&P 500 (`^GSPC`) is checked against its own 200 WMA. Above it means a long-term bull phase, and a banner says pullbacks in quality stocks are more attractive. Below it means be selective and defensive.
- **Setup tags.** Each signal gets a tag that combines the market phase with the stock's own 200 WMA direction (rising or falling over 13 weeks): *Good buy setup* (within 10% below to 5% above a rising WMA in a bull market), *Be selective* (same zone, bear market), *Breakdown risk* (the stock's WMA is falling), *Wait for pullback* (5–10% above: don't chase).
- **Review & entry plan** (on each stock). The review is triggered when price is within 5% of the 200 WMA. Checklist: fundamentals and valuation (manual, with links to Yahoo financials and key statistics; Yahoo doesn't serve those to the site without a login), plus technical context and market phase filled in automatically. The plan stages thirds at +5%, at, and −5% of the 200 WMA, with a stop under the last third at 2× the stock's typical weekly move (3% minimum, 15% maximum), and sizes shares from the user's account size and risk per trade (saved in the browser).

## Accounts (log in and profile)

The **Log in** button in the header opens a sign-up / log-in form (email and password). A profile stores a display name, the view the site opens on, and the Owl Scanner watchlist, so they follow the user to any device. Auth and storage use Supabase (project `tufyhrugtpfhaxvgpliw`, table `public.profiles`, row level security so each user can only read and change their own row). The publishable key in `public/auth.js` is safe to ship to browsers.

**One-time setup in Supabase:** Authentication → URL Configuration → set **Site URL** to the Netlify site URL and add it under **Redirect URLs**, so confirmation and password-reset emails link back to the site instead of localhost.

## AI City (`/ecosystem/`)

A 3D map of Resilience Enterprise's AI ecosystem as a small city. Districts are departments (Sales, CRM, Automation, Delivery, Creative, Build), buildings are AI tools and systems, and named agents walk the streets between them doing tasks, with a live activity feed and output counters. Click a building to see what it runs on and what it hands work to; click an agent to see its task loop or follow it with the camera.

Edit `public/ecosystem/data.js` to change districts, buildings, agents and their tasks. Three.js is vendored in `public/vendor/three/`.

## Structure

```
public/                        static site (index.html, styles.css, app.js, auth.js, vendored Chart.js and Supabase)
netlify/functions/market.mjs   GET /api/market?symbol=XYZ, fetches and summarizes Yahoo data
netlify/functions/top.mjs      GET /api/top, snapshot of the S&P 500 top 20 (cached 5 min)
netlify/functions/profile.mjs  GET /api/profile?symbol=XYZ, company description + analyst consensus (cached 6 h)
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
