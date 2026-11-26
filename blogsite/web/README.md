# Quillwood Notes — Next.js

The blog's front page, post pages, section/topic pages and search, built with Next.js (App Router), TypeScript and Tailwind CSS, and exported as static HTML. Each page is prerendered at build time, and moving between pages happens in the browser without a full reload.

The player (`/player/`) and the Telegram Mini App (`/tg/`) are not part of this app. They stay as the static pages in the blogsite folder and are served beside it.

## Run

```sh
npm install
npm run dev       # http://localhost:5174  (or ../../run.sh blogsite)
```

`npm run typecheck` runs `tsc` on its own; `next build` also type-checks.

`npm run dev` first links `player/`, `tg/`, `assets/`, `sw.js`, `_headers` and `test-link.json` from the blogsite folder into `public/`, so the player works at `/player/` and edits there show on reload.

## Data

All content is in `src/data/`: `site.json`, `articles.json`, `videos.json`, `player.json` and `streams/` (see the blogsite README for the formats). The posts are guides and release notes for the videos app; each one's cover is an SVG in `public/covers/<id>.svg`. `videos.json` holds the "Start watching" shortcuts in the front page's sidebar (`title`, `text`, `href`, and an `image` for the first). `/videos/` lists the published videos from the API 40 at a time (`GET /api/videos?page=N`, with `q` and `channel` doing the search box and channel chips on the server), sent with the signed-in account's token; shorts come from `GET /api/shorts` and open in the Shorts feed at `/videos/?short=<id>`, and the Terabox Videos tab lists saved videos from `GET /api/terabox/videos` (a tap resolves the saved share link like a pasted one, and `/videos/?tab=terabox&link=<share link>` plays a link as soon as the tab opens, then drops it from the address); only Member Lite and Member Pro accounts get them (others see the sign-in or plan card, and the server answers 403). Opening a video calls `GET /api/videos/<tag>`, which counts a view and returns a signed `play` endpoint (valid 3 hours). The static player (`/player/`) is embedded with `embed=1` and fetches that endpoint itself, so `/videos/` gets the same controls, quality menu, resume, shortcuts and episode panel as the news player; switching episodes updates `?ep=N` on the page. Signed-in viewers can comment under a video, like comments, sort by Top or Newest and delete their own. There is no backend for comments yet: new comments and likes stay in the viewer's browser (`src/lib/comments.ts`, the one file to swap for API calls), on top of the seed comments in `src/data/comments.json`, keyed by video id. Plan names, prices, perks and button text for the subscribe page are in `src/data/pricing.json` (`featured` marks the highlighted plan). The video search box also searches by image: its dropdown takes an uploaded, dropped or pasted picture (images up to 10 MB) and shows the matches. Only the UI is built; `searchVideosByImage` in `src/lib/imageSearch.ts` is where the image-search backend goes, resolving to matching video ids, best first. Pages import the JSON files directly (`src/lib/data.ts`), so edits show on save in dev and need a rebuild for production. The build stops on a missing or duplicate article id or an unknown category.

The static player and Mini App still fetch `/data/…` at runtime; `src/app/data/[...file]/route.ts` writes every file in `src/data/` there at build time (and serves them in dev). Nothing in `public/` holds data.

## Accounts

Accounts live on the video server (`server/`), which `NEXT_PUBLIC_API_URL` points at (falling back to `apiUrl` in `src/data/site.json`; `.env.development` sets `http://localhost:3000` for `npm run dev`). The Turnstile sitekey comes from the server's `/api/config` unless `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set.

