(() => {
  'use strict';

  const LIBS = {
    hls: { src: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js', global: 'Hls' },
    dash: { src: 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js', global: 'dashjs' },
    mpegts: { src: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js', global: 'mpegts' },
  };
  const START_TIMEOUT_MS = 20000;
  const MAX_RECOVERIES = 3;
  const IDLE_MS = 2600;
  const OSD_MS = 800;
  const BUFFERING_DELAY_MS = 300;
  const SEEK_SMALL_S = 5;
  const SEEK_LARGE_S = 10;
  const FRAME_S = 1 / 30;
  const VOLUME_STEP = 0.05;
  const LIVE_EDGE_TOLERANCE_S = 15;
  const MIN_DVR_WINDOW_S = 30;
  const RESUME_MIN_DURATION_S = 60;
  const RESUME_MARGIN_S = 15;
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const DOUBLE_TAP_MS = 300;
  const VOLUME_KEY = 'ledger-player-volume';
  const POSITION_KEY = 'ledger-player-pos:';
  const ENDPOINT_TIMEOUT_MS = 15000;
  const UP_NEXT_S = 8;
  const MAX_RELATED = 24;
  const DESCRIPTION_LIMIT = 5000;

  const ENGINE_TYPES = ['native', 'hls', 'dash', 'flv', 'ts'];
  const EMBED_TYPE = 'iframe';
  const FALLBACK_ORDER = ['native', 'hls', 'dash'];
  const NATIVE_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'oga', 'mkv', 'mp3', 'm4a', 'aac', 'wav', 'opus', 'flac']);
  const GENERIC_NAMES = /^(master|index|playlist|manifest|stream|live|chunklist|mono|video)$/i;
  const BROWSER_PROTOCOLS = new Set(['http:', 'https:']);

  const svg = (body, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  const icons = {
    play: svg('<path d="M8 5.2v13.6L19 12z" fill="currentColor"/>'),
    pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>'),
    replay: svg('<path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4.5 4.5v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    back: svg('<path d="M12 5a7.5 7.5 0 1 1-7.1 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4.5v5.2h5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12.4" y="15.6" text-anchor="middle" font-size="7.2" font-weight="700" font-family="Arial, sans-serif" fill="currentColor">10</text>'),
    forward: svg('<path d="M12 5a7.5 7.5 0 1 0 7.1 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4.5v5.2h-5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="11.6" y="15.6" text-anchor="middle" font-size="7.2" font-weight="700" font-family="Arial, sans-serif" fill="currentColor">10</text>'),
    volumeHigh: svg('<path d="M4 9.2h3.6L12.5 5v14l-4.9-4.2H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    volumeLow: svg('<path d="M4 9.2h3.6L12.5 5v14l-4.9-4.2H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    volumeMuted: svg('<path d="M4 9.2h3.6L12.5 5v14l-4.9-4.2H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    captions: svg('<rect x="3" y="5.5" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.4a2.3 2.3 0 1 0 0 3.2M17 10.4a2.3 2.3 0 1 0 0 3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    settings: svg('<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="2.9 2.75"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>'),
    pip: svg('<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="11.5" y="11" width="7" height="5.5" rx="0.8" fill="currentColor"/>'),
    fullscreen: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    exitFullscreen: svg('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    chevronRight: svg('<path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 16),
    chevronLeft: svg('<path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 16),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 16),
    close: svg('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 16),
  };

  // ---------- Helpers ----------

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const eventFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  });

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  const formatBitrate = (bps) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`);
  const speedLabel = (rate) => (rate === 1 ? 'Normal' : `${rate}×`);
  const qualityLabel = (height, bitrate) => (height ? `${height}p` : formatBitrate(bitrate || 0));
  const qualityTag = (height) => (height >= 2160 ? '4K' : height >= 720 ? 'HD' : '');

  const storage = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    },
  };

  // ---------- URL handling ----------

  // Reads the last key raw so unencoded links that contain their own "&" still work when it comes last.
  function readRequest(search) {
    const params = new URLSearchParams(search);
    let type = (params.get('type') || '').toLowerCase();
    let start = Number(params.get('t')) || 0;
    const match = search.match(/[?&](endpoint|url)=([^]*)$/);
    if (!match) return { url: '', endpoint: '', type, start };

    let raw = match[2];
    let trailing;
    while ((trailing = raw.match(/&(type|t|token)=([\w.-]+)$/i))) {
      if (trailing[1] === 'type') type = trailing[2].toLowerCase();
      else if (trailing[1] === 't') start = Number(trailing[2]) || 0;
      raw = raw.slice(0, trailing.index);
    }
    try { raw = decodeURIComponent(raw.replace(/\+/g, '%20')); } catch { /* keep raw value */ }
    raw = raw.trim();

    const isEndpoint = match[1] === 'endpoint' || type === 'fetch';
    return {
      url: isEndpoint ? '' : raw,
      endpoint: isEndpoint ? raw : '',
      type: ENGINE_TYPES.includes(type) || type === EMBED_TYPE ? type : '',
      start,
    };
  }

  function parseStreamUrl(value) {
    let url;
    try {
      url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? new URL(value) : new URL(value, document.baseURI);
    } catch {
      return { error: 'That doesn’t look like a web address. Links should start with https://' };
    }
    if (/^(rtmps?|rtsp|udp|rtp|srt|mms):$/.test(url.protocol)) {
      return { error: `${url.protocol.replace(':', '').toUpperCase()} streams can’t play in a web browser. Ask the provider for an HLS (.m3u8) or DASH (.mpd) link.` };
    }
    if (!BROWSER_PROTOCOLS.has(url.protocol)) return { error: 'Only http:// and https:// links can be played.' };
    return { url };
  }

  function detectFormat(url) {
    const path = url.pathname.toLowerCase();
    const ext = path.includes('.') ? path.split('.').pop() : '';
    if (ext === 'm3u8' || ext === 'm3u' || /m3u8/i.test(url.href)) return { engine: 'hls', label: 'HLS' };
    if (ext === 'mpd' || /format=mpd/i.test(url.href)) return { engine: 'dash', label: 'DASH' };
    if (ext === 'flv') return { engine: 'flv', label: 'FLV' };
    if (ext === 'ts' || ext === 'm2ts' || ext === 'mts') return { engine: 'ts', label: 'MPEG-TS' };
    if (NATIVE_EXTENSIONS.has(ext)) return { engine: 'native', label: ext.toUpperCase() };
    return { engine: null, label: 'Stream' };
  }

  function streamTitle(url) {
    let last = url.pathname.split('/').filter(Boolean).pop() || '';
    try { last = decodeURIComponent(last); } catch { /* keep encoded */ }
    const base = last.replace(/\.[a-z0-9]+$/i, '');
    if (!base || GENERIC_NAMES.test(base)) return `Stream from ${url.hostname}`;
    return base.replace(/[_-]+/g, ' ');
  }

  // ---------- Libraries ----------

  const libraryLoads = {};

  function loadLibrary(key) {
    const lib = LIBS[key];
    if (window[lib.global]) return Promise.resolve(window[lib.global]);
    libraryLoads[key] ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = lib.src;
      script.async = true;
      script.onload = () => (window[lib.global] ? resolve(window[lib.global]) : reject(new Error(`The ${key} player failed to start.`)));
      script.onerror = () => {
        delete libraryLoads[key];
        reject(new Error('The playback engine couldn’t be downloaded. Check your internet connection.'));
      };
      document.head.appendChild(script);
    });
    return libraryLoads[key];
  }

  // ---------- Engines ----------
  // Every engine returns a session with the same shape; withDefaults fills in what an engine can't do.

  const UNREACHABLE = 'The stream couldn’t be reached. It may be offline, or the server may not allow playback on other websites.';

  function withDefaults(session) {
    return {
      destroy() {},
      qualities: () => [],
      getQuality: () => -1,
      activeQuality: () => null,
      setQuality() {},
      audioTracks: () => [],
      getAudioTrack: () => 0,
      setAudioTrack() {},
      textTracks: () => [],
      getTextTrack: () => -1,
      setTextTrack() {},
      liveEdge: () => null,
      bandwidth: () => null,
      ...session,
    };
  }

  // Subtitle files listed by an endpoint are added as <track>s; engines must not count them as their own.
  const externalTextTracks = new WeakSet();

  function nativeTextTracks(video) {
    const list = () => [...video.textTracks]
      .filter((t) => (t.kind === 'subtitles' || t.kind === 'captions') && !externalTextTracks.has(t));
    return {
      textTracks: () => list().map((t, i) => ({ id: i, label: t.label || t.language || `Track ${i + 1}` })),
      getTextTrack: () => list().findIndex((t) => t.mode === 'showing'),
      setTextTrack: (id) => list().forEach((t, i) => { t.mode = i === id ? 'showing' : 'disabled'; }),
    };
  }

  function mediaErrorMessage(error) {
    switch (error?.code) {
      case 1: return 'Playback was stopped before the stream loaded.';
      case 2: return 'A network error stopped the stream from loading.';
      case 3: return 'The stream uses a codec this browser can’t decode.';
      case 4: return 'This format isn’t supported, or the server refused the request.';
      default: return 'The stream couldn’t be played.';
    }
  }

  function hlsErrorMessage(data) {
    const status = data.response?.code;
    if (/manifestLoad/.test(data.details)) return status ? `The stream server returned an error (HTTP ${status}).` : UNREACHABLE;
    if (data.details === 'manifestParsingError') return 'The link didn’t return a valid HLS playlist.';
    if (data.type === 'networkError') return 'A network error interrupted the stream.';
    return 'The stream data couldn’t be decoded by this browser.';
  }

  const trackLabel = (track, index) => track.name || track.labels?.[0]?.text || track.label || track.lang || `Track ${index + 1}`;

  const engines = {
    async native(url, video, hooks) {
      video.src = url;
      video.textTracks.addEventListener?.('addtrack', hooks.onTracks);
      return withDefaults({ name: 'Browser', ...nativeTextTracks(video) });
    },

    async hls(url, video, hooks) {
      const Hls = await loadLibrary('hls');
      if (!Hls.isSupported()) {
        if (!video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('This browser can’t play HLS streams.');
        video.src = url;
        return withDefaults({ name: 'Browser (native HLS)', ...nativeTextTracks(video) });
      }

      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
      let recoveries = 0;
      let manual = -1;

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        const canRecover = recoveries < MAX_RECOVERIES;
        if (canRecover && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          recoveries += 1;
          hls.recoverMediaError();
        } else if (canRecover && data.type === Hls.ErrorTypes.NETWORK_ERROR && hooks.isStarted()) {
          recoveries += 1;
          hls.startLoad();
        } else {
          hooks.onFatal(hlsErrorMessage(data));
        }
      });
      hls.on(Hls.Events.FRAG_LOADED, () => { recoveries = 0; });
      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => hooks.onLive(Boolean(data.details?.live)));
      [Hls.Events.MANIFEST_PARSED, Hls.Events.AUDIO_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACKS_UPDATED,
        Hls.Events.LEVEL_SWITCHED, Hls.Events.AUDIO_TRACK_SWITCHED, Hls.Events.SUBTITLE_TRACK_SWITCH]
        .forEach((event) => hls.on(event, hooks.onTracks));

      hls.subtitleDisplay = false;
      hls.loadSource(url);
      hls.attachMedia(video);

      const level = (index) => {
        const l = hls.levels[index];
        return l && { id: index, height: l.height, bitrate: l.bitrate, label: qualityLabel(l.height, l.bitrate) };
      };

      return withDefaults({
        name: 'hls.js',
        destroy: () => hls.destroy(),
        qualities: () => hls.levels.map((_, i) => level(i)),
        getQuality: () => manual,
        activeQuality: () => level(hls.currentLevel),
        setQuality: (id) => { manual = id; hls.currentLevel = id; },
        audioTracks: () => hls.audioTracks.map((t, i) => ({ id: i, label: trackLabel(t, i) + (t.attrs?.CHANNELS === '6' ? ' (5.1)' : '') })),
        getAudioTrack: () => hls.audioTrack,
        setAudioTrack: (id) => { hls.audioTrack = id; },
        textTracks: () => hls.subtitleTracks.map((t, i) => ({ id: i, label: trackLabel(t, i) })),
        getTextTrack: () => (hls.subtitleDisplay ? hls.subtitleTrack : -1),
        setTextTrack: (id) => {
          hls.subtitleDisplay = id >= 0;
          hls.subtitleTrack = id;
        },
        liveEdge: () => hls.liveSyncPosition,
        bandwidth: () => hls.bandwidthEstimate,
      });
    },

    async dash(url, video, hooks) {
      const dashjs = await loadLibrary('dash');
      const player = dashjs.MediaPlayer().create();
      const events = dashjs.MediaPlayer.events;
      let manual = -1;

      player.on(events.ERROR, (event) => {
        const message = event.error?.message || '';
        hooks.onFatal(/manifest/i.test(message) || event.error?.code === 25 ? UNREACHABLE : 'The DASH stream couldn’t be played.');
      });
      player.on(events.STREAM_INITIALIZED, () => {
        hooks.onLive(player.isDynamic());
        hooks.onTracks();
      });
      [events.QUALITY_CHANGE_RENDERED, events.TEXT_TRACKS_ADDED, events.TRACK_CHANGE_RENDERED]
        .forEach((event) => player.on(event, hooks.onTracks));

      player.initialize(video, url, false);

      const bitrates = () => player.getBitrateInfoListFor('video') || [];
      const level = (info) => info && {
        id: info.qualityIndex, height: info.height, bitrate: info.bitrate, label: qualityLabel(info.height, info.bitrate),
      };
      const audioList = () => player.getTracksFor('audio') || [];

      return withDefaults({
        name: 'dash.js',
        destroy: () => player.reset(),
        qualities: () => bitrates().map(level),
        getQuality: () => manual,
        activeQuality: () => level(bitrates()[player.getQualityFor('video')]),
        setQuality: (id) => {
          manual = id;
          player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: id < 0 } } } });
          if (id >= 0) player.setQualityFor('video', id, true);
        },
        audioTracks: () => audioList().map((t, i) => ({ id: i, label: trackLabel(t, i) })),
        getAudioTrack: () => audioList().indexOf(player.getCurrentTrackFor('audio')),
        setAudioTrack: (id) => player.setCurrentTrack(audioList()[id]),
        textTracks: () => (player.getTracksFor('text') || []).map((t, i) => ({ id: i, label: trackLabel(t, i) })),
        getTextTrack: () => (player.isTextEnabled() ? player.getCurrentTextTrackIndex() : -1),
        setTextTrack: (id) => {
          player.enableText(id >= 0);
          player.setTextTrack(id);
        },
        bandwidth: () => {
          const kbps = player.getAverageThroughput?.('video');
          return kbps ? kbps * 1000 : null;
        },
      });
    },

    flv: (url, video, hooks) => mpegtsEngine('flv', url, video, hooks),
    ts: (url, video, hooks) => mpegtsEngine('mpegts', url, video, hooks),
  };

  async function mpegtsEngine(type, url, video, hooks) {
    const mpegts = await loadLibrary('mpegts');
    if (!mpegts.getFeatureList().mseLivePlayback) throw new Error('This browser can’t play FLV or MPEG-TS streams.');

    const player = mpegts.createPlayer(
      { type, url, isLive: type === 'flv' },
      { enableWorker: true, liveBufferLatencyChasing: true },
    );
    player.on(mpegts.Events.ERROR, (kind, detail) => {
      hooks.onFatal(kind === mpegts.ErrorTypes.NETWORK_ERROR ? UNREACHABLE : `The stream couldn’t be decoded (${detail}).`);
    });
    player.attachMediaElement(video);
    player.load();
    return withDefaults({
      name: 'mpegts.js',
      destroy() {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch { /* already torn down */ }
      },
    });
  }

  function waitUntilReady(video, timeoutMs) {
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error', onError);
        callback(value);
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(reject, new Error(mediaErrorMessage(video.error)));
      const timer = setTimeout(() => finish(reject, new Error('The stream took too long to respond.')), timeoutMs);
      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('error', onError);
    });
  }

  // ---------- Endpoint (rich links) ----------

  const asText = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '');
  const asList = (value) => (Array.isArray(value) ? value : []);
  const channelName = (value) => asText(value && typeof value === 'object' ? value.name : value, 80);

  function safeUrl(value, base) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), base);
      return BROWSER_PROTOCOLS.has(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Same-site targets stay relative so links keep working if the site moves to another host.
  function playerHref(key, target) {
    const url = new URL(target);
    const root = new URL(document.baseURI);
    const value = url.origin === root.origin && url.pathname.startsWith(root.pathname)
      ? url.pathname.slice(root.pathname.length) + url.search
      : url.href;
    return `player/?${key}=${encodeURIComponent(value)}`;
  }

  function relatedItem(item, base) {
    if (!item || typeof item !== 'object') return null;
    const page = safeUrl(item.href || item.link, base);
    const endpoint = safeUrl(item.endpoint, base);
    const stream = safeUrl(item.url, base);
    const title = asText(item.title, 200);
    if (!title || !(page || endpoint || stream)) return null;
    return {
      title,
      // `href` is a page to open as-is (e.g. the video's own site); the others play here.
      href: page || (endpoint ? playerHref('endpoint', endpoint) : playerHref('url', stream)),
      poster: safeUrl(item.poster || item.thumbnail, base),
      duration: typeof item.duration === 'number' ? formatTime(item.duration) : asText(item.duration, 12),
      live: Boolean(item.live),
      channel: channelName(item.channel),
    };
  }

  // Accepts the documented shape, a bare { url }, or the same object wrapped in { data: … }.
  function normalizeMeta(raw, base) {
    const outer = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const m = outer.source || outer.sources || outer.url || !outer.data || typeof outer.data !== 'object' ? outer : outer.data;
    const sources = [].concat(m.sources ?? m.source ?? (m.url ? { url: m.url, type: m.type } : []))
      .map((s) => (typeof s === 'string' ? { url: s } : s || {}))
      .map((s) => ({
        url: safeUrl(s.url, base),
        raw: asText(s.url, 2000),
        type: ENGINE_TYPES.includes(s.type) ? s.type : '',
      }));

    return {
      title: asText(m.title, 200),
      description: asText(m.description, DESCRIPTION_LIMIT),
      poster: safeUrl(m.poster || m.thumbnail, base),
      channel: channelName(m.channel),
      publishedAt: validDate(m.publishedAt),
      startsAt: validDate(m.startsAt),
      tags: asList(m.tags).map((t) => asText(t, 40)).filter(Boolean).slice(0, 12),
      sources: sources.filter((s) => s.url),
      rejected: sources.filter((s) => !s.url).map((s) => s.raw),
      embed: safeUrl(m.embed, base),
      external: safeUrl(m.external?.url ?? m.external, base),
      subtitles: asList(m.subtitles)
        .map((t) => ({
          url: safeUrl(t?.url, base),
          label: asText(t?.label, 60) || asText(t?.lang, 20) || 'Subtitles',
          lang: asText(t?.lang, 20),
          isDefault: Boolean(t?.default),
        }))
        .filter((t) => t.url)
        .slice(0, 20),
      chapters: asList(m.chapters)
        .map((c) => ({ time: Number(c?.time ?? c?.t ?? c?.start), title: asText(c?.title, 120) }))
        .filter((c) => Number.isFinite(c.time) && c.time >= 0 && c.title)
        .sort((a, b) => a.time - b.time)
        .slice(0, 100),
      related: asList(m.related).map((r) => relatedItem(r, base)).filter(Boolean).slice(0, MAX_RELATED),
    };
  }

  function endpointAllowed(url, config) {
    const allowed = asList(config.allowedEndpoints);
    if (!allowed.length) return true;
    return allowed.includes(url.origin) || (allowed.includes('self') && url.origin === location.origin);
  }

  async function fetchMeta(endpoint) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(endpoint, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: controller.signal });
    } catch (error) {
      throw new Error(error.name === 'AbortError'
        ? 'The endpoint took too long to respond.'
        : 'The endpoint couldn’t be reached. It may be offline, or it may not allow requests from this site (CORS).');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`The endpoint returned an error (HTTP ${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new Error('The endpoint didn’t return valid JSON.');
    }
  }

  function toWebVtt(text) {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (clean.trimStart().startsWith('WEBVTT')) return clean;
    return `WEBVTT\n\n${clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
  }

  // ---------- Templates ----------

  const inline = (text, esc) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
  const sampleHref = (sample) => (sample.endpoint
    ? `player/?endpoint=${encodeURIComponent(sample.endpoint)}`
    : `player/?url=${encodeURIComponent(sample.url)}`);
  const sampleHost = (sample) => (sample.endpoint ? 'Rich link · endpoint' : new URL(sample.url).hostname);

  function urlForm(config, esc, id) {
    return `
      <form class="url-form" action="player/" method="get">
        <label class="visually-hidden" for="${id}">Stream address</label>
        <input id="${id}" type="url" name="url" placeholder="${esc(config.placeholder)}"
          required autocomplete="off" spellcheck="false" inputmode="url">
        <button class="btn btn--solid" type="submit">Play</button>
      </form>`;
  }

  const sampleLinks = (config, esc) =>
    config.samples.map((sample) => `<a href="${sampleHref(sample)}">${esc(sample.label)}</a>`).join('');

  const shortcutKeys = (keys, esc) => keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' ');

  function formatsTable(config, esc) {
    return `
      <div class="table-scroll">
        <table class="format-table">
          <thead><tr><th scope="col">Format</th><th scope="col">Link ends in</th><th scope="col">Played by</th><th scope="col">Live</th></tr></thead>
          <tbody>
            ${config.formats.map((f) => `
              <tr><td>${esc(f.name)}</td><td><code>${esc(f.example)}</code></td><td>${esc(f.engine)}</td><td>${esc(f.live)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function guideBlock(block, config, esc) {
    if (typeof block === 'string') return `<p>${inline(block, esc)}</p>`;
    if (block.h) return `<h2>${esc(block.h)}</h2>`;
    if (block.code) return `<pre><code>${esc(block.code)}</code></pre>`;
    if (block.formats) return formatsTable(config, esc);
    if (block.list) {
      return `
        <ul class="guide-list">
          ${block.list.map((item) => `<li><strong>${esc(item.title)}</strong>${inline(item.text, esc)}</li>`).join('')}
        </ul>`;
    }
    return '';
  }

  function guideSidebar(config, esc) {
    return `
      <aside class="sidebar">
        <section aria-labelledby="samples-title">
          <h2 class="block-title" id="samples-title">Sample streams</h2>
          <ul class="block__list sample-list">
            ${config.samples.map((s) => `
              <li><a class="hl" href="${sampleHref(s)}">${esc(s.label)}</a><time>${esc(sampleHost(s))}</time></li>`).join('')}
          </ul>
        </section>
        <section aria-labelledby="shortcuts-title">
          <h2 class="block-title" id="shortcuts-title">Keyboard shortcuts</h2>
          <ul class="shortcuts">
            ${config.shortcuts.map((s) => `<li><span>${esc(s.action)}</span><span>${shortcutKeys(s.keys, esc)}</span></li>`).join('')}
          </ul>
        </section>
      </aside>`;
  }

  function startView(config, esc, notice = '') {
    return `
      <section class="player-hero">
        <div class="player-frame player-frame--empty">
          <div class="player-start">
            <span class="kicker">Video player</span>
            <h1>${esc(config.title)}</h1>
            <p>${esc(config.intro)}</p>
            ${notice ? `<p class="player-notice" role="alert">${esc(notice)}</p>` : ''}
            ${urlForm(config, esc, 'stream-url')}
            <div class="samples"><span>Try a sample:</span>${sampleLinks(config, esc)}</div>
          </div>
        </div>
      </section>
      <div class="layout player-guide">
        <article class="story">
          <h2 class="page-title">How it works</h2>
          <div class="story__body">${config.guide.map((block) => guideBlock(block, config, esc)).join('')}</div>
        </article>
        ${guideSidebar(config, esc)}
      </div>`;
  }

  const linkify = (html) => html.replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (href) => `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${href}</a>`,
  );

  function descriptionView(meta, esc) {
    if (!meta.description) return '';
    const paragraphs = meta.description
      .split(/\n{2,}/)
      .map((p) => `<p>${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`)
      .join('');
    return `
      <div class="watch-description">
        <div class="watch-description__text" data-description-text>${paragraphs}</div>
        <button class="watch-description__toggle" type="button" data-description-toggle hidden>Show more</button>
      </div>`;
  }

  function chaptersView(meta, esc) {
    if (!meta.chapters.length) return '';
    return `
      <section class="watch-chapters" aria-labelledby="chapters-title">
        <h2 class="block-title" id="chapters-title">Chapters</h2>
        <ol class="chapter-list">
          ${meta.chapters.map((c, i) => `
            <li>
              <button type="button" data-seek="${c.time}" data-chapter-index="${i}">
                <span class="chapter-list__time">${formatTime(c.time)}</span><span>${esc(c.title)}</span>
              </button>
            </li>`).join('')}
        </ol>
      </section>`;
  }

  function relatedView(meta, esc) {
    if (!meta.related.length) return '';
    return `
      <aside class="sidebar watch-sidebar">
        <section aria-labelledby="upnext-title">
          <h2 class="block-title" id="upnext-title">Up next</h2>
          <ul class="upnext-list">
            ${meta.related.map((r) => `
              <li>
                <a class="upnext-item" href="${esc(r.href)}">
                  <span class="upnext-item__thumb">
                    ${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" decoding="async">` : icons.play}
                    ${r.live ? '<span class="upnext-item__badge is-live">Live</span>' : r.duration ? `<span class="upnext-item__badge">${esc(r.duration)}</span>` : ''}
                  </span>
                  <span>
                    <span class="upnext-item__title hl">${esc(r.title)}</span>
                    ${r.channel ? `<span class="upnext-item__channel">${esc(r.channel)}</span>` : ''}
                  </span>
                </a>
              </li>`).join('')}
          </ul>
        </section>
      </aside>`;
  }

  function formatCountdown(ms) {
    const total = Math.ceil(ms / 1000);
    const days = Math.floor(total / 86400);
    const clock = [Math.floor((total % 86400) / 3600), Math.floor((total % 3600) / 60), total % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    return days ? `${days}d ${clock}` : clock;
  }

  const countdownView = (meta, esc, title) => `
    <div class="vp-countdown" data-countdown>
      ${meta.poster ? `<img src="${esc(meta.poster)}" alt="">` : ''}
      <div class="vp-countdown__body">
        <span class="vp-countdown__label">Starts in</span>
        <div class="vp-countdown__time" data-countdown-time>--:--:--</div>
        <p class="vp-countdown__title">${esc(title)}</p>
        <p class="vp-countdown__date">${esc(eventFormat.format(meta.startsAt))}</p>
      </div>
    </div>`;

  function playView(config, esc, meta, title) {
    const button = (action, label, icon, extra = '') =>
      `<button class="vp-btn" type="button" data-action="${action}" aria-label="${label}" title="${label}"${extra}>${icon}</button>`;
    const first = new URL(meta.sources[0].url);
    const startsLater = Boolean(meta.startsAt && meta.startsAt > Date.now());

    return `
      <section class="player-hero">
        <div class="player-frame vp vp--paused" data-player tabindex="-1">
          <video playsinline preload="auto"${meta.poster ? ` poster="${esc(meta.poster)}"` : ''}></video>

          <div class="vp-buffering" data-buffering hidden><span class="spinner"></span></div>
          <button class="vp-bigplay" type="button" data-action="toggle-play" data-bigplay aria-label="Play" hidden>${icons.play}</button>
          <div class="vp-osd" data-osd aria-live="polite"></div>
          <div class="vp-toast" data-toast hidden></div>
          <button class="unmute" type="button" data-action="unmute" hidden>${icons.volumeMuted}Tap to unmute</button>
          <div class="vp-stats" data-stats hidden></div>
          <div class="vp-upnext" data-upnext hidden></div>

          <div class="vp-help" data-help hidden>
            <div class="vp-help__card" role="dialog" aria-label="Keyboard shortcuts">
              <div class="vp-help__head">
                <h2>Keyboard shortcuts</h2>
                <button class="vp-btn" type="button" data-action="help" aria-label="Close">${icons.close}</button>
              </div>
              <ul>${config.shortcuts.map((s) => `<li><span>${esc(s.action)}</span><span>${shortcutKeys(s.keys, esc)}</span></li>`).join('')}</ul>
            </div>
          </div>

          <div class="vp-settings" data-settings role="menu" aria-label="Settings" hidden></div>

          <div class="vp-controls" data-controls>
            <div class="vp-progress" data-progress role="slider" tabindex="0" aria-label="Seek"
              aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
              <div class="vp-track">
                <div class="vp-buffered" data-buffered></div>
                <div class="vp-hover" data-hover-bar></div>
                <div class="vp-played" data-played></div>
                <div class="vp-markers" data-markers></div>
              </div>
              <div class="vp-thumb" data-thumb></div>
              <div class="vp-tooltip" data-tooltip>0:00</div>
            </div>
            <div class="vp-bar">
              <div class="vp-group">
                <button class="vp-btn" type="button" data-action="toggle-play" aria-label="Play (k)" title="Play (k)">
                  <span class="icon-play">${icons.play}</span><span class="icon-pause">${icons.pause}</span><span class="icon-replay">${icons.replay}</span>
                </button>
                ${button('back', 'Back 10 seconds (j)', icons.back, ' data-seek-btn')}
                ${button('forward', 'Forward 10 seconds (l)', icons.forward, ' data-seek-btn')}
                <div class="vp-volume">
                  ${button('mute', 'Mute (m)', icons.volumeHigh)}
                  <input class="vp-volume__slider" data-volume type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
                </div>
                <span class="vp-time" data-time>0:00 / 0:00</span>
                <button class="vp-live" type="button" data-action="go-live" title="Jump to live">Live</button>
                <span class="vp-chapter" data-chapter></span>
              </div>
              <div class="vp-group">
                ${button('captions', 'Subtitles (c)', icons.captions, ' aria-pressed="false" hidden')}
                <button class="vp-btn" type="button" data-action="settings" aria-label="Settings" title="Settings" aria-haspopup="menu" aria-expanded="false">
                  ${icons.settings}<span class="vp-badge" data-quality-badge></span>
                </button>
                ${button('pip', 'Picture-in-picture (i)', icons.pip, ' hidden')}
                ${button('fullscreen', 'Fullscreen (f)', icons.fullscreen)}
              </div>
            </div>
          </div>

          ${startsLater ? countdownView(meta, esc, title) : ''}

          <div class="player-status" data-status role="status"${startsLater ? ' hidden' : ''}>
            <div><span class="spinner" aria-hidden="true"></span><p>Connecting to stream…</p></div>
          </div>
        </div>
      </section>

      <div class="layout watch-layout${meta.related.length ? '' : ' watch-layout--single'}">
        <div class="watch-main">
          <div class="player-info">
            <div>
              <div class="player-tags">
                <span class="live-badge" data-live hidden>Live</span>
                <span class="format-tag" data-format>${esc(detectFormat(first).label)}</span>
              </div>
              <h1 class="player-title">${esc(title)}</h1>
              <p class="player-meta">
                ${meta.channel ? `<strong>${esc(meta.channel)}</strong>` : ''}
                ${meta.publishedAt ? `<span>${esc(dateFormat.format(meta.publishedAt))}</span>` : ''}
                <span title="${esc(first.href)}">${esc(first.hostname)}</span>
                <span data-engine hidden></span>
                <span data-resolution hidden></span>
                <span data-duration hidden></span>
              </p>
            </div>
            <div class="player-actions">
              <button class="btn" type="button" data-copy-link>Copy link</button>
              <a class="btn" href="player/">New stream</a>
            </div>
          </div>
          ${descriptionView(meta, esc)}
          ${meta.tags.length ? `<div class="watch-tags">${meta.tags.map((tag) => `<a class="pill" href="section.html?q=${encodeURIComponent(tag)}">${esc(tag)}</a>`).join('')}</div>` : ''}
          ${chaptersView(meta, esc)}
          <p class="player-note">${inline(config.playNote, esc)}</p>
        </div>
        ${relatedView(meta, esc)}
      </div>`;
  }

  function bindDescription(main) {
    const text = main.querySelector('[data-description-text]');
    const toggle = main.querySelector('[data-description-toggle]');
    if (!text || !toggle) return;
    toggle.hidden = text.scrollHeight <= text.clientHeight + 4;
    toggle.addEventListener('click', () => {
      const expanded = text.classList.toggle('is-expanded');
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
  }

  // Shown when the stream's host won't let this site play it: the endpoint's `external` link
  // (a Telegram Mini App) opens it in the browser instead.
  function externalStep(meta, esc) {
    return `
      <div class="player-error player-external">
        <span class="kicker">One more step</span>
        <h2>This video plays in your browser</h2>
        <p>Its host doesn’t allow it to play inside this page. Open it through our Telegram app, watch a short ad, and the video opens in your browser.</p>
        <ol class="player-external__steps">
          <li>Open in Telegram</li>
          <li>Watch a short ad</li>
          <li>The video opens</li>
        </ol>
        <div class="actions">
          <a class="btn btn--solid" href="${esc(meta.external)}" target="_blank" rel="noopener">Open in Telegram</a>
        </div>
      </div>`;
  }

  function externalPageView(config, esc, meta, title) {
    return `
      <section class="player-hero">
        <div class="player-frame player-frame--external">
          ${meta.poster ? `<img class="player-frame__poster" src="${esc(meta.poster)}" alt="">` : ''}
          <div class="player-status">${externalStep(meta, esc)}</div>
        </div>
      </section>
      <div class="layout watch-layout${meta.related.length ? '' : ' watch-layout--single'}">
        <div class="watch-main">
          <div class="player-info">
            <div>
              <h1 class="player-title">${esc(title)}</h1>
              <p class="player-meta">
                ${meta.channel ? `<strong>${esc(meta.channel)}</strong>` : ''}
                ${meta.publishedAt ? `<span>${esc(dateFormat.format(meta.publishedAt))}</span>` : ''}
              </p>
            </div>
          </div>
          ${descriptionView(meta, esc)}
        </div>
        ${relatedView(meta, esc)}
      </div>`;
  }

  // A page shown in an iframe (an embed player) inside the same frame, info and Up next as a stream.
  function embedView(config, esc, meta, title) {
    const page = new URL(meta.embed);
    const startsLater = Boolean(meta.startsAt && meta.startsAt > Date.now());
    const src = ` ${startsLater ? 'data-src' : 'src'}="${esc(page.href)}"`;
    return `
      <section class="player-hero">
        <div class="player-frame player-frame--embed">
          <iframe${src} title="${esc(title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>
          ${startsLater ? countdownView(meta, esc, title) : ''}
        </div>
      </section>
      <div class="layout watch-layout${meta.related.length ? '' : ' watch-layout--single'}">
        <div class="watch-main">
          <div class="player-info">
            <div>
              <div class="player-tags">
                <span class="format-tag">Embed</span>
              </div>
              <h1 class="player-title">${esc(title)}</h1>
              <p class="player-meta">
                ${meta.channel ? `<strong>${esc(meta.channel)}</strong>` : ''}
                ${meta.publishedAt ? `<span>${esc(dateFormat.format(meta.publishedAt))}</span>` : ''}
                <span title="${esc(page.href)}">${esc(page.hostname)}</span>
              </p>
            </div>
            <div class="player-actions">
              <button class="btn" type="button" data-copy-link>Copy link</button>
              <a class="btn" href="player/">New stream</a>
            </div>
          </div>
          ${descriptionView(meta, esc)}
          ${meta.tags.length ? `<div class="watch-tags">${meta.tags.map((tag) => `<a class="pill" href="section.html?q=${encodeURIComponent(tag)}">${esc(tag)}</a>`).join('')}</div>` : ''}
          <p class="player-note">${inline(config.playNote, esc)}</p>
        </div>
        ${relatedView(meta, esc)}
      </div>`;
  }

  function mountEmbed(main, { request, meta }) {
    bindDescription(main);

    main.querySelector('[data-copy-link]')?.addEventListener('click', async (event) => {
      const link = new URL('player/', document.baseURI);
      link.search = `?${new URLSearchParams(request.endpoint ? { endpoint: request.endpoint } : { type: 'iframe', url: request.url })}`;
      try {
        await navigator.clipboard.writeText(link.href);
        event.currentTarget.textContent = 'Link copied';
      } catch {
        window.prompt('Copy this link:', link.href);
      }
    });

    const countdown = main.querySelector('[data-countdown]');
    if (!countdown) return;
    const iframe = main.querySelector('iframe[data-src]');
    const time = countdown.querySelector('[data-countdown-time]');
    const tick = () => {
      const remaining = meta.startsAt - Date.now();
      if (remaining > 0) {
        time.textContent = formatCountdown(remaining);
        return;
      }
      clearInterval(timer);
      countdown.remove();
      iframe.src = iframe.dataset.src;
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  // ---------- Player controller ----------

  function mountPlayer(main, { request, meta, esc }) {
    let url = new URL(meta.sources[0].url);
    let format = detectFormat(url);
    const frame = main.querySelector('[data-player]');
    const pick = (selector, root = frame) => root.querySelector(selector);
    const video = pick('video');
    const el = {
      status: pick('[data-status]'),
      buffering: pick('[data-buffering]'),
      bigPlay: pick('[data-bigplay]'),
      osd: pick('[data-osd]'),
      toast: pick('[data-toast]'),
      unmute: pick('[data-action="unmute"]'),
      stats: pick('[data-stats]'),
      help: pick('[data-help]'),
      settings: pick('[data-settings]'),
      progress: pick('[data-progress]'),
      buffered: pick('[data-buffered]'),
      played: pick('[data-played]'),
      hoverBar: pick('[data-hover-bar]'),
      thumb: pick('[data-thumb]'),
      tooltip: pick('[data-tooltip]'),
      playButton: pick('.vp-bar [data-action="toggle-play"]'),
      muteButton: pick('[data-action="mute"]'),
      volume: pick('[data-volume]'),
      time: pick('[data-time]'),
      liveButton: pick('[data-action="go-live"]'),
      captionsButton: pick('[data-action="captions"]'),
      settingsButton: pick('[data-action="settings"]'),
      qualityBadge: pick('[data-quality-badge]'),
      pipButton: pick('[data-action="pip"]'),
      fullscreenButton: pick('[data-action="fullscreen"]'),
      markers: pick('[data-markers]'),
      chapterLabel: pick('[data-chapter]'),
      countdown: pick('[data-countdown]'),
      countdownTime: pick('[data-countdown-time]'),
      upnext: pick('[data-upnext]'),
      liveTag: pick('[data-live]', main),
      formatTag: pick('[data-format]', main),
      engineInfo: pick('[data-engine]', main),
      resolution: pick('[data-resolution]', main),
      duration: pick('[data-duration]', main),
    };

    const state = {
      session: withDefaults({ name: '' }),
      started: false,
      live: false,
      menu: null,
      scrubbing: false,
      scrubTime: 0,
      statsOn: false,
      lastTextTrack: 0,
      idleTimer: 0,
      osdTimer: 0,
      toastTimer: 0,
      bufferingTimer: 0,
      lastPointerType: 'mouse',
      lastTap: { time: 0, x: 0 },
      lastSavedAt: 0,
      external: [],
      chapterIndex: -2,
      upNextTimer: 0,
    };
    const positionKey = POSITION_KEY + (request.endpoint || url.href);

    const showInfo = (node, text) => {
      node.textContent = text;
      node.hidden = !text;
    };

    // ----- Status & overlays -----

    function showError() {
      el.status.hidden = false;
      if (meta.external) {
        el.status.innerHTML = externalStep(meta, esc);
        return;
      }
      el.status.innerHTML = `
        <div class="player-error">
          <div class="actions">
            <a class="btn btn--solid" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Open video</a>
          </div>
        </div>`;
    }

    function osd(text) {
      el.osd.textContent = text;
      el.osd.classList.add('is-visible');
      clearTimeout(state.osdTimer);
      state.osdTimer = setTimeout(() => el.osd.classList.remove('is-visible'), OSD_MS);
    }

    function toast(html, timeoutMs = 6000) {
      el.toast.innerHTML = html;
      el.toast.hidden = false;
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(() => { el.toast.hidden = true; }, timeoutMs);
    }

    function setBuffering(on) {
      clearTimeout(state.bufferingTimer);
      if (on) state.bufferingTimer = setTimeout(() => { el.buffering.hidden = false; }, BUFFERING_DELAY_MS);
      else el.buffering.hidden = true;
    }

    // ----- Idle / auto-hide -----

    function wake() {
      frame.classList.remove('vp--idle');
      clearTimeout(state.idleTimer);
      if (!video.paused && !state.menu && !state.scrubbing) {
        state.idleTimer = setTimeout(() => frame.classList.add('vp--idle'), IDLE_MS);
      }
    }

    // ----- Time & seeking -----

    function seekRange() {
      if (state.live) {
        const ranges = video.seekable;
        if (!ranges.length) return null;
        const start = ranges.start(0);
        const end = ranges.end(ranges.length - 1);
        return end - start >= MIN_DVR_WINDOW_S ? { start, end } : null;
      }
      return Number.isFinite(video.duration) && video.duration > 0 ? { start: 0, end: video.duration } : null;
    }

    function liveEdge() {
      const edge = state.session.liveEdge();
      if (Number.isFinite(edge) && edge > 0) return edge;
      const ranges = video.seekable;
      return ranges.length ? ranges.end(ranges.length - 1) : video.currentTime;
    }

    const behindLive = () => Math.max(0, liveEdge() - video.currentTime);

    function seekTo(time) {
      const range = seekRange();
      if (!range) return;
      video.currentTime = clamp(time, range.start, Math.max(range.start, range.end - 0.1));
    }

    function seekBy(delta) {
      if (!seekRange()) return;
      seekTo(video.currentTime + delta);
      osd(`${delta > 0 ? '+' : '−'}${Math.abs(delta)} s`);
    }

    function goLive() {
      if (!state.live) return;
      const edge = state.session.liveEdge();
      if (Number.isFinite(edge) && edge > 0) video.currentTime = edge;
      else {
        const ranges = video.seekable;
        if (ranges.length) video.currentTime = Math.max(ranges.start(0), ranges.end(ranges.length - 1) - 4);
      }
      if (video.paused) video.play().catch(() => {});
      osd('Live');
    }

    function bufferedAhead() {
      const { buffered, currentTime } = video;
      for (let i = 0; i < buffered.length; i += 1) {
        if (buffered.start(i) <= currentTime + 0.5 && buffered.end(i) >= currentTime) return buffered.end(i) - currentTime;
      }
      return 0;
    }

    const fractionFromPointer = (event) => {
      const rect = el.progress.getBoundingClientRect();
      return clamp((event.clientX - rect.left) / rect.width, 0, 1);
    };

    function timeLabel(time, range) {
      if (!state.live) return formatTime(time);
      const behind = range.end - time;
      return behind < LIVE_EDGE_TOLERANCE_S ? 'Live' : `−${formatTime(behind)}`;
    }

    function renderProgress() {
      const range = seekRange();
      frame.classList.toggle('vp--noseek', !range);
      const current = state.scrubbing ? state.scrubTime : video.currentTime;

      if (range) {
        const span = range.end - range.start;
        const pct = clamp((current - range.start) / span, 0, 1) * 100;
        const bufferPct = clamp((video.currentTime + bufferedAhead() - range.start) / span, 0, 1) * 100;
        el.played.style.width = `${pct}%`;
        el.thumb.style.left = `${pct}%`;
        el.buffered.style.width = `${bufferPct}%`;
      } else {
        el.played.style.width = state.live ? '100%' : '0%';
        el.buffered.style.width = '0%';
      }

      if (state.live) {
        const behind = behindLive();
        const atEdge = behind < LIVE_EDGE_TOLERANCE_S;
        el.liveButton.classList.toggle('is-edge', atEdge);
        el.time.textContent = atEdge ? '' : `−${formatTime(behind)}`;
      } else {
        el.time.textContent = `${formatTime(current)} / ${formatTime(video.duration)}`;
      }
      requestAnimationFrame(renderProgress);
    }

    function updateProgressAria() {
      const range = seekRange();
      if (!range) return;
      el.progress.setAttribute('aria-valuemin', String(Math.floor(range.start)));
      el.progress.setAttribute('aria-valuemax', String(Math.floor(range.end)));
      el.progress.setAttribute('aria-valuenow', String(Math.floor(video.currentTime)));
      el.progress.setAttribute('aria-valuetext', state.live ? timeLabel(video.currentTime, range) : `${formatTime(video.currentTime)} of ${formatTime(range.end)}`);
    }

    function bindProgress() {
      const hoverAt = (event) => {
        const range = seekRange();
        if (!range) return;
        const fraction = fractionFromPointer(event);
        const time = range.start + fraction * (range.end - range.start);
        const rect = el.progress.getBoundingClientRect();
        const chapter = state.live ? null : meta.chapters[chapterAt(time)];
        el.tooltip.innerHTML = `${chapter ? `<span class="vp-tooltip__chapter">${esc(chapter.title)}</span>` : ''}${esc(timeLabel(time, range))}`;
        const half = el.tooltip.offsetWidth / 2;
        el.tooltip.style.left = `${clamp(fraction * rect.width, half, rect.width - half)}px`;
        el.hoverBar.style.width = `${fraction * 100}%`;
        return time;
      };

      el.progress.addEventListener('pointerdown', (event) => {
        if (!seekRange() || event.button > 0) return;
        el.progress.setPointerCapture(event.pointerId);
        state.scrubbing = true;
        state.scrubTime = hoverAt(event);
        frame.classList.add('vp--scrubbing');
        wake();
      });
      el.progress.addEventListener('pointermove', (event) => {
        const time = hoverAt(event);
        if (state.scrubbing && time !== undefined) state.scrubTime = time;
      });
      const endScrub = () => {
        if (!state.scrubbing) return;
        state.scrubbing = false;
        frame.classList.remove('vp--scrubbing');
        seekTo(state.scrubTime);
        wake();
      };
      el.progress.addEventListener('pointerup', endScrub);
      el.progress.addEventListener('pointercancel', endScrub);
      el.progress.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.stopPropagation();
          event.preventDefault();
          seekBy(event.key === 'ArrowLeft' ? -SEEK_SMALL_S : SEEK_SMALL_S);
        }
      });
    }

    // ----- Playback -----

    function togglePlay() {
      if (video.ended) video.currentTime = 0;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }

    async function autoplay() {
      try {
        await video.play();
      } catch (error) {
        if (error.name !== 'NotAllowedError') return;
        video.muted = true;
        try {
          await video.play();
          el.unmute.hidden = false;
        } catch {
          el.bigPlay.hidden = false;
        }
      }
    }

    function setSpeed(rate) {
      video.playbackRate = rate;
      osd(`Speed ${speedLabel(rate)}`);
    }

    function stepSpeed(direction) {
      const index = SPEEDS.indexOf(video.playbackRate);
      const next = SPEEDS[clamp((index < 0 ? SPEEDS.indexOf(1) : index) + direction, 0, SPEEDS.length - 1)];
      setSpeed(next);
    }

    function stepFrame(direction) {
      if (!video.paused) video.pause();
      seekTo(video.currentTime + direction * FRAME_S);
    }

    // ----- Volume -----

    function renderVolume() {
      const level = video.muted ? 0 : video.volume;
      el.volume.value = String(level);
      el.muteButton.innerHTML = level === 0 ? icons.volumeMuted : level < 0.5 ? icons.volumeLow : icons.volumeHigh;
      const label = level === 0 ? 'Unmute (m)' : 'Mute (m)';
      el.muteButton.setAttribute('aria-label', label);
      el.muteButton.title = label;
    }

    function setVolume(value) {
      video.volume = clamp(value, 0, 1);
      video.muted = video.volume === 0;
      osd(video.muted ? 'Muted' : `Volume ${Math.round(video.volume * 100)}%`);
    }

    function toggleMute() {
      if (video.muted && video.volume === 0) video.volume = 0.5;
      video.muted = !video.muted;
      osd(video.muted ? 'Muted' : `Volume ${Math.round(video.volume * 100)}%`);
    }

    function restoreVolume() {
      const saved = storage.get(VOLUME_KEY);
      if (saved && Number.isFinite(saved.volume)) {
        video.volume = clamp(saved.volume, 0, 1);
        video.muted = Boolean(saved.muted);
      }
      renderVolume();
    }

    // ----- Fullscreen & picture-in-picture -----

    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

    function toggleFullscreen() {
      if (fullscreenElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (frame.requestFullscreen) {
        frame.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      } else if (frame.webkitRequestFullscreen) {
        frame.webkitRequestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    }

    function renderFullscreen() {
      const on = Boolean(fullscreenElement());
      frame.classList.toggle('vp--fullscreen', on);
      el.fullscreenButton.innerHTML = on ? icons.exitFullscreen : icons.fullscreen;
      const label = on ? 'Exit fullscreen (f)' : 'Fullscreen (f)';
      el.fullscreenButton.setAttribute('aria-label', label);
      el.fullscreenButton.title = label;
    }

    const pipSupported = () => document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function';

    function togglePip() {
      if (!pipSupported()) return;
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
      else video.requestPictureInPicture().catch(() => osd('Picture-in-picture isn’t available'));
    }

    // ----- Tracks: quality, audio, subtitles -----

    const subs = {
      own: () => state.session.textTracks(),
      list: () => [...subs.own(), ...state.external.map((t, i) => ({ id: subs.own().length + i, label: t.label }))],
      get: () => {
        const own = state.session.getTextTrack();
        if (own >= 0) return own;
        const external = state.external.findIndex((t) => t.track.mode === 'showing');
        return external >= 0 ? subs.own().length + external : -1;
      },
      set: (id) => {
        const offset = subs.own().length;
        state.session.setTextTrack(id >= 0 && id < offset ? id : -1);
        state.external.forEach((t, i) => { t.track.mode = offset + i === id ? 'showing' : 'disabled'; });
      },
    };

    async function loadExternalSubtitles() {
      const loaded = await Promise.all(meta.subtitles.map(async (sub) => {
        try {
          const response = await fetch(sub.url, { credentials: 'omit' });
          if (!response.ok) return null;
          const vtt = toWebVtt(await response.text());
          const element = document.createElement('track');
          element.kind = 'subtitles';
          element.label = sub.label;
          if (sub.lang) element.srclang = sub.lang;
          element.src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
          video.appendChild(element);
          externalTextTracks.add(element.track);
          element.track.mode = 'disabled';
          return { label: sub.label, track: element.track, isDefault: sub.isDefault };
        } catch {
          return null;
        }
      }));
      state.external = loaded.filter(Boolean);
      const preferred = state.external.findIndex((t) => t.isDefault);
      if (preferred >= 0) {
        subs.set(subs.own().length + preferred);
        state.lastTextTrack = subs.own().length + preferred;
      }
      renderTracks();
    }

    // ----- Chapters -----

    function chapterAt(time) {
      let current = -1;
      meta.chapters.forEach((chapter, index) => { if (chapter.time <= time) current = index; });
      return current;
    }

    function renderChapterMarkers() {
      const range = seekRange();
      if (!range || state.live || !meta.chapters.length) {
        el.markers.innerHTML = '';
        return;
      }
      const span = range.end - range.start;
      el.markers.innerHTML = meta.chapters
        .filter((c) => c.time > range.start && c.time < range.end)
        .map((c) => `<span class="vp-marker" style="left:${((c.time - range.start) / span) * 100}%"></span>`)
        .join('');
    }

    function updateChapter() {
      if (!meta.chapters.length || state.live) return;
      const index = chapterAt(video.currentTime);
      if (index === state.chapterIndex) return;
      state.chapterIndex = index;
      el.chapterLabel.textContent = index >= 0 ? meta.chapters[index].title : '';
      main.querySelectorAll('[data-chapter-index]').forEach((item) => {
        if (Number(item.dataset.chapterIndex) === index) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
    }

    // ----- Up next & scheduled start -----

    function cancelUpNext() {
      clearInterval(state.upNextTimer);
      state.upNextTimer = 0;
      el.upnext.hidden = true;
    }

    function showUpNext() {
      const next = meta.related[0];
      if (!next) return;
      let remaining = UP_NEXT_S;
      el.upnext.innerHTML = `
        <div class="vp-upnext__card">
          <span class="vp-upnext__label">Up next in <span data-upnext-count>${remaining}</span></span>
          <a class="vp-upnext__item" href="${esc(next.href)}">
            ${next.poster ? `<img src="${esc(next.poster)}" alt="">` : ''}
            <strong>${esc(next.title)}</strong>
          </a>
          <div class="vp-upnext__actions">
            <a class="btn btn--solid" href="${esc(next.href)}">Play now</a>
            <button class="btn" type="button" data-action="cancel-upnext">Cancel</button>
          </div>
        </div>`;
      el.upnext.hidden = false;
      el.bigPlay.hidden = true;
      const counter = pick('[data-upnext-count]', el.upnext);
      state.upNextTimer = setInterval(() => {
        remaining -= 1;
        counter.textContent = String(remaining);
        if (remaining > 0) return;
        cancelUpNext();
        location.href = new URL(next.href, document.baseURI).href;
      }, 1000);
    }

    function startWhenScheduled() {
      if (!el.countdown) {
        start();
        return;
      }
      frame.classList.add('vp--waiting');
      let timer = 0;
      const tick = () => {
        const remaining = meta.startsAt - Date.now();
        if (remaining > 0) {
          el.countdownTime.textContent = formatCountdown(remaining);
          return;
        }
        clearInterval(timer);
        el.countdown.remove();
        frame.classList.remove('vp--waiting');
        el.status.hidden = false;
        start();
      };
      timer = setInterval(tick, 1000);
      tick();
    }

    function setupDescription() {
      bindDescription(main);
    }

    function uniqueQualities() {
      const seen = new Set();
      return state.session.qualities()
        .filter(Boolean)
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0))
        .filter((level) => !seen.has(level.label) && seen.add(level.label));
    }

    function currentQualityText() {
      const active = state.session.activeQuality();
      if (state.session.getQuality() < 0) return active ? `Auto (${active.label})` : 'Auto';
      return active?.label || 'Auto';
    }

    function setQuality(id) {
      state.session.setQuality(id);
      const level = state.session.qualities().find((q) => q?.id === id);
      osd(id < 0 ? 'Quality: Auto' : `Quality: ${level?.label || id}`);
    }

    function setTextTrack(id) {
      subs.set(id);
      if (id >= 0) state.lastTextTrack = id;
      const track = subs.list()[id];
      osd(id < 0 ? 'Subtitles off' : `Subtitles: ${track?.label || 'on'}`);
      renderTracks();
    }

    function toggleCaptions() {
      const tracks = subs.list();
      if (!tracks.length) return;
      const current = subs.get();
      setTextTrack(current >= 0 ? -1 : (tracks[state.lastTextTrack] ? state.lastTextTrack : 0));
    }

    function setAudioTrack(id) {
      state.session.setAudioTrack(id);
      osd(`Audio: ${state.session.audioTracks()[id]?.label || id + 1}`);
    }

    function renderTracks() {
      const hasText = subs.list().length > 0;
      el.captionsButton.hidden = !hasText;
      el.captionsButton.setAttribute('aria-pressed', String(subs.get() >= 0));
      const height = state.session.activeQuality()?.height || video.videoHeight;
      el.qualityBadge.textContent = qualityTag(height);
      if (state.menu === 'main') renderSettings('main');
    }

    // ----- Settings menu -----

    function settingsItems() {
      const { session } = state;
      const items = [];
      if (uniqueQualities().length > 1) items.push({ key: 'quality', label: 'Quality', value: currentQualityText() });
      items.push({ key: 'speed', label: 'Playback speed', value: speedLabel(video.playbackRate) });
      const audio = session.audioTracks();
      if (audio.length > 1) items.push({ key: 'audio', label: 'Audio', value: audio[session.getAudioTrack()]?.label || '' });
      const text = subs.list();
      if (text.length) items.push({ key: 'subtitles', label: 'Subtitles', value: text[subs.get()]?.label || 'Off' });
      if (!state.live && seekRange()) items.push({ key: 'copy-time', label: 'Copy link at current time', value: '', action: true });
      items.push({ key: 'stats', label: 'Stats for nerds', value: state.statsOn ? 'On' : 'Off', action: true });
      items.push({ key: 'shortcuts', label: 'Keyboard shortcuts', value: '', action: true });
      return items;
    }

    function settingsOptions(panel) {
      const { session } = state;
      if (panel === 'quality') {
        const selected = session.getQuality();
        const active = session.activeQuality();
        return {
          title: 'Quality',
          options: [
            { value: -1, label: active ? `Auto (${active.label})` : 'Auto', selected: selected < 0 },
            ...uniqueQualities().map((q) => ({ value: q.id, label: q.label, tag: qualityTag(q.height), selected: selected === q.id })),
          ],
        };
      }
      if (panel === 'speed') {
        return { title: 'Playback speed', options: SPEEDS.map((s) => ({ value: s, label: speedLabel(s), selected: video.playbackRate === s })) };
      }
      if (panel === 'audio') {
        const current = session.getAudioTrack();
        return { title: 'Audio', options: session.audioTracks().map((t) => ({ value: t.id, label: t.label, selected: t.id === current })) };
      }
      const current = subs.get();
      return {
        title: 'Subtitles',
        options: [
          { value: -1, label: 'Off', selected: current < 0 },
          ...subs.list().map((t) => ({ value: t.id, label: t.label, selected: t.id === current })),
        ],
      };
    }

    function renderSettings(panel) {
      state.menu = panel;
      if (panel === 'main') {
        el.settings.innerHTML = `
          <ul>
            ${settingsItems().map((item) => `
              <li>
                <button class="vp-menu__item" type="button" role="menuitem" data-menu="${item.key}">
                  <span class="vp-menu__label">${esc(item.label)}</span>
                  <span class="vp-menu__value">${esc(item.value)}${item.action ? '' : icons.chevronRight}</span>
                </button>
              </li>`).join('')}
          </ul>`;
      } else {
        const { title, options } = settingsOptions(panel);
        el.settings.innerHTML = `
          <button class="vp-menu__item vp-menu__head" type="button" data-menu="main">${icons.chevronLeft}<span>${esc(title)}</span></button>
          <ul>
            ${options.map((o) => `
              <li>
                <button class="vp-menu__item" type="button" role="menuitemradio" aria-checked="${o.selected}"
                  data-choose="${panel}" data-value="${o.value}">
                  <span class="vp-check">${o.selected ? icons.check : ''}</span>
                  <span class="vp-menu__label">${esc(o.label)}</span>
                  ${o.tag ? `<span class="vp-menu__tag">${esc(o.tag)}</span>` : ''}
                </button>
              </li>`).join('')}
          </ul>`;
      }
      el.settings.hidden = false;
      el.settingsButton.setAttribute('aria-expanded', 'true');
      frame.classList.add('vp--menu');
      wake();
    }

    function closeSettings() {
      if (!state.menu) return;
      state.menu = null;
      el.settings.hidden = true;
      el.settingsButton.setAttribute('aria-expanded', 'false');
      frame.classList.remove('vp--menu');
      wake();
    }

    function onSettingsClick(target) {
      const menu = target.closest('[data-menu]')?.dataset.menu;
      if (menu === 'stats') {
        toggleStats();
        renderSettings('main');
      } else if (menu === 'shortcuts') {
        closeSettings();
        toggleHelp(true);
      } else if (menu === 'copy-time') {
        closeSettings();
        copyTimeLink();
      } else if (menu) {
        renderSettings(menu);
      }

      const choice = target.closest('[data-choose]');
      if (!choice) return;
      const value = Number(choice.dataset.value);
      const actions = { quality: setQuality, speed: setSpeed, audio: setAudioTrack, subtitles: setTextTrack };
      actions[choice.dataset.choose]?.(value);
      closeSettings();
      renderTracks();
    }

    async function copyTimeLink() {
      const link = new URL('player/', document.baseURI);
      const params = new URLSearchParams({ t: String(Math.floor(video.currentTime)) });
      if (request.endpoint) params.set('endpoint', request.endpoint);
      else {
        if (request.type) params.set('type', request.type);
        params.set('url', request.url);
      }
      link.search = `?${params}`;
      try {
        await navigator.clipboard.writeText(link.href);
        osd(`Link copied at ${formatTime(video.currentTime)}`);
      } catch {
        window.prompt('Copy this link:', link.href);
      }
    }

    // ----- Stats & help -----

    function renderStats() {
      if (!state.statsOn) return;
      const { session } = state;
      const active = session.activeQuality();
      const quality = video.getVideoPlaybackQuality?.();
      const bandwidth = session.bandwidth();
      const rows = [
        ['Engine', session.name],
        ['Format', el.formatTag.textContent],
        ['Resolution', video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : 'Audio only'],
        ['Quality', active ? `${active.label} · ${formatBitrate(active.bitrate || 0)}` : '—'],
        ['Connection', bandwidth ? formatBitrate(bandwidth) : '—'],
        ['Buffer', `${bufferedAhead().toFixed(1)} s`],
        ['Dropped frames', quality ? `${quality.droppedVideoFrames} of ${quality.totalVideoFrames}` : '—'],
        ['Speed', `${video.playbackRate}×`],
        ...(state.live ? [['Live latency', `${behindLive().toFixed(1)} s`]] : []),
        ['Viewport', `${frame.clientWidth}×${frame.clientHeight} @${window.devicePixelRatio}x`],
        ['Host', url.hostname],
      ];
      el.stats.innerHTML = `
        <button class="vp-stats__close" type="button" data-action="stats" aria-label="Close stats">${icons.close}</button>
        <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    }

    function toggleStats() {
      state.statsOn = !state.statsOn;
      el.stats.hidden = !state.statsOn;
      renderStats();
    }

    function toggleHelp(force) {
      const show = force ?? el.help.hidden;
      el.help.hidden = !show;
      if (show) pick('button', el.help).focus({ preventScroll: true });
    }

    // ----- Live & media info -----

    function setLive(isLive) {
      state.live = isLive;
      frame.classList.toggle('vp--live', isLive);
      el.liveTag.hidden = !isLive;
      if (isLive) showInfo(el.duration, '');
    }

    function updateMediaInfo() {
      showInfo(el.resolution, video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : 'Audio only');
      frame.classList.toggle('vp--audio', !video.videoWidth);
      if (video.duration === Infinity) setLive(true);
      if (!state.live && Number.isFinite(video.duration)) showInfo(el.duration, formatTime(video.duration));
      el.pipButton.hidden = !pipSupported() || !video.videoWidth;
      renderTracks();
    }

    // ----- Resume -----

    function restorePosition() {
      if (request.start > 0) {
        seekTo(request.start);
        return;
      }
      if (state.live || !(video.duration > RESUME_MIN_DURATION_S)) return;
      const saved = storage.get(positionKey);
      if (Number.isFinite(saved) && saved > 10 && saved < video.duration - RESUME_MARGIN_S) {
        video.currentTime = saved;
        toast(`Resumed at ${formatTime(saved)} <button type="button" data-action="restart">Start over</button>`);
      }
    }

    function savePosition() {
      if (state.live || !(video.duration > RESUME_MIN_DURATION_S)) return;
      const now = Date.now();
      if (now - state.lastSavedAt < 4000) return;
      state.lastSavedAt = now;
      if (video.currentTime > video.duration - RESUME_MARGIN_S) storage.remove(positionKey);
      else storage.set(positionKey, Math.floor(video.currentTime));
    }

    // ----- Start-up -----

    async function start() {
      let lastError = null;

      for (const source of meta.sources) {
        url = new URL(source.url);
        format = detectFormat(url);
        const forced = source.type || request.type;
        const order = forced ? [forced] : format.engine ? [format.engine] : FALLBACK_ORDER;

        for (const engineName of order) {
          video.pause();
          video.removeAttribute('src');
          video.load();

          let failStartup;
          const fatal = new Promise((_, reject) => { failStartup = reject; });
          fatal.catch(() => {});
          const hooks = {
            isStarted: () => state.started,
            onFatal: (message) => (state.started ? showError(message) : failStartup(new Error(message))),
            onLive: setLive,
            onTracks: () => state.started && renderTracks(),
          };

          let attempt = null;
          try {
            attempt = await engines[engineName](url.href, video, hooks);
            await Promise.race([waitUntilReady(video, START_TIMEOUT_MS), fatal]);
            state.session = attempt;
            state.started = true;
            el.status.hidden = true;
            showInfo(el.engineInfo, `Played by ${attempt.name}`);
            el.formatTag.textContent = !format.engine && engineName !== 'native' ? engineName.toUpperCase() : format.label;
            updateMediaInfo();
            renderChapterMarkers();
            restorePosition();
            autoplay();
            loadExternalSubtitles();
            return;
          } catch (error) {
            lastError = error;
            attempt?.destroy();
          }
        }
      }
      showError(lastError?.message);
    }

    // ----- Events -----

    function onSurfaceTap(event) {
      if (state.menu) {
        closeSettings();
        return;
      }
      if (event.pointerType !== 'touch') {
        togglePlay();
        return;
      }
      const now = Date.now();
      const rect = frame.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const isDoubleTap = now - state.lastTap.time < DOUBLE_TAP_MS;
      state.lastTap = { time: now, x };
      if (isDoubleTap && x < 1 / 3) seekBy(-SEEK_LARGE_S);
      else if (isDoubleTap && x > 2 / 3) seekBy(SEEK_LARGE_S);
      else if (frame.classList.contains('vp--idle')) wake();
      else if (!video.paused) frame.classList.add('vp--idle');
    }

    const actions = {
      'toggle-play': togglePlay,
      back: () => seekBy(-SEEK_LARGE_S),
      forward: () => seekBy(SEEK_LARGE_S),
      mute: toggleMute,
      unmute: () => { video.muted = false; },
      'go-live': goLive,
      captions: toggleCaptions,
      settings: () => (state.menu ? closeSettings() : renderSettings('main')),
      pip: togglePip,
      fullscreen: toggleFullscreen,
      stats: toggleStats,
      help: () => toggleHelp(),
      'cancel-upnext': () => {
        cancelUpNext();
        el.bigPlay.hidden = false;
      },
      restart: () => {
        seekTo(0);
        el.toast.hidden = true;
        storage.remove(positionKey);
      },
    };

    frame.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button && frame.contains(button)) {
        actions[button.dataset.action]?.();
        wake();
        return;
      }
      if (event.target.closest('[data-settings]')) onSettingsClick(event.target);
    });

    video.addEventListener('pointerup', (event) => {
      state.lastPointerType = event.pointerType;
      frame.focus({ preventScroll: true });
      onSurfaceTap(event);
    });
    video.addEventListener('dblclick', () => {
      if (state.lastPointerType !== 'touch') toggleFullscreen();
    });
    frame.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') wake(); });
    frame.addEventListener('mouseleave', () => {
      if (!video.paused && !state.menu) frame.classList.add('vp--idle');
    });
    frame.addEventListener('contextmenu', (event) => { if (event.target === video) event.preventDefault(); });
    document.addEventListener('pointerdown', (event) => {
      if (state.menu && !event.target.closest('[data-settings], [data-action="settings"]')) closeSettings();
    });

    el.volume.addEventListener('input', () => {
      video.volume = Number(el.volume.value);
      video.muted = video.volume === 0;
    });

    video.addEventListener('play', () => {
      frame.classList.remove('vp--paused', 'vp--ended');
      el.bigPlay.hidden = true;
      el.playButton.setAttribute('aria-label', 'Pause (k)');
      el.playButton.title = 'Pause (k)';
      wake();
    });
    video.addEventListener('pause', () => {
      frame.classList.add('vp--paused');
      el.bigPlay.hidden = !state.started || state.scrubbing;
      el.playButton.setAttribute('aria-label', 'Play (k)');
      el.playButton.title = 'Play (k)';
      setBuffering(false);
      wake();
    });
    video.addEventListener('ended', () => {
      frame.classList.add('vp--ended');
      el.bigPlay.innerHTML = icons.replay;
      el.bigPlay.setAttribute('aria-label', 'Replay');
      storage.remove(positionKey);
    });
    video.addEventListener('playing', () => {
      setBuffering(false);
      el.bigPlay.innerHTML = icons.play;
      el.bigPlay.setAttribute('aria-label', 'Play');
    });
    video.addEventListener('waiting', () => setBuffering(true));
    video.addEventListener('seeking', () => setBuffering(true));
    video.addEventListener('seeked', () => setBuffering(false));
    video.addEventListener('canplay', () => setBuffering(false));
    video.addEventListener('volumechange', () => {
      renderVolume();
      if (!video.muted) el.unmute.hidden = true;
      storage.set(VOLUME_KEY, { volume: video.volume, muted: video.muted });
    });
    video.addEventListener('ratechange', () => { if (state.menu === 'main') renderSettings('main'); });
    video.addEventListener('timeupdate', () => {
      updateProgressAria();
      savePosition();
      updateChapter();
    });
    video.addEventListener('ended', showUpNext);
    video.addEventListener('play', cancelUpNext);
    main.addEventListener('click', (event) => {
      const chapter = event.target.closest('[data-seek]');
      if (!chapter) return;
      seekTo(Number(chapter.dataset.seek));
      video.play().catch(() => {});
      frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    video.addEventListener('resize', () => { if (state.started) updateMediaInfo(); });
    video.addEventListener('durationchange', () => {
      if (!state.started) return;
      updateMediaInfo();
      renderChapterMarkers();
    });
    video.addEventListener('error', () => { if (state.started) showError(mediaErrorMessage(video.error)); });
    video.addEventListener('enterpictureinpicture', () => el.pipButton.setAttribute('aria-pressed', 'true'));
    video.addEventListener('leavepictureinpicture', () => el.pipButton.setAttribute('aria-pressed', 'false'));
    document.addEventListener('fullscreenchange', renderFullscreen);
    document.addEventListener('webkitfullscreenchange', renderFullscreen);
    window.addEventListener('pagehide', () => {
      state.lastSavedAt = 0;
      savePosition();
      state.session.destroy();
    });
    setInterval(renderStats, 1000);

    bindKeyboard({
      frame, video, togglePlay, seekBy, seekTo, seekRange, goLive, setVolume, toggleMute, toggleFullscreen,
      toggleCaptions, togglePip, stepSpeed, stepFrame, toggleHelp, closeSettings, wake,
      isLive: () => state.live,
      closeOverlays: () => {
        if (state.menu) closeSettings();
        else if (!el.help.hidden) toggleHelp(false);
        else if (state.statsOn) toggleStats();
        else return false;
        return true;
      },
    });

    bindProgress();
    restoreVolume();
    renderFullscreen();
    requestAnimationFrame(renderProgress);
    setupDescription();
    if (meta.description) document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description.slice(0, 160));
    startWhenScheduled();
  }

  function bindKeyboard(p) {
    document.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : document.body;
      if (target.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;

      const { key } = event;
      const onButton = target.closest('button, a');
      const playerFocused = p.frame.contains(document.activeElement) || p.frame === document.fullscreenElement;
      if ((key === ' ' || key === 'Enter') && onButton) return;
      if (target.matches('input[type="range"]') && key.startsWith('Arrow')) return;

      switch (key) {
        case ' ':
        case 'k':
        case 'K':
          p.togglePlay();
          break;
        case 'j':
        case 'J':
          p.seekBy(-SEEK_LARGE_S);
          break;
        case 'l':
        case 'L':
          p.seekBy(SEEK_LARGE_S);
          break;
        case 'ArrowLeft':
          p.seekBy(-SEEK_SMALL_S);
          break;
        case 'ArrowRight':
          p.seekBy(SEEK_SMALL_S);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          if (!playerFocused) return;
          p.setVolume((p.video.muted ? 0 : p.video.volume) + (key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP));
          break;
        case 'm':
        case 'M':
          p.toggleMute();
          break;
        case 'f':
        case 'F':
          p.toggleFullscreen();
          break;
        case 'c':
        case 'C':
          p.toggleCaptions();
          break;
        case 'i':
        case 'I':
          p.togglePip();
          break;
        case '<':
          p.stepSpeed(-1);
          break;
        case '>':
          p.stepSpeed(1);
          break;
        case ',':
          p.stepFrame(-1);
          break;
        case '.':
          p.stepFrame(1);
          break;
        case 'Home': {
          const range = p.seekRange();
          if (!range || !playerFocused) return;
          p.seekTo(range.start);
          break;
        }
        case 'End':
          if (!playerFocused) return;
          if (p.isLive()) p.goLive();
          else {
            const range = p.seekRange();
            if (range) p.seekTo(range.end);
          }
          break;
        case '?':
          p.toggleHelp();
          break;
        case 'Escape':
          if (!p.closeOverlays()) return;
          break;
        default: {
          if (!/^[0-9]$/.test(key) || p.isLive()) return;
          const range = p.seekRange();
          if (!range) return;
          p.seekTo(range.start + (Number(key) / 10) * (range.end - range.start));
        }
      }
      event.preventDefault();
      p.wake();
    });
  }

  // ---------- Page ----------

  async function playerPage(ctx) {
    const { esc, fetchJSON } = ctx.helpers;
    const config = await fetchJSON('data/player.json');
    const request = readRequest(window.LedgerQuery ?? location.search);
    const page = (html, title = 'Player', mount) => ({ active: null, topics: false, title, html, mount });
    const fail = (notice) => page(startView(config, esc, notice));

    if (!request.url && !request.endpoint) return page(startView(config, esc));
    const embedPage = (embedMeta) => {
      const title = embedMeta.title || new URL(embedMeta.embed).hostname;
      return page(embedView(config, esc, embedMeta, title), `${title} · Player`, (main) => mountEmbed(main, { request, meta: embedMeta }));
    };

    let meta;
    if (request.endpoint) {
      let endpoint;
      try {
        endpoint = new URL(request.endpoint, document.baseURI);
      } catch {
        return fail('That endpoint isn’t a valid address.');
      }
      if (!BROWSER_PROTOCOLS.has(endpoint.protocol)) return fail('Endpoints must be http:// or https:// addresses.');
      if (!endpointAllowed(endpoint, config)) return fail(`Endpoints on ${endpoint.hostname} aren’t allowed on this player.`);
      try {
        meta = normalizeMeta(await fetchMeta(endpoint.href), endpoint.href);
      } catch (error) {
        return fail(error.message);
      }
      if (!meta.sources.length && !meta.embed && meta.external) {
        const title = meta.title || 'Video';
        return page(externalPageView(config, esc, meta, title), `${title} · Player`, bindDescription);
      }
      if (!meta.sources.length && meta.embed) return embedPage(meta);
      if (!meta.sources.length) {
        const unplayable = meta.rejected.some((u) => /^(rtmps?|rtsp|udp|rtp|srt|mms):/i.test(u));
        return fail(unplayable
          ? 'The endpoint only lists RTMP/RTSP streams, which can’t play in a web browser.'
          : 'The endpoint’s data doesn’t include a playable source. Add "source": { "url": "…" }.');
      }
    } else {
      const parsed = parseStreamUrl(request.url);
      if (parsed.error) return fail(parsed.error);
      if (request.type === EMBED_TYPE) return embedPage(normalizeMeta({ embed: parsed.url.href }, document.baseURI));
      meta = normalizeMeta({ source: { url: parsed.url.href, type: request.type } }, document.baseURI);
    }

    const title = meta.title || streamTitle(new URL(meta.sources[0].url));
    return page(
      playView(config, esc, meta, title),
      `${title} · Player`,
      (main) => mountPlayer(main, { request, meta, esc }),
    );
  }

  window.LedgerPages = { ...(window.LedgerPages || {}), player: playerPage };
})();
