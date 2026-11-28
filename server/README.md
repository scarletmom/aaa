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
Input node matches). An Iframe post (`real_url_type = 'iframe'`) is shown as is unless its
`run_workflow` is on; then its page URL goes through the workflows too. Old ad-site links still work:
`…/player/?url=<stream>` has the inner stream resolved, and `…/embed/?url=<page>` becomes an iframe
on the news player.

## Accounts

The videos site works on a pass (access token) and the captcha (how a new pass is earned): every page
asks for the captcha in a modal when there's no valid pass, and again whenever the server answers
`pass_required`. Pressing play on a video sends the visitor to the blogsite as `<BLOGSITE_URL>/videos/?v=<tag>#access=<pass>`, in a new tab.

| Role | Created by | Videos on the blogsite |
| ---- | ---------- | ---------------------- |
| `member` | `POST /api/register` without a pass (someone who came to the blogsite directly) | no |
| `member-lite` | `POST /api/register` with `Authorization: Bearer <pass>`; a `member` becomes one by signing in with a pass (`/api/login`) or arriving with one while signed in (`/api/account/videos-access`), which is where the Upgrade button leads (below) | yes, with ads |
| `member-pro` | a purchase, or an admin changing `accounts.role` (find the row with `npm run account-key`) | yes, no ads |

**Upgrade from the blogsite.** A signed-in `member` presses Upgrade and picks Lite or Pro. The blogsite asks
`POST /api/account/upgrade-link`, which answers with the videos site's address plus `#upgrade=<token>` (audience
`member-upgrade`, `{ sid, plan }`, 30 minutes), so the videos site's address is only ever given to a signed-in Member,
never written into the blogsite's pages. The videos site shows its captcha (only if it has no valid pass), then calls
`POST /api/upgrade/continue` with the pass and the token, and sends the visitor to the answer, `<NEWS_SITE_URL>/videos/`
(`?upgrade=pro` for Pro), with `#access=<pass>`. There `/api/account/videos-access` makes them Member Lite, and for Pro
checkout opens for the plan they picked before leaving (kept in the tab's `sessionStorage`). One captcha in all.

The account number is 16 random hex characters (xxxx-xxxx-xxxx-xxxx, 64 bits) made by the server; accounts made
before that keep their UUID. It is the only login, so it is never stored: `accounts.account_key` (also
`pro_checkouts.account_key`) is its HMAC-SHA256 under `ACCOUNT_PEPPER`, which lives only in the server's environment.
A copy of the database alone can't be used to log in. The number is sent once, in the `/api/register` answer (or
`/api/account/new-number`), and never again.

**`ACCOUNT_PEPPER` must never change or be lost**: every login depends on it. Every server on one database needs the
same value. `server_settings.account_pepper_check` records which pepper the database was keyed with, and a server
whose pepper doesn't match refuses to start instead of touching the data. To find an account's row (e.g. to make it
Pro by hand): `npm run account-key -- xxxx-xxxx-xxxx-xxxx`.

Databases from before keying hold plain numbers in `account_number`. On start the server keys every row of
`accounts` and `pro_checkouts` in one transaction, gives each account a new random `public_id`, and renames the
columns to `account_key`. The blogsite moves the comments and likes it kept under the old id to the new one.

Each sign-in (register, login) opens a row in `account_sessions`, and the account JWT (audience `videos-account`,
`{ sid }`, 30 days) carries only that row's random id. The blogsite renews the token with `GET /api/account` on each
page load, which also marks the session used and picks up role changes. A token whose session has ended stops working
everywhere at once.

An account can be signed in on `MAX_DEVICES` devices at once (default 2). Signing in on another ends the session used
least recently; its device is told why (`401 device_limit`) and the blogsite shows that on its sign-in dialog. Signing
in itself always works, so someone holding a shared number can't lock the owner out; the owner's answer is a new
number. Log out ends the session on the server too, freeing its place. Ended sessions are kept, with the reason,
until their last token would have expired, then cleared on start.

Tokens from before sessions (`{ sub: accountNumber }`) only work at `GET /api/account`, which trades one for a session
(counted like any sign-in). The tables are created on start, and missing columns are added.

