# server

The API behind the videos site. It reads the same MySQL database as linkproxy (`resources`,
`categories` and `workflows`), hands out captcha passes and gate tokens, and is the only place a
post's Real URL is read.

## Flow

| # | Where | What happens |
| - | ----- | ------------ |
| 1 | videos `/` | Turnstile → `POST /api/pass` → a 12-hour pass (JWT) kept in the browser. `GET /api/videos` needs it. |
| 2 | videos `/r/<tag>` | `GET /api/videos/:tag` (no pass needed). Turnstile + **Get video** → `POST /api/videos/:tag/unlock`. |
| 3 | server | Verifies the captcha, signs a gate JWT `{ sub, fetchurl, step, pages }` and sends the browser to a random page from the news site's `pages.json` with `?token=`. |
| 4 | news page | **Continue to link** → **Click here** → 10 s countdown → **Click here to get link** calls `fetchurl` (`GET /api/gate`) with the JWT in `Authorization`. |
| 5 | server | Verifies the gate JWT (and that at least `GATE_MIN_WAIT_SECONDS` passed since it was issued), signs a 3-hour play token and answers `{ url: "<news>/player/?endpoint=<server>/api/play?token=…" }`. |
| 6 | news `/player/` | Fetches `GET /api/play?token=`: title, description, channel, poster, the stream (`source`) or iframe page (`embed`), and `related` items whose `href` goes back to the videos detail page. |

Only step 6 reads `real_url`. It runs the URL through linkproxy's active workflows, read straight
from the database, the same way linkproxy's `/resolve` does (first active workflow, by name, whose
Input node matches). Old ad-site links still work: `…/player/?url=<stream>` has the inner stream
resolved, and `…/embed/?url=<page>` becomes an iframe on the news player.

## Telegram fallback for blocked hosts

Some hosts only let their own website play their HLS/DASH streams (no CORS for other sites), so the
news player can't load them even though the link opens fine on its own in a browser. With
`TELEGRAM_APP_URL` set:

1. `/api/play` sends `external: { url: "<TELEGRAM_APP_URL>?startapp=<token>" }` with every video.
   If the stream's host doesn't allow the news site (checked once per host every 10 minutes), it
   leaves `source` out, and the player shows **One more step: Open in Telegram** instead of
   trying. If a stream fails to load for any other reason, the player shows the same step.
2. The Mini App (`news/tg/`) reads the token, shows the video, plays a rewarded ad, then calls
   `POST /api/app/claim` and opens the resolved video link in the visitor's browser.

The `startapp` token is signed and lasts an hour; it never contains the video URL. Set
`TELEGRAM_BOT_TOKEN` to also require genuine Telegram `initData` on the Mini App's requests.

## Run

```bash
npm install
cp .env.example .env   # fill in the database, JWT_SECRET and the three site URLs
npm run dev            # http://localhost:3000
```

The three URLs must agree with each other:

- `PUBLIC_URL`: this server, as browsers reach it.
- `VIDEOS_SITE_URL`: the videos site. Allowed by CORS; the player's Up next links point here.
- `NEWS_SITE_URL`: the news site. Allowed by CORS; its `pages.json` and `/player/` are used.

The videos site's `data/site.json` → `apiUrl` must be `PUBLIC_URL`.

## Workflow engine

`lib/engine/` is a copy of linkproxy's engine (`engine.js`, `nodes.js`, `helpers.js`,
`conditions.js`, `files.js`) so both run workflows identically. After changing them in linkproxy:

```bash
npm run sync-engine
```

Workflow lists are cached for 30 seconds, so edits in linkproxy reach this server within that.
A workflow's own **Cache** setting is honoured and resets whenever the workflow is saved. Runs made
here don't appear in linkproxy's History.

## Visit tracking

Both sites send `POST /api/visit` on every page load. The server stores a row in `visits` (created on
start) with the visitor's IP, the GeoLite country/region/city/coordinates and ISP/ASN for it, the
browser's network info, device, OS, browser, language and screen. linkproxy shows them under **Visits**.

- The IP comes from `CF-Connecting-IP` (Render is fronted by Cloudflare), falling back to `req.ip`.
- With `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` set, the GeoLite City and ASN databases are
  downloaded into `data/geoip/` on start and refreshed when older than 7 days. Without them only the
  IP is stored.
- Rows older than `VISIT_RETENTION_DAYS` (default 90) are deleted daily.
- Gate tokens and stream links (`token=`, `endpoint=`, `url=`, `startapp=`) are cut from the stored path.

## Endpoints

| Method | Path | Auth | Answer |
| ------ | ---- | ---- | ------ |
| GET  | `/api/config` | none | `{ sitekey }` |
| POST | `/api/pass` | `{ captcha }` | `{ token, expiresIn }` |
| GET  | `/api/videos` | `Bearer <pass>` | `{ videos: [...] }` (enabled posts, no Real URL) |
| GET  | `/api/videos/:tag` | none | `{ video, same, others }`, and counts a view |
| POST | `/api/videos/:tag/unlock` | `{ captcha }` | `{ next }`: the news page to open |
| GET  | `/api/gate` | `Bearer <gate JWT>` | `{ url }`: the news player link |
| GET  | `/api/play?token=` | play token | player JSON |
| GET  | `/api/app/video?token=` | app token (+ `initData`) | `{ title, poster, channel, durationSeconds }` |
| POST | `/api/app/claim` | `{ token, initData }` | `{ url }`: the video link to open |
| POST | `/api/visit` | allowed `Origin` | `204`; records a page view (body is JSON sent as `text/plain`) |

Captcha endpoints allow 30 attempts per IP per 10 minutes.
