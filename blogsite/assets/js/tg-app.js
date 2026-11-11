(() => {
  'use strict';

  const AD_FAILURES_BEFORE_SKIP = 2;
  const REQUEST_TIMEOUT_MS = 15000;

  const tg = window.Telegram?.WebApp;
  const app = document.getElementById('app');

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  function httpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function formatDuration(seconds) {
    const total = Math.floor(Number(seconds) || 0);
    if (total <= 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  // Inside Telegram the token arrives as start_param; ?startapp= works for testing in a browser.
  function startToken() {
    const query = new URLSearchParams(location.search);
    return tg?.initDataUnsafe?.start_param || query.get('tgWebAppStartParam') || query.get('startapp') || '';
  }

  function showAd() {
    const name = document.querySelector('[data-ad-sdk]')?.dataset.sdk;
    const show = name && window[name];
    if (typeof show !== 'function') return Promise.reject(new Error('Ad SDK not loaded'));
    return show();
  }

  function openOutside(url) {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener');
  }

  function message(title, text) {
    app.innerHTML = `
      <section class="message">
        <h1>${esc(title)}</h1>
        <p>${esc(text)}</p>
      </section>`;
  }

  async function boot() {
    tg?.ready();
    tg?.expand();

    const token = startToken();
    if (!token) {
      message('Nothing to play', 'Open this app from a video’s “Open in Telegram” button.');
      return;
    }

    let apiUrl;
    try {
      const site = await (await fetch('data/site.json', { cache: 'no-cache' })).json();
      apiUrl = httpUrl(site.telegramApp?.apiUrl);
    } catch { /* handled below */ }
    if (!apiUrl) {
      message('Not set up', 'Set "telegramApp.apiUrl" in data/site.json to the video server’s address.');
      return;
    }

    const initData = tg?.initData || '';
    const api = async (path, options = {}) => {
      const response = await fetch(new URL(path, apiUrl), {
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        credentials: 'omit',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch(() => {
        throw new Error('Can’t reach the server right now. Check your connection and try again.');
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Something went wrong (HTTP ${response.status}).`);
      return data;
    };

    let video;
    try {
      video = await api(`api/app/video?token=${encodeURIComponent(token)}&initData=${encodeURIComponent(initData)}`);
    } catch (err) {
      message('Can’t open this video', err.message);
      return;
    }

    const poster = httpUrl(video.poster);
    const duration = formatDuration(video.durationSeconds);
    app.innerHTML = `
      <article class="video">
        <div class="video__poster">
          ${poster ? `<img src="${esc(poster)}" alt="" referrerpolicy="no-referrer">` : ''}
          ${duration ? `<span class="video__time">${esc(duration)}</span>` : ''}
        </div>
        ${video.channel ? `<span class="kicker">${esc(video.channel)}</span>` : ''}
        <h1 class="video__title">${esc(video.title)}</h1>
      </article>
      <section class="unlock">
        <p class="unlock__text">Watch a short ad and the video opens in your browser.</p>
        <button class="btn" type="button" data-play>Watch ad &amp; play</button>
        <p class="status" role="status" data-status></p>
        <a class="link" data-link hidden target="_blank" rel="noopener">Open the video</a>
      </section>`;

    const button = app.querySelector('[data-play]');
    const status = app.querySelector('[data-status]');
    const link = app.querySelector('[data-link]');
    const setStatus = (text, isError = false) => {
      status.textContent = text;
      status.classList.toggle('is-error', isError);
    };

    let adFailures = 0;

    async function unlock() {
      setStatus('Getting your video…');
      const { url } = await api('api/app/claim', { method: 'POST', body: JSON.stringify({ token, initData }) });
      const target = httpUrl(url);
      if (!target) throw new Error('The server didn’t return a link.');
      link.href = target;
      link.hidden = false;
      button.hidden = true;
      setStatus('Opening in your browser… If nothing happens, tap the link below.');
      openOutside(target);
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      setStatus('Loading ad…');
      try {
        await showAd();
      } catch {
        adFailures += 1;
        // Lets a visitor through when no ad is available (no fill or a blocker) instead of trapping them.
        if (adFailures < AD_FAILURES_BEFORE_SKIP) {
          setStatus('The ad couldn’t load. Tap the button to try again.', true);
          button.disabled = false;
          return;
        }
      }
      try {
        await unlock();
      } catch (err) {
        setStatus(err.message, true);
        button.disabled = false;
      }
    });
  }

  boot();
})();