| Role | How you get it | Videos |
| --- | --- | --- |
| Member | Register directly on this site | No (`/videos/` shows an access screen). Their Upgrade button (account bar and that screen) shows the Pro plans (week, month, lifetime preselected) with Continue with Pro, and Try for free for Member Lite: the server gives the videos-site link, its captcha is the only step, and they come back as Member Lite; for Pro (`/videos/?upgrade=pro`) checkout then opens for the plan they picked |
| Member Lite | Register by pressing play on a video on the videos site (it opens `/videos/?v=<tag>#access=<pass>` here: the register dialog sits over that video, which plays once they're in). A Member who signs in from there becomes Member Lite | Yes, with ads |
| Member Pro | Bought on the subscribe page, or set by an admin under Users in Studio (which can set any plan) | Yes, no ads |

- Registering takes a full name and a captcha; the server makes a 16-character account number (xxxx-xxxx-xxxx-xxxx), shown once, which is the only login (with a captcha).
- The videos-site pass arrives in the URL fragment (any page picks it up), moves to this tab's `sessionStorage` and is sent as `Authorization: Bearer` with the register request. It lasts as long as the pass (12 hours).
- The session (name, role, server JWT) is kept in `localStorage`. On every full page load it's re-checked with `GET /api/account`, which renews the token and picks up role changes; a rejected token signs the visitor out.
- For Member Lite and Pro, `/` sends them to `/videos/`; the front page is still at `/note/`.
- The role check is client-side: the videos page and its streams are static files, so a determined visitor can still reach them.

## Build

```sh
npm run build     # blogsite build, then copies its static parts, then next build
npm run preview   # serves out/ at http://localhost:8080
```

`out/` is the folder to deploy. It holds every page as HTML (`/article/<id>/index.html` …), the static parts copied from `../dist` (so the player's JavaScript stays obfuscated), `data/` and `pages.json`. Rebuild after changing posts.

## Addresses

| Page | Address |
| --- | --- |
| Front page | `/` |
| Post | `/article/<id>/` |
| Section | `/section/<slug>/` (`latest` lists every post) |
| Topic | `/topic/<topic-slug>/` (e.g. `Keyboard shortcuts` → `keyboard-shortcuts`) |
| Search | `/search/?q=<words>` |
| Videos | `/videos/` (`?v=<id>&ep=N&t=<seconds>` to watch) |
| Front page (for Member Lite and Pro) | `/note/` |
| Terabox Player | `/terabox/`, linked from the Terabox Player box at the top of the Terabox section and under every Terabox post (`TeraboxPlayerCard`): a paste box that checks the link and opens it on `/videos/?tab=terabox&link=…`, with how-to, mirror domains and the Terabox guides |
| Subscribe (news) | `/subscribe/`, linked from the masthead; a preview whose buttons only say subscriptions aren't open yet |

Old addresses still work: `public/article.html` and `public/section.html` send `article.html?id=…`, `section.html?c=…`, `?tag=…` and `?q=…` to the new ones, keeping `?token=`. The player's header links use these.

`pages.json` is generated by `src/app/pages.json/route.ts` with the new addresses. The video server appends `?token=` to them for link-gate steps.

## Layout of the code

```
src/app/                  routes: page.tsx (home), article/[id], section/[slug], topic/[tag], search,
                          not-found.tsx, pages.json/route.ts, data/[...file]/route.ts, layout.tsx, fonts.ts
src/data/                 site, posts, videos, player settings and example streams (JSON)
src/app/globals.css       Tailwind import, light/dark colour variables, breakpoints, fonts
src/components/ui/        shared pieces: BlockTitle, Meta, PageGrid, Avatar, Notice, Icons, class helpers (styles.ts)
src/components/site/      SiteHeader, Masthead, PrimaryNav, TopicsBar, ThemeToggle, SiteFooter, trackers
src/components/story/     Media, Kicker, TimeTag, StoryCard, StoryRow, HeadlineList
src/components/home/      TopStories, LatestStories, UpdatesStrip, SectionBlock
src/components/terabox/   TeraboxLaunch (the Terabox paste box), TeraboxPlayerCard (that box for the Terabox section and posts)
src/components/article/   StoryHeader, Byline, ShareTools, ArticleBody, TagList, RelatedStories
src/components/listing/   ListingLayout, Breadcrumb, SectionIntro, StoryList, LoadMore, SearchResults
src/components/sidebar/   Sidebar and its widgets
src/components/link-gate/ LinkBanner, LinkGate
src/lib/                  types.ts (data shapes), data loading (build time), formatting and URLs, link query store, link gate
```

Components are server components unless they need the browser: those start with `'use client'` (nav, theme, search, load more, share, newsletter form, link gate, relative times).

## Styling

Tailwind CSS v4, configured in `src/app/globals.css` (no `tailwind.config`). The look matches the old `assets/css/style.css`:

- Colours are CSS variables that switch with `data-theme="dark"` on `<html>`, exposed as `bg`, `surface`, `surface-2`, `fg`, `fg-2`, `muted`, `line`, `rule`, `accent`, `up`, `img` (e.g. `text-fg-2`, `border-line`). `dark:` targets the dark theme.
- Breakpoints are the old ones and are used as `max-*`: `max-lg` < 1080px, `max-md` < 760px, `max-sm` < 640px, `max-xs` < 480px.
- `font-sans`, `font-serif` and `font-display` are Libre Franklin, Source Serif 4 and Playfair Display, self-hosted with `next/font`.
- `page-container` is the 1240px centred column; `no-scrollbar` hides scrollbars on the nav strips.

The player and Mini App keep using `assets/css/style.css`.

## Behaviour carried over

- **Link parameters**: `/assets/js/query-parser.js` still runs in `<head>` on every full load. `src/lib/linkQuery.ts` carries its result across in-app pages: Back/Forward and reloads bring `?token=` back, a fresh link click doesn't.
- **Link gate**: banner, countdown and "get link", using `linkGate` in `data/site.json`.
- **Visit tracking**: one `/api/visit` per page shown, including pages opened without a reload. A signed-in visitor's account token goes with it, so the visit is recorded under their account.
- **Ads**: the Monetag tag is in the root layout's `<head>`. It runs once per full page load, not on in-app page changes.
- **Times**: the HTML shows dates; the browser swaps in "2 hours ago" and local times after it loads.
