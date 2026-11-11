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
`server/.env` into this app's `.env`. Set `SITE_URL` to the videos site for the **View** links (`/watch.html?v=<tag>`) and
`AD_SITE_URL` to the ad site for the **Player** / **Iframe** prefixes. Without a database the two
sections show a setup notice and Workflows keep working.

- **Content**: posts in `/r` order with views, length, category and visibility. Arrows reorder
  (only with no filter or search), the eye icon disables or re-enables a post, and the details page
  edits it. A blank video length is read from the `.m3u8` on save. **Visit** runs the post's Real
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
| Output           | Respond with JSON fields, a redirect, or text                                                  |

### Files

A file moves between steps as `{ data, mimeType, fileName, size }`, with `data` in base64. HTTP Request
returns one as `file` when the response is an image, video, audio, PDF or archive (or always, with
**Response: File**). Anywhere a file is expected (a **File** form field, or the **File, raw bytes**
body) you can give `{{ $json.file }}`, an `http(s)` URL to download, a `data:` URL, or plain base64.
Files are limited to 15 MB.

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

## Endpoints

Only **active** workflows answer. If `API_TOKEN` is set, send `Authorization: Bearer <token>`.

- `GET|POST /hook/<slug>?field=…`: runs that workflow. The query string and JSON body become the input.
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