The blogsite's account menu has Account security. Both actions need the current account number as well as a token,
so a stolen token alone can't lock the owner out:

- `POST /api/account/sign-out-others` ends every other session; this device stays signed in.
- `POST /api/account/new-number` also swaps the account number for a new one (its open `pro_checkouts` and sessions
  follow it) and sends the new number once. `public_id`, the random id the sites tag the account's comments, likes
  and ad-free pass with, stays the same.

### Ad-free passes

The sites never trust the stored `role` to switch ads off: it's in localStorage and anyone can edit it. Instead
every session answer for a Member Pro account carries `adFree`, an ES256 JWT (audience `ad-free`,
`{ sub: public_id }`) that ends at `pro_until` or after 7 days, whichever is sooner; other roles get
`null`. The blogsite and its `/player/` check it with the public key alone, so a pass can't be forged, edited, or
moved to another account. Anything that doesn't check out means ads.

The key pair is derived from `JWT_SECRET`, so changing that secret changes the key. Put the public key in the
blogsite's `web/src/data/site.json` as `adFreeKey` (its production build refuses to run without it):

```sh
npm run ad-free-key   # with the production JWT_SECRET; the server also logs it on start
```

The blogsite is `NEWS_SITE_URL` here, so CORS allows it; in local development that's
`http://localhost:5174`.

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
- A signed-in visitor on the news site also sends their account token as `account`. When it belongs to a
  live session, the visit's `account_id` is set to the account's `public_id` (which survives a new account
  number); any other token is ignored, so visits can't be pinned on someone else. The videos site has no
  sign-in, so its visits stay anonymous.
- Gate tokens and stream links (`token=`, `endpoint=`, `url=`, `startapp=`) are cut from the stored path.

## Endpoints

