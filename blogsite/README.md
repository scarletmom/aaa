# Quillwood Notes

A static, fictional blog whose content is loaded entirely from the `data/` folder. All stories, people, places and organisations are fictional.

## Run

Browsers block `fetch()` from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Build (`dist/`)

```sh
npm install
npm run build     # regenerates pages.json, then writes dist/
npm run preview   # serves dist/ at http://localhost:8080
```

`dist/` is the folder to deploy. It's a copy of the site with every file in `assets/js/` obfuscated by `javascript-obfuscator` (settings in `scripts/build-dist.js`). `README.md`, `scripts/`, `package*.json` and `node_modules/` are left out. Edit the files in the source folders, never in `dist/`; each build wipes and rewrites it.

## Structure

```
data/
  site.json       blog name, sections, topics, popular searches, all UI labels, footer
  articles.json   all stories
  videos.json     sidebar videos (each links to an article by id)
  player.json     player page text, sample streams, formats table, how-it-works guide
  streams/        example endpoint JSON files for rich player links
assets/css/style.css
assets/js/app.js  loads data and renders every page
index.html        front page
article.html      article.html?id=<article id>
section.html      section.html?c=<slug> | ?tag=<topic> | ?q=<search>
player/index.html player/?url=<stream>  (assets/js/player.js)
pages.json        index of every page (generated, see below)
scripts/build-pages.js  writes pages.json
```

## Player

`/player?url=<stream address>` plays the stream; without `url` it shows a paste box and a how-it-works guide.

`/player?endpoint=<json url>` (alias `?type=fetch&url=`) fetches a JSON description and builds a full watch page from it: title, description, channel, date, poster, tags, chapters (list and seek-bar markers), external WebVTT/SRT subtitles, a countdown for `startsAt` in the future, an Up next list and autoplay of the first related item at the end. Only `source` (or a `sources` fallback list) is required; relative links resolve against the endpoint. Examples live in `data/streams/`, and the full format is in the how-it-works guide on the player page. `allowedEndpoints` in `data/player.json` can restrict which origins are trusted (empty = any).

| Format | Engine |
| --- | --- |
| HLS `.m3u8` | hls.js (native on Safari) |
| DASH `.mpd` | dash.js |
| FLV, MPEG-TS | mpegts.js |
| MP4, WebM, Ogg, MOV, MKV, audio | the browser |

Custom controls: seek bar with buffer and hover time, live edge button with DVR scrubbing, volume (remembered), settings menu (quality with Auto, speed, audio track, subtitles, copy link at current time, stats for nerds), picture-in-picture, fullscreen, resume where you left off, `t=<seconds>` start time, double-tap to skip on touch, and keyboard shortcuts (press `?` on the player).

An endpoint can also return `embed` (a page URL) instead of a source; the player then shows that page in an iframe with the same title, description and Up next list. A `related` item may carry `href`: a page to open as-is instead of playing it here. The videos server uses this to send Up next back to each video's own page.

Engines are loaded from jsDelivr only when needed. Links without a known extension are tried natively, then as HLS, then DASH; `?type=hls|dash|flv|ts|native&url=…` forces one. The stream's server must allow cross-origin playback (CORS); RTMP/RTSP can't play in browsers.

## Adding a story

Append an object to `data/articles.json`:

```json
{
  "id": "unique-slug",
  "title": "Headline",
  "summary": "Standfirst shown under the headline",
  "category": "business",
  "author": "Name",
  "authorRole": "Role",
  "publishedAt": "2026-11-10T09:00:00Z",
  "featured": false,
  "views": 1000,
  "image": "https://…",
  "imageCaption": "Caption",
  "imageCredit": "Credit",
  "tags": ["Topic"],
  "body": [
    "A paragraph.",
    { "h": "A subheading" },
    { "quote": "A pull quote.", "by": "Who said it" }
  ]
}
```

- `category` must match a `slug` in `site.json` → `sections`.
- The article with `"featured": true` leads the front page; otherwise the newest one does.
- "Most read" is sorted by `views`.
- Topics in `site.json` link to articles with a matching tag; trending terms run a search.

## Link gate (`?token=`)

Any page opened with `?token=<JWT>` shows a banner above the logo and a "Click here" box at the bottom of the page:

1. **Continue to link** in the banner scrolls smoothly down to the box.
2. **Click here** starts a countdown (`linkGate.countdownSeconds`, default 10).
3. **Click here to get link** sends a request to the token's `fetchurl` with the JWT in a header (`Authorization: Bearer <token>` by default), then redirects to the URL the server returns.

The browser only *reads* the token payload (`fetchurl`, `step`, `pages`, `exp`); it cannot check the signature, so **your server must verify the JWT** before returning a link. The server's response can be `{"url": "…"}` (or `redirect` / `location` / `link`, optionally inside `data`), a JSON string, or a plain-text URL. Only http(s) targets are followed. Because the request carries an `Authorization` header, the server must answer CORS preflight requests from this site (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers: Authorization`).

With the videos ecosystem, the token comes from `server` (its `fetchurl` is the server's `/api/gate`), which answers with a player link whose endpoint is the server's `/api/play`. To accept only that server, set `linkGate.allowedOrigins` here and `allowedEndpoints` in `data/player.json` to the server's origin.

Settings live under `linkGate` in `data/site.json`: `method`, `header`, `scheme`, `countdownSeconds`, the wording in `text`, and `allowedOrigins`. Leave `allowedOrigins` empty to accept any `fetchurl`, or list origins (e.g. `["https://api.example.com"]`) so only your own server can be used.

## Ads

Monetag's Multitag sits right after `<head>` in `index.html`, `article.html`, `section.html` and
`player/index.html`:

```html
<script src="https://quge5.com/88/tag.min.js" data-zone="308861" async data-cfasync="false"></script>
```

It's written into the HTML rather than added by a script because Monetag's installation check reads
the raw page. To change the zone, edit it in all four files.

`sw.js` is Monetag's push worker. It sits at the site root so that it controls the whole site. Nothing registers it on its own; the page tag does. `_headers` sets `Cache-Control: no-cache` on it for hosts that read that file (Cloudflare Pages, Netlify), so updates are picked up.

The link gate's wait time is `linkGate.countdownSeconds` (see above).

## Telegram Mini App (`tg/`)

`/tg/` is a Telegram Mini App for videos whose host won't let them play inside the player. The
player links to it (an endpoint's `external` URL) instead of showing an error. It reads the token
from Telegram's `start_param` (or `?startapp=` in a normal browser), shows the video, plays a
rewarded ad, then asks the video server for the link and opens it in the browser with
`Telegram.WebApp.openLink`. If the ad fails to load twice (no fill or a blocker), the visitor is
let through.

- The ad SDK tag is the first thing in `tg/index.html`'s `<head>`. Its `data-sdk` name is the function the page calls.
- `data/site.json` → `telegramApp.apiUrl` is the video server's address.
- In BotFather, create the Mini App with `/newapp` and point it at `https://<this site>/tg/`.
  Its direct link (`https://t.me/<bot>/<app>`) is the server's `TELEGRAM_APP_URL`.

## Page index (`pages.json`)

`/pages.json` is a public list of every page on the site (home, player, sections, topics and articles), each as `{ "slug": …, "title": … }`. `slug` is the page's path without the domain, e.g. `/section.html?c=business` or `/article.html?id=salt-battery-factory`; add it to the site's address to open the page.

The file is generated from `data/`, so don't edit it by hand. After adding, removing or renaming an article, section or topic, run:

```sh
node scripts/build-pages.js
```

The script stops with an error on a missing or duplicate article `id` or an unknown `category`, so a broken index is never written.
