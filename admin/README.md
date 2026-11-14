# linkproxy

A small n8n-style workflow runner for one job: call HTTP endpoints, pull URLs out of what comes
back, transform the data, and hand back a result. Each workflow is a chain of nodes in a visual
editor, and every node shows the exact data that went in and came out.

It replaces link-gate's fixed URL signer: instead of one form shared by every host, each host gets
its own workflow with its own inputs, steps and output.

## Run

```bash
npm install
cp .env.example .env   # set ADMIN_PASSWORD (required) and API_TOKEN before exposing it
npm run dev            # API on :5678, editor with hot reload on http://localhost:5173
```

For production, build the editor once and let the server serve it:

```bash
npm run build          # writes web/dist
npm start              # editor and API on http://localhost:5678
```

The editor lives in `web/` (React, React Flow for the canvas, Radix primitives for controls,
CodeMirror for code and expression fields). It is laid out as a Studio-style admin dashboard: a
header with search and a Create menu, and a left sidebar with one entry per section (configured in
`web/src/layout/nav.js`). `/workflows` lists workflows and `/workflows/<id>` opens one in the
full-screen editor. Set `SITE_NAME` in `.env` to name the website in the sidebar and sign-in page.

Workflows are stored in the MySQL `workflows` table when a database is configured (see below), so
the videos `server` can read and run them; the table is created on first start, and any workflow
files already in `data/workflows/` are moved into it once. Without a database they stay as JSON in
`data/workflows/`. The last 100 executions are kept in memory.

## Website admin (Content and Categories)

Studio replaces link-gate's `/admin` for posts and categories. It reads and writes the same MySQL
tables (`resources`, `categories`) directly; link-gate still creates and migrates them, so Studio
never changes those two tables.

Copy `DATABASE_URL` (or the `MYSQL_*` variables) and `MYSQL_CA_CERT` from link-gate's
`server/.env` into this app's `.env`. Set `SITE_URL` to the videos site for the **View** links (`/watch.html?v=<tag>`). Without a database the two
sections show a setup notice and Workflows keep working.

- **Content**: posts in `/r` order with views, length, category and visibility. Arrows reorder
  (only with no filter or search), the eye icon disables or re-enables a post, and the details page
  edits it. A blank video length is read from the `.m3u8` on save. The Real URL is a plain link marked
  **Player** (a stream the news player plays, the default) or **Iframe** (a page shown in an iframe inside
  the news player), saved in the `real_url_type` column that the app adds on first use. **Visit** runs the post's Real
  URL through the active workflows the way link-gate's `/final` did with signers (iframe
  `/embed/` links pass through, a `/player/?url=` link has its inner URL resolved and re-wrapped)
  and opens where a visitor would land, skipping the gate. Runs show in the workflow's History.
- **Categories**: name, picture and the posts in each. Picking a post that is already in another
  category moves it.

link-gate caches public pages in memory and only its own writes clear that cache, so after an edit
here its pages can lag for up to about 10 minutes.

## Nodes

| Node             | What it does                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Input            | Declares input fields (defaults, required), expands the URL into `parts`, and sets which URLs `/resolve` routes here, plus cache and on-error behaviour |
| HTTP Request     | Any method, query, headers, JSON/form/raw body, multipart form data with files, or a raw file body. Output: `status`, `url`, `headers`, `cookies`, `cookieHeader`, `location`, `body` (JSON parsed automatically), and `file` for images and other binary downloads |
| Extract URL      | First video URL, first URL containing some text, a regex (`(?<url>…)` or group 1), or all URLs. Handles `\/` and `&` escaping |
| Code             | Async JavaScript. `return` becomes the output; `console.log` shows in the panel. `fetch` and `helpers` are available |
| Set Fields       | Build an object from expressions (`a.b` keys nest)                                             |
| Follow Redirects | Walks the `Location` chain server-side, carrying cookies and headers                           |
| Split            | Turns an array (`{{ $json.urls }}`) into separate items; the steps after it run once per item  |
| Filter           | Keeps items that meet all/any conditions; the rest are dropped or sent to a Discarded output   |
| Switch           | Sends each item to the output of the first matching rule (or every match), with an optional Fallback output |
| Aggregate        | Collects all incoming items back into one item: `{ items: [...], count }`                      |
| Run Workflow     | Runs another workflow with the input you give it and returns its Output. Calls are limited to 5 levels and a workflow can't call itself further up the chain |
| Save File        | Downloads a URL (an `.m3u8` is copied into one MP4 with ffmpeg) or takes a file, and saves it under `data/media/<folder>/`. Output is a file reference |
| Extract Frames   | Takes evenly spaced JPEG frames from a saved video or a video URL with ffmpeg. Output: `{ duration, count, frames: [...] }` |
| Resize Image     | Shrinks and re-encodes an image with ffmpeg (JPEG, WebP or PNG, max width/height, quality, optional "Keep under" size in KB). Output: `file`, `dataUrl`, `width`, `height`, `size` |
| Create Post      | Adds a post to Content with the same checks as the Content form. Category can be a name or an id |
| Output           | Respond with JSON fields, a redirect, or text                                                  |