| Method | Path | Auth | Answer |
| ------ | ---- | ---- | ------ |
| GET  | `/api/config` | none | `{ sitekey, adFreeKey }` |
| POST | `/api/pass` | `{ captcha }` | `{ token, expiresIn }` |
| POST | `/api/register` | `{ fullname, captcha }`, optional `Bearer <pass>` | `201 { token, expiresIn, id, name, role, proUntil, adFree, accountNumber }`: `member-lite` with a pass, `member` without |
| POST | `/api/login` | `{ accountNumber, captcha }`, optional `Bearer <pass>` | `{ token, expiresIn, id, name, role, proUntil, adFree }` (`id` is the account's `public_id`); a valid pass turns a `member` into `member-lite` |
| POST | `/api/account/videos-access` | `Bearer <account JWT>`, `{ pass }` | the session answer, with a `member` turned into `member-lite`. 401 `pass_required` if the pass is invalid |
| GET  | `/api/account` | `Bearer <account JWT>` | the same, with the role re-read from the database and a new token. 401 `device_limit` when another device took this one's place, `session_expired` otherwise |
| POST | `/api/logout` | `Bearer <account JWT>` | `204`; the token's session ends |
| POST | `/api/account/sign-out-others` | `Bearer <account JWT>`, `{ accountNumber }` | the session answer; every other session ends. 403 `wrong_account_number` if the number isn't this account's |
| POST | `/api/account/new-number` | `Bearer <account JWT>`, `{ accountNumber }` | the same plus the new `accountNumber`; the old number stops logging in |
| POST | `/api/account/upgrade-link` | `Bearer <account JWT>` (a `member`), `{ plan: "lite" \| "pro" }` | `{ url }`: the videos site with `#upgrade=<token>`; 409 `already_upgraded` for Lite and Pro |
| POST | `/api/upgrade/continue` | `Bearer <pass>`, `{ upgrade }` | `{ url }`: the blogsite page to return to (the caller adds `#access=<pass>`); 400 `upgrade_expired` for a bad or old token |
| GET  | `/api/videos` | `Bearer <pass>` or a Member Lite/Pro account token | `{ videos: [...] }` (enabled posts, no Real URL); other accounts get 403 `plan_required` |
| GET  | `/api/videos?page=N` | the same; optional `q` (search words), `channel` (category name), `pageSize` (default 40, max 100) | `{ videos, page, pages, pageSize, total, channels: [{ name, avatar, count }] }`: one page of the matching posts; `channels` lists every category with its post count, its avatar falling back to its newest thumbnail |
| GET  | `/api/shorts` | `Bearer <pass>` or a Member Lite/Pro account token | `{ shorts: [{ id, title, videoUrl, type, thumbnail, durationSeconds, createdAt, category }] }`: enabled shorts, newest first (`type` is `hls`, `dash` or `native`) |
| GET  | `/api/terabox/videos?page=N&sort=S` | a Member Lite/Pro account token | `{ videos: [{ key, title, teraboxUrl, thumbnail, duration, views, createdAt }], page, pages, pageSize, total, sort }`: 40 per page (optional `q`, `pageSize`), only videos with a Terabox URL. `sort` is `trending` (most views in the last 7 days, then most views overall), `popular` (most views overall) or `recent` (newest first, the default) |
| POST | `/api/terabox/videos/:key/view` | a Member Lite/Pro account token | `204`: adds a view once a saved video opens in the player (to its total and to today's count in `terabox_video_views`, which Trending sums); `404` for an unknown or unfinished video |
| GET  | `/api/videos/:tag` | `Bearer <pass>` or a Member Lite/Pro account token | `{ video, same, others }`, and counts a view; an account token also gets `play`, a signed `/api/play` endpoint for the player |
| POST | `/api/videos/:tag/unlock` | `{ captcha }` | `{ next }`: the news page to open |
| POST | `/api/pro/checkout` | `Bearer <account token>`, `{ plan: "week" \| "month" \| "lifetime" }` | `{ url }`: Dodo's checkout page for that plan (503 `payments_off` without `DODO_API_KEY`) |
| POST | `/api/pro/webhook` | Dodo's signed webhook (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | 204; on `payment.succeeded` grants the plan once |
| GET  | `/api/gate` | `Bearer <gate JWT>` | `{ url }`: the news player link |
| GET  | `/api/play?token=` | play token | player JSON |
| GET  | `/api/app/video?token=` | app token (+ `initData`) | `{ title, poster, channel, durationSeconds }` |
| POST | `/api/app/claim` | `{ token, initData }` | `{ url }`: the video link to open |
| POST | `/api/visit` | allowed `Origin` | `204`; records a page view (body is JSON sent as `text/plain`) |

Captcha endpoints allow 30 attempts per IP per 10 minutes.

## Member Pro payments (Dodo Payments)

One Pay What You Want product (`DODO_PRODUCT_ID`, one-time, minimum $0.50) sells all three plans; the server sets
the amount per plan (`lib/pro.js`: week 50¢ / 7 days, month 100¢ / 30 days, lifetime 500¢), so the buyer never types a
price. Prices must match `blogsite/web/src/data/pricing.json`.

1. `POST /api/pro/checkout` saves a `pro_checkouts` row under a random `ref` and creates the Dodo checkout with
   `metadata: { ref, plan }`. Dodo never sees the account number. Dodo returns the buyer to `<NEWS_SITE_URL>/videos/?pro=<ref>`.
2. That page calls `POST /api/pro/confirm { ref }` until it's settled. The server reads the checkout and its payment from
   Dodo's API (`GET /checkouts/:id`, `GET /payments/:id`), never trusting the return URL, and grants the plan once the
   payment has `status: "succeeded"` and our `ref`. This needs no public URL, so it works on localhost.
3. The webhook (`<PUBLIC_URL>/api/pro/webhook`, signed with `DODO_WEBHOOK_SECRET`) runs the same check for buyers who close
   the tab before returning. It's a backup: without it, those buyers turn Pro the next time their return page checks.
4. Week and month set `accounts.pro_until`, extending any time left; lifetime clears it. When `pro_until` passes, the
   account drops back to `member-lite` the next time it's read. Pro with no `pro_until` (lifetime, or set by an admin) never ends.

Adaptive pricing may charge the buyer in their own currency; the USD settlement amount is what's logged.
The API key needs Checkout Sessions: Write and Payments: Read.

For production, add the webhook URL in the Dodo dashboard and subscribe it to `payment.succeeded`. A `dodo_test_` key uses
test.dodopayments.com; a `dodo_live_` key uses live.dodopayments.com.

