(() => {
  'use strict';

  const PASS_KEY = 'videos-pass';
  const TELEGRAM_PROMPT_KEY = 'videos-telegram-prompt';
  const THEME_KEY = 'videos-theme';
  const PASS_MARGIN_MS = 60 * 1000;
  const SEARCH_DELAY_MS = 150;
  const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';

  const icons = {
    play: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    playBig: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    moon: '<svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    sun: '<svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11zM21.85 2.15 10.91 13.09" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 4L3 11.2l6 2.2L11.4 20l3.2-4 4.4 3.3z M9 13.4L18 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  };

  // ---------- Utilities ----------

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  function httpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  }

  // 1.2K but 12K, rounding down the way video sites do.
  function compactCount(value) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    for (const [size, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
      if (count < size) continue;
      const scaled = count / size;
      const text = scaled < 10 ? (Math.floor(scaled * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(scaled));
      return text + suffix;
    }
    return String(count);
  }

  function formatDuration(seconds) {
    const total = Math.floor(Number(seconds) || 0);
    if (total <= 0) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60000);
    const steps = [[525600, 'year'], [43200, 'month'], [10080, 'week'], [1440, 'day'], [60, 'hour'], [1, 'minute']];
    for (const [size, unit] of steps) {
      const n = Math.floor(minutes / size);
      if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
    return 'Just now';
  }

  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* private mode: the pass lasts for this page only */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* nothing stored */ }
    },
  };

  function tokenExpiry(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
      return Number(payload.exp) * 1000 || 0;
    } catch {
      return 0;
    }
  }

  let memoryPass = '';
  const pass = {
    get() {
      const token = storage.get(PASS_KEY) || memoryPass;
      return token && tokenExpiry(token) - PASS_MARGIN_MS > Date.now() ? token : '';
    },
    set(token) {
      memoryPass = token;
      storage.set(PASS_KEY, token);
    },
    clear() {
      memoryPass = '';
      storage.remove(PASS_KEY);
    },
  };

  const params = new URLSearchParams(location.search);
  const watchHref = (tag) => `/r/${encodeURIComponent(tag)}`;

  // ---------- API ----------

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  // The pass is the access token and the captcha is how a new one is earned, so a request that
  // needs it waits for the captcha modal and retries once if the server says it has expired.
  function client(ctx) {
    const base = ctx.site.apiUrl.replace(/\/+$/, '');
    async function send(path, { method, body, token }) {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      let response;
      try {
        response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' });
      } catch {
        throw new ApiError('Can’t reach the server right now. Check your connection and try again.', 0);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(data.error || `Something went wrong (HTTP ${response.status}).`, response.status, data.code);
      return data;
    }

    return async function api(path, { method = 'GET', body, withPass = false } = {}) {
      if (!withPass) return send(path, { method, body });
      try {
        return await send(path, { method, body, token: await ensurePass(ctx) });
      } catch (err) {
        if (err.code !== 'pass_required') throw err;
        pass.clear();
        return send(path, { method, body, token: await ensurePass(ctx) });
      }
    };
  }

  // ---------- Captcha ----------

  let turnstileReady = null;
  function loadTurnstile() {
    turnstileReady ||= new Promise((resolve, reject) => {
      window.onTurnstileLoad = () => resolve(window.turnstile);
      const script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.onerror = () => {
        turnstileReady = null;
        reject(new Error('The captcha couldn’t load. Disable any blocker for this site and reload.'));
      };
      document.head.appendChild(script);
    });
    return turnstileReady;
  }

  let sitekeyRequest = null;
  async function mountCaptcha(ctx, container, onChange) {
    // The server lookup only covers builds made before TURNSTILE_SITEKEY was set here.
    sitekeyRequest ||= ctx.site.turnstileSitekey
      ? Promise.resolve(ctx.site.turnstileSitekey)
      : ctx.api('/api/config').then((config) => config.sitekey);
    const [turnstile, sitekey] = await Promise.all([loadTurnstile(), sitekeyRequest]);
    container.innerHTML = '';
    const id = turnstile.render(container, {
      sitekey,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      callback: () => onChange(''),
      'expired-callback': () => onChange('The captcha expired. Please solve it again.'),
      'error-callback': () => onChange('The captcha hit a problem. It will retry on its own.'),
    });
    return {
      response: () => turnstile.getResponse(id) || '',
      reset: () => turnstile.reset(id),
    };
  }

  // Wires a captcha box, an error line and a button to one async action.
  async function captchaForm(ctx, root, action) {
    const box = root.querySelector('[data-captcha]');
    const error = root.querySelector('[data-error]');
    const button = root.querySelector('[data-submit]');
    const showError = (message) => {
      error.textContent = message;
      error.hidden = !message;
    };

    let widget;
    try {
      widget = await mountCaptcha(ctx, box, showError);
    } catch (err) {
      box.innerHTML = '';
      showError(err.message);
      return;
    }
    button.disabled = false;

    button.addEventListener('click', async () => {
      const response = widget.response();
      if (!response) {
        showError('Please solve the captcha first.');
        return;
      }
      button.disabled = true;
      button.classList.add('is-loading');
      showError('');
      try {
        await action(response);
      } catch (err) {
        showError(err.message);
        widget.reset();
        button.disabled = false;
        button.classList.remove('is-loading');
      }
    });
  }

  // Can't be dismissed: every page needs the pass. Concurrent callers share one modal.
  let passPrompt = null;
  function ensurePass(ctx) {
    const current = pass.get();
    if (current) return Promise.resolve(current);
    passPrompt ||= new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'pass-modal';
      dialog.setAttribute('aria-labelledby', 'pass-modal-title');
      dialog.innerHTML = `
        <div class="gate__card" data-form>
          <span class="gate__icon">${icons.shield}</span>
          <span class="kicker">Security check</span>
          <h2 class="gate__title" id="pass-modal-title">Verify you’re human</h2>
          <p class="gate__text">Complete the check below to keep watching on ${esc(ctx.site.name)}. You’ll only need to do this about once a day.</p>
          <div class="captcha" data-captcha><span class="spinner" aria-hidden="true"></span></div>
          <p class="form-error" role="alert" data-error hidden></p>
          <button class="btn btn--solid btn--block" type="button" data-submit disabled>Continue</button>
        </div>`;

      let done = false;
      dialog.addEventListener('cancel', (event) => event.preventDefault());
      dialog.addEventListener('close', () => {
        if (!done) dialog.showModal();
      });
      document.body.appendChild(dialog);
      dialog.showModal();

      captchaForm(ctx, dialog.querySelector('[data-form]'), async (captcha) => {
        const { token } = await ctx.api('/api/pass', { method: 'POST', body: { captcha } });
        pass.set(token);
        done = true;
        dialog.close();
        dialog.remove();
        passPrompt = null;
        resolve(token);
      });
    });
    return passPrompt;
  }

  // ---------- Shared markup ----------

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }

  function avatar(category, className = 'avatar') {
    if (!category) return '';
    const image = httpUrl(category.avatar);
    return image
      ? `<span class="${className}"><img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
      : `<span class="${className} ${className}--text" aria-hidden="true">${esc(initials(category.name))}</span>`;
  }

  function thumb(video, { eager = false } = {}) {
    const image = httpUrl(video.thumbnail);
    const duration = formatDuration(video.durationSeconds);
    const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `
      <span class="thumb">
        ${image
          ? `<img class="thumb__fill" src="${esc(image)}" alt="" aria-hidden="true" ${loading} decoding="async" referrerpolicy="no-referrer">
             <img class="thumb__img" src="${esc(image)}" alt="" ${loading} decoding="async" referrerpolicy="no-referrer">`
          : `<span class="thumb__empty">${icons.playBig}</span>`}
        ${duration ? `<span class="thumb__time">${esc(duration)}</span>` : ''}
      </span>`;
  }

  function card(video) {
    const category = video.category;
    const search = `${video.title} ${video.description} ${category ? category.name : ''}`.toLowerCase();
    return `
      <a class="card" href="${watchHref(video.tag)}" data-search="${esc(search)}" data-kind="${esc(category ? category.slug : '')}">
        ${thumb(video)}
        <span class="card__body">
          ${avatar(category)}
          <span class="card__text">
            <span class="card__title">${esc(video.title)}</span>
            <span class="card__meta">
              ${category ? `<span>${esc(category.name)}</span>` : ''}
              <span>${esc(compactCount(video.views))} views</span>
            </span>
          </span>
        </span>
      </a>`;
  }

  function themeButton() {
    return `<button class="icon-btn" type="button" data-theme-toggle aria-label="Switch light or dark theme">${icons.moon}${icons.sun}</button>`;
  }

  function telegramLink(site) {
    const href = httpUrl(site.telegram);
    return href
      ? `<a class="pill-btn" href="${esc(href)}" target="_blank" rel="noopener">${icons.telegram}<span>Telegram</span></a>`
      : '';
  }

  // Shown on a visitor's first open only. It can't be dismissed: the visitor either joins or says they already have.
  function showTelegramPrompt(site) {
    const href = httpUrl(site.telegram);
    if (!href || storage.get(TELEGRAM_PROMPT_KEY)) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'tg-modal';
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', 'tg-modal-title');
    dialog.innerHTML = `
      <span class="tg-modal__icon">${icons.send}</span>
      <h2 class="tg-modal__title" id="tg-modal-title">Join our Telegram</h2>
      <p class="tg-modal__text">Get new videos first and never lose access to the channel.</p>
      <a class="tg-modal__btn tg-modal__btn--join" href="${esc(href)}" target="_blank" rel="noopener" data-choice>Join now</a>
      <button class="tg-modal__btn tg-modal__btn--joined" type="button" data-choice>Already joined</button>`;

    let answered = false;
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    // Browsers may still close it (a repeated Esc, the Android back gesture), so it reopens until answered.
    dialog.addEventListener('close', () => {
      if (!answered) {
        dialog.showModal();
        return;
      }
      storage.set(TELEGRAM_PROMPT_KEY, '1');
      dialog.remove();
    });
    dialog.addEventListener('click', (event) => {
      if (!event.target.closest('[data-choice]')) return;
      answered = true;
      dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.focus();
  }

  function renderTopbar(site, { back = false, search = false } = {}) {
    const topbar = document.getElementById('topbar');
    topbar.innerHTML = `
      <div class="topbar__row container">
        ${back ? `<a class="icon-btn" href="/" aria-label="All videos">${icons.back}</a>` : ''}
        <a class="brand" href="/">
          <span class="brand__mark">${icons.play}</span>
          <span class="brand__name">${esc(site.name)}</span>
        </a>
        ${search ? `
          <label class="search" data-search-box>
            <span class="search__icon">${icons.search}</span>
            <input type="search" placeholder="Search videos" autocomplete="off" enterkeyhint="search" aria-label="Search videos" data-search-input>
            <button class="icon-btn search__close" type="button" aria-label="Close search" data-search-close>${icons.close}</button>
          </label>
          <button class="icon-btn search-open" type="button" aria-label="Search" data-search-open>${icons.search}</button>` : ''}
        <span class="topbar__end">
          ${telegramLink(site)}
          ${themeButton()}
        </span>
      </div>`;

    topbar.querySelector('[data-theme-toggle]').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      storage.set(THEME_KEY, next);
    });
  }

  function notice(main, title, message, action = '') {
    main.innerHTML = `
      <section class="notice container">
        <h1>${esc(title)}</h1>
        <p>${esc(message)}</p>
        ${action}
      </section>`;
  }

  // ---------- Home ----------

  function categoriesOf(videos) {
    const seen = new Map();
    for (const video of videos) if (video.category && !seen.has(video.category.slug)) seen.set(video.category.slug, video.category);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderList(ctx, main, videos) {
    document.title = ctx.site.name;
    renderTopbar(ctx.site, { search: videos.length > 0 });
    if (!videos.length) {
      notice(main, 'Nothing here yet', 'New videos are on the way. Check back soon.');
      return;
    }

    const categories = categoriesOf(videos);
    const wanted = params.get('category') || '';
    let kind = categories.some((c) => c.slug === wanted) ? wanted : '';
    const chip = (slug, content) =>
      `<button class="chip" type="button" data-kind="${esc(slug)}" aria-pressed="${slug === kind}">${content}</button>`;

    main.innerHTML = `
      ${categories.length ? `
        <nav class="chips container" aria-label="Categories" data-chips>
          ${chip('', 'All')}
          ${categories.map((c) => chip(c.slug, `${avatar(c, 'chip__avatar')}<span>${esc(c.name)}</span>`)).join('')}
        </nav>` : ''}
      <section class="feed container" aria-label="Videos">
        <div class="grid" data-grid>${videos.map(card).join('')}</div>
        <p class="empty" data-empty hidden>No videos match your search.</p>
      </section>`;

    const cards = [...main.querySelectorAll('.card')];
    const empty = main.querySelector('[data-empty]');
    const topbar = document.getElementById('topbar');
    const input = topbar.querySelector('[data-search-input]');

    function apply() {
      const query = input.value.trim().toLowerCase();
      let shown = 0;
      for (const item of cards) {
        const match = (!kind || item.dataset.kind === kind) && (!query || item.dataset.search.includes(query));
        item.hidden = !match;
        if (match) shown += 1;
      }
      empty.hidden = shown > 0;
    }

    function syncUrl() {
      const url = new URL(location.href);
      if (kind) url.searchParams.set('category', kind);
      else url.searchParams.delete('category');
      history.replaceState(null, '', url.pathname + url.search);
    }

    main.querySelector('[data-chips]')?.addEventListener('click', (event) => {
      const button = event.target.closest('.chip');
      if (!button) return;
      kind = button.dataset.kind;
      for (const other of main.querySelectorAll('.chip')) other.setAttribute('aria-pressed', String(other === button));
      button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      syncUrl();
      apply();
    });

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(apply, SEARCH_DELAY_MS);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
    topbar.querySelector('[data-search-open]').addEventListener('click', () => {
      topbar.classList.add('is-searching');
      input.focus();
    });
    topbar.querySelector('[data-search-close]').addEventListener('click', (event) => {
      event.preventDefault();
      topbar.classList.remove('is-searching');
      input.value = '';
      apply();
    });

    apply();
  }

  async function homePage(ctx, main) {
    if (location.pathname.endsWith('.html')) history.replaceState(null, '', `/${location.search}`);
    renderTopbar(ctx.site);
    main.innerHTML = '<p class="loading"><span class="spinner" aria-hidden="true"></span>Loading videos…</p>';
    try {
      const { videos } = await ctx.api('/api/videos', { withPass: true });
      renderList(ctx, main, videos);
      showTelegramPrompt(ctx.site);
    } catch (err) {
      notice(main, 'Couldn’t load videos', err.message, '<a class="btn" href="">Try again</a>');
    }
  }

  // ---------- Watch ----------

  function relatedSection(title, videos) {
    if (!videos.length) return '';
    return `
      <section class="related">
        <h2 class="block-title">${esc(title)}</h2>
        <div class="grid grid--related">${videos.map(card).join('')}</div>
      </section>`;
  }

  // The register dialog opens over the blogsite's page for this video, so after signing up the visitor is watching it.
  function blogsiteVideoUrl(base, tag) {
    const href = httpUrl(base);
    if (!href) return '';
    const url = new URL(href);
    url.search = '';
    url.hash = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    const videoUrl = new URL('videos/', url);
    videoUrl.searchParams.set('v', tag);
    return videoUrl.href;
  }

  // Falls back to this tab when the browser blocks the new one (Safari can, once a captcha came between).
  function openInNewTab(href) {
    const tab = window.open('', '_blank');
    if (!tab) {
      location.href = href;
      return;
    }
    tab.opener = null;
    tab.location.replace(href);
  }

  function renderWatch(ctx, main, { video, same, others }) {
    const category = video.category;
    document.title = `${video.title} · ${ctx.site.name}`;
    const posted = timeAgo(video.createdAt);
    const blogsite = blogsiteVideoUrl(ctx.site.blogsiteUrl, video.tag);

    main.innerHTML = `
      <div class="watch container">
        <article class="watch__main">
          <button class="watch__poster" type="button" data-watch aria-label="Watch this video"${blogsite ? '' : ' disabled'}>
            ${thumb(video, { eager: true })}
            <span class="watch__play">${icons.playBig}</span>
          </button>

          <h1 class="watch__title">${esc(video.title)}</h1>
          <p class="watch__meta">
            <span>${esc(compactCount(video.views))} views</span>
            ${posted ? `<span>${esc(posted)}</span>` : ''}
            <span class="watch__free">Free</span>
          </p>

          ${category ? `
            <a class="channel" href="/?category=${encodeURIComponent(category.slug)}">
              ${avatar(category, 'avatar avatar--lg')}
              <span class="channel__name">${esc(category.name)}</span>
            </a>` : ''}

          ${video.description ? `
            <div class="description">
              <p class="description__text" data-desc>${esc(video.description)}</p>
              <button class="description__toggle" type="button" data-desc-toggle hidden>Show more</button>
            </div>` : ''}

        </article>

        <aside class="watch__side">
          ${relatedSection(category ? `More from ${category.name}` : 'More videos', same)}
          ${relatedSection(same.length ? 'You may also like' : 'Suggested videos', others)}
        </aside>
      </div>`;

    const text = main.querySelector('[data-desc]');
    const toggle = main.querySelector('[data-desc-toggle]');
    if (text && toggle) {
      toggle.hidden = text.scrollHeight <= text.clientHeight + 4;
      toggle.addEventListener('click', () => {
        const open = text.classList.toggle('is-open');
        toggle.textContent = open ? 'Show less' : 'Show more';
      });
    }

    const poster = main.querySelector('[data-watch]');
    // In the fragment, not the query, so the pass never reaches a server log, analytics or a Referer.
    const watchHrefWith = (token) => `${blogsite}#access=${encodeURIComponent(token)}`;
    poster.addEventListener('click', async () => {
      const ready = pass.get();
      // Opened inside the click itself, so the browser doesn't treat the new tab as a pop-up.
      if (ready) return openInNewTab(watchHrefWith(ready));
      poster.disabled = true;
      const token = await ensurePass(ctx);
      poster.disabled = false;
      openInNewTab(watchHrefWith(token));
    });
    // Back from the blogsite can restore this page from the back/forward cache with the poster still disabled.
    window.addEventListener('pageshow', () => {
      poster.disabled = !blogsite;
    });
  }

  // Old links used watch.html?v=<tag>; they're rewritten in place to /r/<tag>.
  function watchTag() {
    const legacy = params.get('v');
    if (legacy) {
      history.replaceState(null, '', watchHref(legacy));
      return legacy;
    }
    const match = location.pathname.match(/^\/r\/([^/]+)\/?$/);
    try {
      return match ? decodeURIComponent(match[1]) : '';
    } catch {
      return '';
    }
  }

  async function watchPage(ctx, main) {
    renderTopbar(ctx.site, { back: true });
    const tag = watchTag();
    if (!tag) {
      location.replace('/');
      return;
    }
    try {
      renderWatch(ctx, main, await ctx.api(`/api/videos/${encodeURIComponent(tag)}`, { withPass: true }));
      showTelegramPrompt(ctx.site);
    } catch (err) {
      if (err.status === 404) {
        notice(main, 'Video not found', err.message, '<a class="btn" href="/">Browse all videos</a>');
        return;
      }
      notice(main, 'Couldn’t load this video', err.message, '<a class="btn" href="">Try again</a>');
    }
  }

  // ---------- Visit tracking ----------

  // Gate tokens and stream links ride at the end of the query string; they never leave the page.
  const withoutSecrets = (url) => String(url || '').replace(/[?&](?:token|endpoint|url|startapp)=[^]*$/, '');

  function trackVisit(apiUrl) {
    let visitorId = '';
    try {
      visitorId = localStorage.getItem('vid') || '';
      if (!visitorId) {
        visitorId = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('vid', visitorId);
      }
    } catch {
      visitorId = '';
    }
    const connection = navigator.connection || {};
    const body = {
      path: withoutSecrets(location.pathname + location.search),
      referrer: withoutSecrets(document.referrer),
      visitorId,
      language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      connection: { effectiveType: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt },
    };
    // A plain string body is sent as text/plain, which needs no CORS preflight.
    fetch(`${apiUrl.replace(/\/+$/, '')}/api/visit`, { method: 'POST', body: JSON.stringify(body), keepalive: true, credentials: 'omit' }).catch(() => {});
  }

  // ---------- Boot ----------

  async function boot() {
    const main = document.getElementById('main');
    let site;
    try {
      const response = await fetch('/data/site.json', { cache: 'no-cache' });
      site = await response.json();
    } catch {
      notice(main, 'Site settings missing', 'data/site.json couldn’t be loaded.');
      return;
    }
    site.name ||= 'Videos';
    if (!httpUrl(site.apiUrl)) {
      notice(main, 'Server not set', 'Set API_URL in .env, then run npm run config.');
      return;
    }

    trackVisit(site.apiUrl);
    const ctx = { site };
    ctx.api = client(ctx);
    const pages = { home: homePage, watch: watchPage };
    await (pages[document.body.dataset.page] || homePage)(ctx, main);
  }

  boot();
})();
