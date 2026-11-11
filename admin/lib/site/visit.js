const { resolveUrl } = require("../resolver");

// Same parsing as the ad site's player: the stream is everything after url=, possibly unencoded.
function playerStream(target) {
  const match = /([?&]url=)(.*)$/.exec(target);
  if (!match) return null;
  let inner = match[2];
  try {
    inner = decodeURIComponent(inner).trim();
  } catch {
    inner = inner.trim();
  }
  return /^https?:\/\//i.test(inner) ? { inner, prefix: target.slice(0, match.index + match[1].length) } : null;
}

function isEmbedLink(target) {
  try {
    return new URL(target).pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

// Mirrors link-gate's /final: iframe links are loaded by the visitor's browser as they are,
// a player link has the stream inside it resolved and re-wrapped, anything else is resolved whole.
async function resolveVisit(realUrl) {
  if (isEmbedLink(realUrl)) return { kind: "embed", resolved: realUrl, matched: false, finalUrl: realUrl };

  const stream = playerStream(realUrl);
  if (stream) {
    const result = await resolveUrl(stream.inner, { url: stream.inner }, "visit");
    const changed = !result.failed && result.url !== stream.inner;
    return { kind: "player", resolved: stream.inner, ...result, finalUrl: changed ? stream.prefix + encodeURIComponent(result.url) : realUrl };
  }

  const result = await resolveUrl(realUrl, { url: realUrl }, "visit");
  return { kind: "direct", resolved: realUrl, ...result, finalUrl: result.failed ? null : result.url };
}

module.exports = { resolveVisit };
