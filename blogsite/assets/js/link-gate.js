(() => {
  'use strict';

  const DEFAULTS = {
    countdownSeconds: 10,
    method: 'GET',
    header: 'Authorization',
    scheme: 'Bearer',
    allowedOrigins: [],
  };
  const TEXT = {
    banner: 'Your link is ready.',
    bannerButton: 'Continue to link',
    title: 'Your link is almost ready',
    intro: 'Press the button below, wait a few seconds, then get your link.',
    start: 'Click here',
    waiting: 'Please wait {s} seconds…',
    get: 'Click here to get link',
    loading: 'Getting your link…',
    redirecting: 'Redirecting…',
    expired: 'This link has expired. Go back and request a new one.',
    invalid: 'This link isn’t valid.',
    unreachable: 'Couldn’t reach the link server. It may be offline, or it may not allow requests from this site (CORS).',
    serverError: 'The link server returned an error (HTTP {status}).',
    noLink: 'The link server didn’t return a link.',
    retry: 'Try again',
  };
  const REQUEST_TIMEOUT_MS = 15000;
  const SCROLL_FOCUS_DELAY_MS = 600;
  const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

  const arrowDown = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Reads the JWT payload only. The signature can't be checked here (it needs the server's secret);
  // the server verifies it when the token comes back in the request header.
  function decodePayload(token) {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  function httpUrl(value, base) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), base);
      return HTTP_PROTOCOLS.has(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  const originAllowed = (url, allowed) =>
    !allowed.length || allowed.includes(url.origin) || (allowed.includes('self') && url.origin === location.origin);

  const isExpired = (payload) => Number.isFinite(payload.exp) && payload.exp * 1000 <= Date.now();

  const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));

  // Accepts { "url": … } (or redirect/location/link, optionally inside "data"), a JSON string, or a plain-text URL.
  async function readTarget(response) {
    const body = (await response.text()).trim();
    let candidate = body;
    if (/json/i.test(response.headers.get('content-type') || '') || /^[{["]/.test(body)) {
      try {
        const data = JSON.parse(body);
        const source = data && typeof data === 'object' && data.data && typeof data.data === 'object' ? data.data : data;
        candidate = typeof data === 'string'
          ? data
          : source?.url ?? source?.redirect ?? source?.location ?? source?.link ?? '';
      } catch { /* not JSON after all; treat the body as text */ }
    }
    const target = httpUrl(candidate, response.url);
    if (target) return target;
    return response.redirected ? httpUrl(response.url) : null;
  }

  async function requestLink(fetchUrl, token, config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(fetchUrl.href, {
        method: config.method,
        headers: { [config.header]: config.scheme ? `${config.scheme} ${token}` : token },
        credentials: 'omit',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function linkGate(ctx) {
    const token = new URLSearchParams(window.LedgerQuery ?? location.search).get('token');
    if (!token) return;

    const { esc } = ctx.helpers;
    const settings = ctx.site.linkGate || {};
    const config = { ...DEFAULTS, ...settings, allowedOrigins: Array.isArray(settings.allowedOrigins) ? settings.allowedOrigins : [] };
    const text = { ...TEXT, ...(settings.text || {}) };
    const seconds = Math.max(0, Math.round(Number(config.countdownSeconds) || 0));

    const payload = decodePayload(token);
    const fetchUrl = payload && httpUrl(payload.fetchurl ?? payload.fetchUrl, document.baseURI);
    let problem = '';
    if (!payload || !fetchUrl || !originAllowed(fetchUrl, config.allowedOrigins)) problem = text.invalid;
    else if (isExpired(payload)) problem = text.expired;

    const step = Number(payload?.step);
    const pages = Number(payload?.pages);
    const stepText = Number.isFinite(step) && Number.isFinite(pages) && pages > 0 ? `Step ${step} of ${pages}` : '';

    const banner = document.createElement('div');
    banner.className = `link-banner${problem ? ' link-banner--problem' : ''}`;
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Your link');
    banner.innerHTML = `
      <div class="container link-banner__inner">
        ${stepText ? `<span class="link-banner__step">${esc(stepText)}</span>` : ''}
        <span class="link-banner__text">${esc(problem || text.banner)}</span>
        ${problem ? '' : `<a class="link-banner__button" href="#link-gate" data-gate-jump>${esc(text.bannerButton)}${arrowDown}</a>`}
      </div>`;
    document.getElementById('site-header').prepend(banner);

    const gate = document.createElement('section');
    gate.className = 'link-gate';
    gate.id = 'link-gate';
    gate.setAttribute('aria-labelledby', 'link-gate-title');
    gate.innerHTML = `
      ${stepText ? `<span class="kicker">${esc(stepText)}</span>` : ''}
      <h2 id="link-gate-title">${esc(text.title)}</h2>
      <p class="link-gate__intro">${esc(problem || text.intro)}</p>
      <div class="link-gate__action" data-gate-action></div>
      <div class="link-gate__progress" data-gate-progress hidden><span></span></div>
      <p class="link-gate__status" data-gate-status role="status" aria-live="polite"></p>`;
    document.getElementById('main').append(gate);

    if (problem) return;

    const action = gate.querySelector('[data-gate-action]');
    const progress = gate.querySelector('[data-gate-progress]');
    const bar = progress.querySelector('span');
    const status = gate.querySelector('[data-gate-status]');

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    };

    function showButton(label, onClick) {
      action.innerHTML = `<button class="btn btn--solid link-gate__button" type="button">${esc(label)}</button>`;
      const button = action.querySelector('button');
      button.addEventListener('click', () => onClick(button), { once: true });
      return button;
    }

    function startCountdown() {
      action.innerHTML = '';
      if (!seconds) {
        showGetButton();
        return;
      }
      let remaining = seconds;
      progress.hidden = false;
      bar.style.width = '0%';
      setStatus(fill(text.waiting, { s: remaining }));
      const timer = setInterval(() => {
        remaining -= 1;
        bar.style.width = `${((seconds - remaining) / seconds) * 100}%`;
        if (remaining > 0) {
          setStatus(fill(text.waiting, { s: remaining }));
          return;
        }
        clearInterval(timer);
        progress.hidden = true;
        setStatus('');
        showGetButton().focus({ preventScroll: true });
      }, 1000);
    }

    function showGetButton() {
      return showButton(text.get, getLink);
    }

    async function getLink(button) {
      button.disabled = true;
      setStatus(text.loading);
      if (isExpired(payload)) {
        action.innerHTML = '';
        setStatus(text.expired, true);
        return;
      }

      let message;
      try {
        const response = await requestLink(fetchUrl, token, config);
        if (response.ok) {
          const target = await readTarget(response);
          if (target) {
            setStatus(text.redirecting);
            location.assign(target.href);
            return;
          }
          message = text.noLink;
        } else {
          message = fill(text.serverError, { status: response.status });
        }
      } catch {
        message = text.unreachable;
      }
      setStatus(message, true);
      showButton(text.retry, getLink);
    }

    showButton(text.start, startCountdown);

    banner.querySelector('[data-gate-jump]').addEventListener('click', (event) => {
      event.preventDefault();
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gate.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
      setTimeout(() => action.querySelector('button')?.focus({ preventScroll: true }), smooth ? SCROLL_FOCUS_DELAY_MS : 0);
    });
  }

  (window.LedgerHooks ||= []).push(linkGate);
})();
