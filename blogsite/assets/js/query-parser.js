// Keeps link parameters (gate token, player stream) in this tab's sessionStorage and shortens the URL,
// so a reload keeps working but the short URL opened later in a new tab doesn't.
(() => {
  'use strict';

  const STORAGE_PREFIX = 'page-query:';
  const LINK_KEYS = ['token', 'type', 't'];
  // The player reads everything after endpoint=/url= raw (unencoded "&" included), so that tail is stored whole.
  const RAW_TAIL = /[?&](?:endpoint|url)=[^]*$/;

  const session = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); return true; } catch { return false; }
    },
    remove(key) {
      try { sessionStorage.removeItem(key); } catch { /* storage blocked: nothing was kept */ }
    },
  };

  function splitSearch(search) {
    const params = new URLSearchParams(search.replace(RAW_TAIL, ''));
    const hasLinkKeys = RAW_TAIL.test(search) || LINK_KEYS.some((key) => params.has(key));
    if (!hasLinkKeys) return { hasLinkKeys, visible: search };
    LINK_KEYS.forEach((key) => params.delete(key));
    const rest = params.toString();
    return { hasLinkKeys, visible: rest ? `?${rest}` : '' };
  }

  const { pathname, search, hash } = location;
  const { hasLinkKeys, visible } = splitSearch(search);
  const storageKey = STORAGE_PREFIX + pathname + visible;

  const navigation = performance.getEntriesByType?.('navigation')[0]?.type;
  // Only a reload or Back/Forward returns to the shortened URL of the same visit; a link to it (New stream) starts fresh.
  const revisit = navigation === 'reload' || navigation === 'back_forward';

  let query = search;
  if (hasLinkKeys) {
    // Only shorten the URL once the full query is safely stored, or a reload would lose it.
    if (session.set(storageKey, search)) history.replaceState(history.state, '', pathname + visible + hash);
  } else if (revisit) {
    query = session.get(storageKey) ?? search;
  } else {
    session.remove(storageKey);
  }

  window.LedgerQuery = query;
})();