### Polling

Turn on **Repeat until a condition is met** in an HTTP Request step to send the same request again
until **Stop when** holds, e.g. `{{ $response.body.status }}` is equal to `done`. `$response` is the
latest response and `$attempt` the try number; the step waits **Wait between tries** between
requests, fails after **Give up after** tries, and its output carries `attempts`. Each try is
logged in the step's Console. Workflows that poll can't be used for Delivery.

Every field of a repeating step is worked out again before each try, so a poll can send back what
the last try returned: `{{ $response?.body.cursor ?? $json.body.cursor }}` uses the previous
response from the second try on, and the step before it on the first (`$response` is null then).

### Files

A file moves between steps as `{ data, mimeType, fileName, size }`, with `data` in base64. HTTP Request
returns one as `file` when the response is an image, video, audio, PDF or archive (or always, with
**Response: File**). Anywhere a file is expected (a **File** form field, or the **File, raw bytes**
body) you can give `{{ $json.file }}`, an `http(s)` URL to download, a `data:` URL, or plain base64.
Files are limited to 15 MB.

Save File and Extract Frames pass **file references** instead of base64:
`{ ref: "media", path, url, fileName, mimeType, size }`, so videos of any size fit in a run. Any file
field accepts one, and `url` (`/media/…`) opens the file behind the admin login.

### Items

Steps pass a list of items, like n8n. A workflow starts with one item (the request), and most steps
run once per item. Split makes more items, Filter and Switch route or drop them, and Aggregate
collects them again. A Code step can run once per item or once for all items (`$items`). The
Output step responds with the first item, or with all items as an array. A step that receives no
items is skipped.

### Expressions

Any parameter can contain `{{ … }}` (JavaScript). In the editor these fields turn amber and show a
live preview from the last run. You can drag a key from the input panel into a field.

- `$json`: the current item from the previous step; `$items`: every item it received; `$itemIndex`
- `$input`: the Input node's output (`$input.url`, `$input.parts.file`, `$input.groups[0]`)
- `$node["Name"].json`: an earlier step's item at the same index (or its first); `.items` for all of them
- `$enc()` / `$dec()`: URI encode/decode; `$url(str)`: URL parts; `$now`

A field that is exactly one `{{ }}` keeps the value's type (object, number). Mixed text becomes a string.

## Use for

Each workflow is set to **Delivery**, **Pipeline** or both (the **Use for** button in the editor).
Delivery workflows answer matching URLs on `/resolve`, Visit and the videos site; Pipeline workflows
can be run by a Run Workflow step. Delivery workflows can't use Run Workflow, Save File, Extract
Frames, Create Post or `$env`, because the videos server's engine doesn't have them.

`$env` in expressions holds only the `WF_*` variables from the environment. Save File and Extract
Frames need ffmpeg on the server.

## Variables

API keys, tokens and other settings for workflows live on the **Variables** page. Workflows read them as
`{{ $env.NAME }}` (or `$env.NAME` in a Code step), and every step panel lists them so you can drag one into a
field. A change applies on the next run, with no restart or rebuild.

- Values are encrypted with AES-256-GCM before they're saved: in the `workflow_variables` table when a
  database is configured, otherwise in `data/variables.json`. The page shows only the last 4 characters.
- The key is `SECRETS_KEY` in the server's environment, the one setting that stays in `.env`. Without it the
  page shows a ready-to-paste key. Losing or changing it makes saved values unreadable.
