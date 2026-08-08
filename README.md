# Business Finder

A local discovery platform that connects customers with the businesses around them — built with **React** (Vite) on the front end and **Node.js** (Express) on the back.

The idea it implements: existing map services list mostly well-known businesses and show little beyond a name and a star rating. Business Finder is built around three things they don't do — **living business profiles**, **plain-language search**, and a **live open/closed map**.

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

That's the whole setup. The API seeds itself with 30 businesses, ~50 live updates and two weeks of interaction history on first boot, so the app is never empty and needs no external database.

| | |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:4000 |
| Requires | Node **22.5+** (uses the built-in `node:sqlite`) |

### Demo accounts

Password for both: `demo1234`

| Account | Email | What it shows |
|---|---|---|
| Customer | `customer@demo.test` | Favourites, follow notifications |
| Business owner | `owner@demo.test` | Dashboard for 4 businesses: post updates, view insights |

---

## What's built

### For customers

- **Natural-language search** — type "Where can I get vegan food that is open now?" or "a pharmacy that is open late". The app shows you how it understood the question above the results.
- **Live open/closed map** — green pins are open right now, red are closed, and an orange ripple marks businesses that posted in the last few hours. Hovering a result pans the map to it.
- **Living profiles** — each business page is a timeline of what's happening there today, not a static listing.
- **Happening feed** — everything the city posted, filterable by category, plus a separate tab for the places you follow with unread badges.
- **Favourites** — save a place, and its new posts appear in your feed.
- **One-tap actions** — call, directions, save. Each is recorded so the owner can see what the listing drives.

### For business owners

- **Post an update** in about ten seconds, with a type (offer / new / event / just in / news), an optional expiry, and promotion for paid plans.
- **Insights** — 14-day profile views with a trend against the previous week, plus directions, calls and follower counts.
- **Per-post view counts**, so it's obvious which updates actually pull people in.

### Design

- Full light and dark themes driven by CSS custom properties, with a single source of truth per token.
- Responsive down to phone width: the map/list split becomes a toggle, and a bottom tab bar replaces the top nav.
- `prefers-reduced-motion` respected; buttons, chips and pills are all keyboard reachable with visible focus rings.
- Photos degrade to a designed category glyph on a brand gradient when remote images are unavailable, so the UI still looks intentional offline.

---

## Natural-language search

Search has two interpreters behind one interface:

1. **Built-in** (default) — a phrase lexicon that maps plain English onto filters. No API key, no network, instant. It handles the intent categories the product depends on: open-now, late-night, price, quality, proximity, freshness, cuisine, diet and category.
2. **Claude** (optional) — set `ANTHROPIC_API_KEY` and the same query goes to the Claude API with a JSON schema, catching phrasings the lexicon misses.

The Claude path is a strict upgrade: any error, refusal or missing key falls back to the built-in interpreter, so **search never fails because of an AI outage**. The response tells the UI which one answered.

```bash
# optional
setx ANTHROPIC_API_KEY "sk-ant-..."     # Windows
export ANTHROPIC_API_KEY="sk-ant-..."   # macOS / Linux
```

---

## How open/closed is decided

Every business stores its own UTC offset, and hours are stored as minutes after local midnight. A closing time above 1440 means the shift runs past midnight — so a diner open 20:00–02:00 is stored as `1200 → 1560` and correctly reports "Open now" at 1am. The engine also reports *closing in 20 min* and *opens in 40 min*, which is what actually changes a customer's decision.

See [`server/src/hours.js`](server/src/hours.js).

---

## Project layout

```
business-finder/
├─ server/                    Express API + SQLite (node:sqlite, zero native deps)
│  └─ src/
│     ├─ index.js             All HTTP routes
│     ├─ db.js                Schema + query helpers
│     ├─ hours.js             Open/closed engine
│     ├─ businesses.js        Shaping, distance, ranking
│     ├─ search.js            Natural-language interpreters
│     ├─ auth.js              scrypt passwords + HMAC session tokens
│     ├─ seed.js              Seeder
│     └─ seed-data.js         The demo dataset
└─ web/                       React + Vite
   └─ src/
      ├─ store.jsx            User, favourites, location, theme, toasts
      ├─ api.js               Typed API client
      ├─ components/          Shell, SearchBar, BusinessCard, BusinessMap, ui
      └─ pages/               Discover, BusinessPage, Feed, Favourites, OwnerDashboard
```

### Ranking

Results blend five signals so the list reads like a good local guide rather than a database dump: proximity, whether it's open right now, how fresh its latest update is, its rating, and its subscription plan — the last being the revenue lever from the brief. See `score()` in [`server/src/businesses.js`](server/src/businesses.js).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + web together with live reload |
| `npm run dev:server` | API only, on :4000 |
| `npm run dev:web` | Web only, on :5173 (proxies `/api` to :4000) |
| `npm run seed` | Wipe and re-seed the demo database |
| `npm run build` | Production build of the web app into `web/dist` |
| `npm start` | Run the API alone |

## Configuration

All optional — the defaults work.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_FILE` | `server/data/business-finder.db` | SQLite file |
| `AUTH_SECRET` | dev value | **Change in production** — signs session tokens |
| `SEED_LAT` / `SEED_LNG` | Manama | Move the whole demo dataset to another city |
| `SEED_CITY` | `Manama` | City name shown in the UI |
| `SEED_TZ_OFFSET` | `180` | Minutes from UTC, used for open/closed |
| `ANTHROPIC_API_KEY` | — | Enables Claude-powered search |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model used for query interpretation |

---

## API reference

**Public**

```
GET    /api/meta                          City, categories, counts, AI status
GET    /api/businesses                    ?category&openNow&sort&lat&lng&limit
GET    /api/search                        ?q=&lat=&lng=  → results + interpretation
GET    /api/businesses/:idOrSlug          Full profile: hours, updates, reviews
POST   /api/businesses/:id/interaction    { type: call | directions | update_view }
GET    /api/updates                       ?category&limit — the city-wide feed
```

**Account**

```
POST   /api/auth/register                 { name, email, password, role }
POST   /api/auth/login                    { email, password }
GET    /api/auth/me
GET    /api/favourites
PUT    /api/favourites/:businessId
DELETE /api/favourites/:businessId
GET    /api/notifications                 Posts from places you follow
POST   /api/notifications/seen
```

**Business owner** (requires an `owner` account)

```
GET    /api/owner/businesses
GET    /api/owner/businesses/:id/insights
GET    /api/owner/businesses/:id/updates
POST   /api/owner/businesses/:id/updates          { body, kind, promoted, expiresInHours }
DELETE /api/owner/businesses/:id/updates/:updateId
PATCH  /api/owner/businesses/:id                  { tagline, description, phone, website, address }
```

---

## Notes for production

This is a complete, working product, but a few things are deliberately demo-grade:

- **Sessions** are HMAC-signed tokens in `localStorage`. Move to httpOnly cookies with refresh rotation.
- **SQLite** is ideal here (zero setup, no native build). At multi-city scale, move to Postgres with PostGIS so proximity filtering happens in the database rather than in memory.
- **Photos** come from a placeholder service; real listings need uploads plus a CDN.
- **Payments** for featured placement and promoted posts are modelled (`plan`, `promoted`) but not wired to a payment provider.
- **Notifications** are in-app. Push notifications need a service worker and a push service.
