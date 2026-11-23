# videos

The public video catalogue, a static site styled like the news site. Content comes
from `server`, which reads the posts managed in linkproxy's **Content** and **Categories**.

- Every page needs a pass (an access token from the server). Without one, or once the server says it
  has expired, a Turnstile modal that can't be dismissed earns a new one and the request is retried.
  The pass lasts 12 hours and is kept in `localStorage` (or memory when storage is blocked).
- `/` (`index.html`): the video list with search and category chips (`?category=<slug>` preselects one).
- `/r/<post tag>` (served by `watch.html`): the video's poster, details and related videos. Pressing play on
  the poster opens the blogsite in a new tab at `BLOGSITE_URL/videos/?v=<post tag>#access=<pass>`, where the
  visitor registers a free Member Lite account (or signs in, which upgrades a plain Member) and lands on that video.

Settings live in `.env` (copy `.env.example`):

```bash
SITE_NAME=Quillwood Video
SITE_TAGLINE=Short films, clips and streams
API_URL=https://api.example.com
TELEGRAM_URL=https://t.me/yourchannel
TURNSTILE_SITEKEY=1x00000000000000000000AA
BLOGSITE_URL=https://blog.example.com
```

`API_URL` is the server's `PUBLIC_URL` and is required. `TELEGRAM_URL` adds a Telegram button to the top bar and a "Join our channel" modal once a visitor
has passed the Turnstile check (shown once per browser). Leave it empty to hide both.

`BLOGSITE_URL` is the blogsite (the Next.js app); without it the poster's play button is disabled.

`TURNSTILE_SITEKEY` is the public Turnstile key, the same value as the server's. With it the captcha
renders without first asking the server for the key (`GET /api/config`).

The browser can't read `.env`, so `npm run config` writes these values to `data/site.json`, which
the site loads at runtime. That file is generated and git-ignored; rerun `npm run config` after
editing `.env`. `npm run build` does this for you. On hosts that set environment variables
instead of a `.env` file (e.g. Cloudflare Pages), the same variable names are read from there.

## Run

```bash
npm run config
npm start         # http://localhost:4000, with the same /r/<tag> rewrite as the host
```

Then set `VIDEOS_SITE_URL=http://localhost:4000` in the server's `.env`, and in linkproxy set
`SITE_URL` to this site so the **View** links on posts open `/r/<tag>`.

## URLs

Pages have no `.html`: `/` is the list and `/r/<tag>` is a video. The host must rewrite `/r/*` to
`/watch.html` (a rewrite, not a redirect, so the address bar keeps `/r/<tag>`):

- Render: Static Site → **Redirects/Rewrites** → Source `/r/*`, Destination `/watch.html`, Action **Rewrite**.
- Netlify / Cloudflare Pages: the `_redirects` file already does this.

Old `watch.html?v=<tag>` links still work; the page swaps the address to `/r/<tag>`.

## Build (`dist/`)

```bash
npm install
npm run build     # writes dist/
npm run preview   # serves dist/ at http://localhost:4000
```

`dist/` is the folder to deploy. It's a copy of the site with `assets/js/app.js` obfuscated by
`javascript-obfuscator` (settings in `scripts/build-dist.js`). `README.md`, `scripts/`,
`package*.json` and `node_modules/` are left out. Edit the source files, never `dist/`; each build
wipes and rewrites it.