- Run history and error messages show `[NAME]` in place of a value, so a token inside a URL isn't recorded.
- `WF_*` variables in `.env` still work. A variable saved in the app wins over a `WF_*` of the same name,
  and **Move into app** copies one over so you can delete the line from `.env`.
- Like `$env`, variables are for Pipeline workflows; Delivery workflows can't use them.

## Reel to post

The **Reel to post** page takes an Instagram reel link through five steps: download the .mp4, pick a
frame (upload it as the thumbnail and/or search it with FaceDigger), choose a match, create the post,
then send a Telegram notification. Each step runs one Pipeline workflow with a fixed id:

| Workflow id       | Input                                                                          | Output step must return                                       |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `reel-download`   | `url`                                                                          | `{ url }`, the .mp4 (a Save File result works too)            |
| `reel-facedigger` | `image` (a file: `{ data, mimeType, fileName, size }`)                         | `{ cams: { results: [{ url, title, thumbnail, similarity }] }, … }` |
| `reel-thumbnail`  | `image` (same file shape)                                                      | `{ url }`, the uploaded image                                 |
| `reel-post`       | `title`, `description`, `realUrl`, `thumbnail`, `category`, `duration`, `postTag` | the created post, with `postTag` (wired to Create Post already) |
| `reel-notify`     | `videoUrl`, `message`, `linkName`, `linkUrl`, and `video` when the .mp4 is a saved file | anything; a successful run counts as sent              |

Create them (only the missing ones; existing ones are never changed) with:

```bash
npm run reels:setup                          # the database in .env
npm run reels:setup -- --env .env.production # the database in another env file
```

To copy them, once wired, to another database such as production (ids are kept, so they stay locked):

```bash
npm run workflows:copy -- --to DATABASE_URL_LIVE --dry-run   # show what would change
npm run workflows:copy -- --to DATABASE_URL_LIVE             # create the ones missing there
npm run workflows:copy -- --to DATABASE_URL_LIVE --overwrite # also replace ones already there
```

`--to` and `--from` (default `DATABASE_URL`) name variables in `.env`. Variable values are not copied; add
them on the target's Variables page.

Until you wire them, each one stops at a "Wire me" step with a clear error. These workflows are
locked: they can't be deleted, and Pipeline must stay ticked. Similarity can be 0-1 or 0-100.

## Endpoints

Only **active** workflows answer. If `API_TOKEN` is set, send `Authorization: Bearer <token>`.

- `GET|POST /hook/<slug>?field=…`: runs that workflow. The query string and JSON body become the input.
  A `multipart/form-data` body works too: each uploaded file becomes `{ data, mimeType, fileName, size }`
  under its field name (`curl -F "image=@photo.jpg" …/hook/<slug>`), up to 15 MB. In the editor, pick a
  test file on the Input step under **Test files**; it's used for test runs and never saved.
  The response follows the Output node: JSON, a 302, or text.
- `GET|POST /resolve` with `{"url": "…"}`: picks the first active workflow whose Input node
  matches the URL (host, prefix or regex) and returns
  `{ matched, url, data, workflow, executionId, cached }`. Unmatched URLs come back as `{ matched: false, url }`.

## Wiring into link-gate

In `server/lib/signers.js`, keep `signTarget` (it unwraps player `?url=` links and skips embeds)
and point `signUrl` at linkproxy:

```js
async function signUrl(url) {
  const res = await fetch(`${process.env.LINKPROXY_URL}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINKPROXY_TOKEN}` },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `linkproxy answered ${res.status}`);
  return data.url;
}
```

Set **On error → original** on a workflow's Input node to get the old "fall back to the
unsigned URL" behaviour.

## Security note

The Code node uses `node:vm`, which is **not** a security sandbox. Code in a workflow runs with
the server's privileges. Only people you trust should have editor access.

The editor and `/api` sit behind a login page that checks `ADMIN_PASSWORD`; the server won't start
without it. Signing in sets an HttpOnly session cookie for 7 days, and changing the password signs
everyone out. After 10 wrong passwords from one IP, login is blocked for 15 minutes. `/hook` and
`/resolve` are unaffected and still use `API_TOKEN`.
