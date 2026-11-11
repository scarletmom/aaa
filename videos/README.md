# videos

The public video catalogue, a static site styled like the news site. Content comes
from `server`, which reads the posts managed in linkproxy's **Content** and **Categories**.

- `/` (`index.html`): a Turnstile check first, then the video list with search and category chips
  (`?category=<slug>` preselects one). The pass lasts 12 hours and is kept in `localStorage`.
- `/r/<post tag>` (served by `watch.html`): the video's poster, details and related videos, plus the **Get video**
  box (captcha, then on to a news page). Open without a pass, so links from the news player work.

Settings live in `.env` (copy `.env.example`):

```bash
SITE_NAME=Quillwood Video
SITE_TAGLINE=Short films, clips and streams
API_URL=https://api.example.com
TELEGRAM_URL=https://t.me/yourchannel
```

`API_URL` is the server's `PUBLIC_URL` and is required. `TELEGRAM_URL` adds a Telegram button to the top bar and a "Join our channel" modal on a visitor's
first open (shown once per browser). Leave it empty to hide both.

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
