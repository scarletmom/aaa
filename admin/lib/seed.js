// First-boot examples that mirror the two modes of link-gate's URL signer.
const EXAMPLES = [
  {
    name: "Extract video from page",
    slug: "extract-video",
    active: false,
    nodes: [
      {
        id: "in",
        type: "input",
        name: "Input",
        position: [80, 200],
        params: {
          fields: [{ key: "url", value: "", required: true }],
          urlField: "url",
          matchType: "host",
          matchValue: "videopage.example.com",
          cacheSeconds: 300,
          onError: "error",
          testInput: '{\n  "url": "https://videopage.example.com/watch/123"\n}',
        },
      },
      {
        id: "fetch",
        type: "http",
        name: "Fetch page",
        position: [360, 200],
        params: {
          method: "GET",
          url: "{{ $json.url }}",
          headers: [{ key: "User-Agent", value: "Mozilla/5.0" }],
          responseFormat: "text",
          redirect: "follow",
          failOnError: true,
          timeoutMs: 10000,
        },
      },
      {
        id: "find",
        type: "extract",
        name: "Find video",
        position: [640, 200],
        params: { source: "{{ $json.body }}", baseUrl: "{{ $json.url }}", mode: "video", failIfNone: true },
      },
      {
        id: "follow",
        type: "redirects",
        name: "Follow redirects",
        position: [920, 200],
        params: {
          url: "{{ $json.url }}",
          headers: [{ key: "Referer", value: "{{ $input.url }}" }],
          cookie: "{{ $node['Fetch page'].json.cookieHeader }}",
          maxHops: 5,
          timeoutMs: 8000,
        },
      },
      {
        id: "out",
        type: "respond",
        name: "Output",
        position: [1200, 200],
        params: { mode: "json", fields: [{ key: "url", value: "{{ $json.url }}" }] },
      },
    ],
    connections: [
      { from: "in", to: "fetch" },
      { from: "fetch", to: "find" },
      { from: "find", to: "follow" },
      { from: "follow", to: "out" },
    ],
  },
  {
    name: "Sign with token API",
    slug: "sign-token",
    active: false,
    nodes: [
      {
        id: "in",
        type: "input",
        name: "Input",
        position: [80, 200],
        params: {
          fields: [{ key: "url", value: "", required: true }],
          urlField: "url",
          matchType: "host",
          matchValue: "cdn.example.com",
          cacheSeconds: 60,
          onError: "original",
          testInput: '{\n  "url": "https://cdn.example.com/videos/clip.mp4"\n}',
        },
      },
      {
        id: "sign",
        type: "http",
        name: "Get token",
        position: [360, 200],
        params: {
          method: "GET",
          url: "https://sign.example.com/{{ $json.parts.file }}",
          responseFormat: "json",
          redirect: "follow",
          failOnError: true,
          timeoutMs: 8000,
        },
      },
      {
        id: "build",
        type: "code",
        name: "Build signed URL",
        position: [640, 200],
        params: {
          code: "const signed = new URL($input.url);\nsigned.searchParams.set('token', $json.body.token);\nsigned.searchParams.set('ex', $json.body.ex);\n\nreturn { url: signed.toString(), expires: $json.body.ex };\n",
          timeoutMs: 5000,
        },
      },
      {
        id: "out",
        type: "respond",
        name: "Output",
        position: [920, 200],
        params: {
          mode: "json",
          fields: [
            { key: "url", value: "{{ $json.url }}" },
            { key: "expires", value: "{{ $json.expires }}" },
          ],
        },
      },
    ],
    connections: [
      { from: "in", to: "sign" },
      { from: "sign", to: "build" },
      { from: "build", to: "out" },
    ],
  },
];

async function seedWorkflows(store) {
  if (store.workflowCount() > 0) return;
  for (const example of EXAMPLES) await store.save(example);
}

module.exports = { seedWorkflows };
