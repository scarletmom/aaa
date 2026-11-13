(() => {
  'use strict';

  const DATA_FILES = {
    site: 'data/site.json',
    articles: 'data/articles.json',
    videos: 'data/videos.json',
  };
  const THEME_KEY = 'ledger-theme';
  const PAGE_SIZE = 8;
  let labels = {};
  const t = (key, fallback) => labels[key] ?? fallback;
  const WORDS_PER_MINUTE = 200;

  const icons = {
    search: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    moon: '<svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    sun: '<svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    play: '<svg class="play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>',
    playSolid: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    print: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="7" y="14" width="10" height="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  };

  // ---------- Utilities ----------

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const longDateFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  function timeAgo(iso) {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return dateFormat.format(new Date(iso));
  }

  const timeTag = (iso) =>
    `<time datetime="${esc(iso)}" title="${esc(dateTimeFormat.format(new Date(iso)))}">${esc(timeAgo(iso))}</time>`;

  const blockText = (block) => (typeof block === 'string' ? block : block.h || block.quote || '');
  const bodyText = (article) => article.body.map(blockText).join(' ');

  function readTime(article) {
    const words = bodyText(article).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  }

  const initials = (name) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  const articleUrl = (article) => `article.html?id=${encodeURIComponent(article.id)}`;
  const sectionUrl = (slug) => `section.html?c=${encodeURIComponent(slug)}`;
  const tagUrl = (tag) => `section.html?tag=${encodeURIComponent(tag)}`;
  const searchUrl = (query) => `section.html?q=${encodeURIComponent(query)}`;

  // ---------- Data ----------

  async function fetchJSON(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  }

  async function loadData() {
    const [site, articles, videos] = await Promise.all([
      fetchJSON(DATA_FILES.site),
      fetchJSON(DATA_FILES.articles),
      fetchJSON(DATA_FILES.videos),
    ]);
    const byNewest = (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt);
    articles.sort(byNewest);
    videos.sort(byNewest);
    const sectionNames = Object.fromEntries(site.sections.map((s) => [s.slug, s.name]));
    return { site, articles, videos, sectionNames };
  }

  function searchArticles(articles, sectionNames, query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return articles.filter((article) => {
      const haystack = [
        article.title, article.summary, article.author, sectionNames[article.category],
        article.tags.join(' '), bodyText(article),
      ].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  const mostRead = (articles, limit = 5) => [...articles].sort((a, b) => b.views - a.views).slice(0, limit);

  // ---------- Shared partials ----------

  const media = (article, { eager = false } = {}) => `
    <div class="media">
      <img src="${esc(article.image)}" alt="${esc(article.imageCaption || '')}"
        ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    </div>`;

  const kicker = (ctx, article, asLink = false) => {
    const name = esc(ctx.sectionNames[article.category] || article.category);
    return asLink
      ? `<a class="kicker" href="${sectionUrl(article.category)}">${name}</a>`
      : `<span class="kicker">${name}</span>`;
  };

  const card = (ctx, article, { summary = false } = {}) => `
    <article class="card">
      <a href="${articleUrl(article)}">
        ${media(article)}
        ${kicker(ctx, article)}
        <h3 class="card__title hl">${esc(article.title)}</h3>
      </a>
      ${summary ? `<p class="card__summary">${esc(article.summary)}</p>` : ''}
      <p class="meta">${timeTag(article.publishedAt)}</p>
    </article>`;

  function renderHeader(ctx, active, { topics = true } = {}) {
    const { site } = ctx;
    const nav = [
      { slug: 'home', name: 'Home', href: 'index.html' },
      { slug: 'latest', name: t('latestNav', 'Latest'), href: sectionUrl('latest') },
      ...site.sections.map((s) => ({ slug: s.slug, name: s.name, href: sectionUrl(s.slug) })),
    ];
    const query = ctx.params.get('q') || '';

    return `
      <header class="masthead container">
        <a class="masthead__title" href="index.html">${esc(site.name)}</a>
        <p class="masthead__meta">
          <span>${esc(site.edition)}</span>
          <span>${esc(longDateFormat.format(new Date()))}</span>
          <a href="#">${esc(t('mastheadLink', 'About'))}</a>
        </p>
      </header>
      <nav class="primary-nav" aria-label="Sections">
        <div class="container primary-nav__inner">
          <ul>
            ${nav.map((item) => `
              <li><a href="${item.href}"${item.slug === active ? ' aria-current="page"' : ''}>${esc(item.name)}</a></li>`).join('')}
          </ul>
          <div class="nav-tools">
            <button class="nav-tool" type="button" data-search-toggle
              aria-controls="search-panel" aria-expanded="${query ? 'true' : 'false'}" aria-label="Search">
              ${icons.search}
            </button>
            <button class="nav-tool" type="button" data-theme-toggle>${icons.moon}${icons.sun}</button>
          </div>
        </div>
        <div class="search-panel" id="search-panel"${query ? '' : ' hidden'}>
          <div class="container">
            <form class="search" action="section.html" role="search">
              ${icons.search}
              <label class="visually-hidden" for="site-search">Search</label>
              <input id="site-search" type="search" name="q" value="${esc(query)}"
                placeholder="Search news, topics and authors" autocomplete="off">
              <button class="btn btn--solid" type="submit">Search</button>
            </form>
          </div>
        </div>
      </nav>
      ${topics ? `
        <div class="container">
          <nav class="topics" aria-label="Topics">
            <span class="topics__label">${esc(t('topics', 'Topics'))}</span>
            ${site.topics.map((topic) => `<a href="${tagUrl(topic)}">${esc(topic)}</a>`).join('')}
          </nav>
        </div>` : ''}`;
  }

  function renderFooter(ctx) {
    const { site } = ctx;
    const year = new Date().getFullYear();
    const half = Math.ceil(site.sections.length / 2);
    const sectionList = (items) => items.map((s) => `<li><a href="${sectionUrl(s.slug)}">${esc(s.name)}</a></li>`).join('');
    const linkList = (items) => items.map((label) => `<li><a href="#">${esc(label)}</a></li>`).join('');

    return `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <a class="footer-brand" href="index.html">${esc(site.name)}</a>
              <p class="footer-about">${esc(site.footer.about)}</p>
            </div>
            <div>
              <h2>Sections</h2>
              <ul>${sectionList(site.sections.slice(0, half))}</ul>
            </div>
            <div>
              <h2>More</h2>
              <ul>${sectionList(site.sections.slice(half))}</ul>
            </div>
            <div>
              <h2>Company</h2>
              <ul>${linkList(site.footer.company)}</ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${year} ${esc(site.name)}. All rights reserved.</span>
            <span>${site.footer.help.map((label) => `<a href="#">${esc(label)}</a>`).join(' &nbsp;·&nbsp; ')}</span>
          </div>
        </div>
      </footer>`;
  }

  // ---------- Sidebar widgets ----------

  function videosWidget(ctx) {
    const [feature, ...rest] = ctx.videos;
    if (!feature) return '';
    const href = (video) => {
      const article = ctx.articles.find((a) => a.id === video.articleId);
      return article ? articleUrl(article) : '#';
    };
    return `
      <section aria-labelledby="videos-title">
        <h2 class="block-title" id="videos-title">${esc(t('videos', 'Videos'))}</h2>
        <a class="video-feature" href="${href(feature)}">
          <div class="media">
            <img src="${esc(feature.image)}" alt="" loading="lazy" decoding="async">
            <span class="play-badge">${icons.playSolid}${esc(feature.duration)}</span>
          </div>
          <h3 class="video-feature__title hl">${esc(feature.title)}</h3>
        </a>
        <ul class="video-list">
          ${rest.slice(0, 3).map((video) => `
            <li>
              <a href="${href(video)}">
                <span><span class="hl">${esc(video.title)}</span><span class="duration">${esc(video.duration)}</span></span>
                ${icons.play}
              </a>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  const trendingWidget = (ctx) => `
    <section aria-labelledby="trending-title">
      <h2 class="block-title" id="trending-title">${esc(t('trending', 'Trending'))}</h2>
      <div class="pills">
        ${ctx.site.trending.map((term) => `<a class="pill" href="${searchUrl(term)}">${esc(term)}</a>`).join('')}
      </div>
    </section>`;

  const mostReadWidget = (ctx) => `
    <section aria-labelledby="most-read-title">
      <h2 class="block-title" id="most-read-title">${esc(t('mostRead', 'Most read'))}</h2>
      <ol class="most-read">
        ${mostRead(ctx.articles).map((article) => `
          <li>
            <div>
              ${kicker(ctx, article)}
              <a class="hl" href="${articleUrl(article)}">${esc(article.title)}</a>
            </div>
          </li>`).join('')}
      </ol>
    </section>`;

  const newsletterWidget = () => `
    <section class="newsletter" id="newsletter" aria-labelledby="newsletter-title">
      <h2 id="newsletter-title">${esc(t('newsletterTitle', 'Newsletter'))}</h2>
      <p>${esc(t('newsletterText', ''))}</p>
      <form data-newsletter>
        <label class="visually-hidden" for="newsletter-email">Email address</label>
        <input id="newsletter-email" type="email" name="email" placeholder="you@example.com" required>
        <button class="btn btn--solid" type="submit">Sign up</button>
      </form>
    </section>`;

  const sidebar = (...widgets) => `<aside class="sidebar">${widgets.join('')}</aside>`;

  // ---------- Pages ----------

  function homePage(ctx) {
    const { articles, site } = ctx;
    const lead = articles.find((a) => a.featured) || articles[0];
    const others = articles.filter((a) => a !== lead);
    const [second, ...queue] = others;
    const headlines = queue.slice(0, 8);
    const latest = queue.slice(8, 12);
    const opinions = articles.filter((a) => a.category === 'opinion').slice(0, 3);
    const blockSections = site.sections.filter((s) => s.slug !== 'opinion');

    const sectionBlock = (section) => {
      const items = articles.filter((a) => a.category === section.slug);
      if (!items.length) return '';
      const [first, ...more] = items;
      return `
        <section class="block" aria-labelledby="block-${section.slug}">
          <h2 class="block-title" id="block-${section.slug}">
            <a href="${sectionUrl(section.slug)}">${esc(section.name)} ${icons.chevron}</a>
          </h2>
          <article class="block__lead">
            <a href="${articleUrl(first)}">
              ${media(first)}
              <h3 class="block__lead-title hl">${esc(first.title)}</h3>
            </a>
            <p class="block__summary">${esc(first.summary)}</p>
            <p class="meta">${timeTag(first.publishedAt)}</p>
          </article>
          <ul class="block__list">
            ${more.slice(0, 3).map((a) => `
              <li><a class="hl" href="${articleUrl(a)}">${esc(a.title)}</a>${timeTag(a.publishedAt)}</li>`).join('')}
          </ul>
        </section>`;
    };

    const html = `
      <div class="layout">
        <div>
          <h1 class="page-title">${esc(t('featured', 'Featured'))}</h1>
          <div class="top-grid">
            <div>
              <article class="lead">
                ${kicker(ctx, lead, true)}
                <a href="${articleUrl(lead)}"><h2 class="lead__title hl">${esc(lead.title)}</h2></a>
                <p class="meta">${timeTag(lead.publishedAt)}</p>
                <a href="${articleUrl(lead)}" tabindex="-1" aria-hidden="true">${media(lead, { eager: true })}</a>
                <p class="lead__summary">${esc(lead.summary)}</p>
                <p class="lead__byline">By <strong>${esc(lead.author)}</strong> · ${readTime(lead)} min read</p>
              </article>
              ${second ? `
                <article class="second">
                  ${kicker(ctx, second, true)}
                  <a href="${articleUrl(second)}"><h3 class="second__title hl">${esc(second.title)}</h3></a>
                  <p class="second__summary">${esc(second.summary)}</p>
                  <p class="meta">${timeTag(second.publishedAt)}</p>
                </article>` : ''}
            </div>
            <ul class="headlines">
              ${headlines.map((a) => `
                <li><a class="hl" href="${articleUrl(a)}">${esc(a.title)}</a>${timeTag(a.publishedAt)}</li>`).join('')}
            </ul>
          </div>

          ${latest.length ? `
            <section class="home-latest" aria-labelledby="latest-title">
              <h2 class="block-title" id="latest-title">
                <a href="${sectionUrl('latest')}">${esc(t('latest', 'Latest'))} ${icons.chevron}</a>
              </h2>
              <div class="card-row">${latest.map((a) => card(ctx, a)).join('')}</div>
            </section>` : ''}
        </div>
        ${sidebar(videosWidget(ctx), trendingWidget(ctx), mostReadWidget(ctx), newsletterWidget())}
      </div>

      ${opinions.length ? `
        <section class="opinion-strip" aria-labelledby="opinion-title">
          <h2 class="block-title" id="opinion-title">
            <a href="${sectionUrl('opinion')}">${esc(ctx.sectionNames.opinion || 'Opinion')} ${icons.chevron}</a>
          </h2>
          <div class="opinion-grid">
            ${opinions.map((a) => `
              <article class="opinion">
                <div class="opinion__author">
                  <span class="avatar" aria-hidden="true">${esc(initials(a.author))}</span>
                  <div>
                    <div class="opinion__name">${esc(a.author)}</div>
                    <div class="opinion__role">${esc(a.authorRole)}</div>
                  </div>
                </div>
                <a href="${articleUrl(a)}"><h3 class="opinion__title hl">${esc(a.title)}</h3></a>
                <p class="opinion__summary">${esc(a.summary)}</p>
              </article>`).join('')}
          </div>
        </section>` : ''}

      <div class="sections-grid">${blockSections.map(sectionBlock).join('')}</div>`;

    return { active: 'home', title: '', html };
  }

  function renderBodyBlock(block) {
    if (typeof block === 'string') return `<p>${esc(block)}</p>`;
    if (block.h) return `<h2>${esc(block.h)}</h2>`;
    if (block.quote) {
      return `
        <blockquote class="pullquote">
          <p>${esc(block.quote)}</p>
          ${block.by ? `<cite>${esc(block.by)}</cite>` : ''}
        </blockquote>`;
    }
    return '';
  }

  function articlePage(ctx) {
    const { articles, sectionNames } = ctx;
    const article = articles.find((a) => a.id === ctx.params.get('id'));

    if (!article) {
      return {
        active: null,
        title: t('notFoundTitle', 'Not found'),
        html: `
          <div class="notice">
            <h1>${esc(t('notFoundTitle', 'Not found'))}</h1>
            <p>${esc(t('notFoundText', ''))} <a href="index.html">Return to the home page</a>.</p>
          </div>`,
      };
    }

    const sectionName = sectionNames[article.category] || article.category;
    const sameSection = articles.filter((a) => a.category === article.category && a !== article);
    const fillers = articles.filter((a) => a.category !== article.category && a !== article);
    const related = [...sameSection, ...fillers].slice(0, 4);
    const latestHeadlines = articles.filter((a) => a !== article).slice(0, 5);
    const shareSubject = encodeURIComponent(article.title);
    const shareBody = encodeURIComponent(`${article.title}\n\n${location.href}`);

    const html = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Home</a><span aria-hidden="true">›</span>
        <a href="${sectionUrl(article.category)}">${esc(sectionName)}</a><span aria-hidden="true">›</span>
        <span aria-current="page">${esc(article.title)}</span>
      </nav>
      <div class="layout">
        <article class="story">
          ${kicker(ctx, article, true)}
          <h1 class="story__title">${esc(article.title)}</h1>
          <p class="story__standfirst">${esc(article.summary)}</p>

          <div class="byline">
            <div class="byline__who">
              <span class="avatar" aria-hidden="true">${esc(initials(article.author))}</span>
              <div>
                <div class="byline__name">By <a href="${searchUrl(article.author)}">${esc(article.author)}</a>, ${esc(article.authorRole)}</div>
                <div class="byline__info">
                  <time datetime="${esc(article.publishedAt)}">${esc(dateTimeFormat.format(new Date(article.publishedAt)))}</time>
                  · ${readTime(article)} min read
                </div>
              </div>
            </div>
            <div class="share">
              <button class="icon-btn" type="button" data-copy-link aria-label="Copy link" title="Copy link">${icons.link}</button>
              <a class="icon-btn" href="mailto:?subject=${shareSubject}&body=${shareBody}" aria-label="Share by email" title="Share by email">${icons.mail}</a>
              <button class="icon-btn" type="button" data-print aria-label="Print" title="Print">${icons.print}</button>
            </div>
          </div>

          <figure class="story__figure">
            ${media(article, { eager: true })}
            <figcaption>${esc(article.imageCaption)}<span>${esc(article.imageCredit)}</span></figcaption>
          </figure>

          <div class="story__body">${article.body.map(renderBodyBlock).join('')}</div>

          <div class="tags">
            <span class="tags__label">${esc(t('topics', 'Topics'))}</span>
            ${article.tags.map((tag) => `<a class="pill" href="${tagUrl(tag)}">${esc(tag)}</a>`).join('')}
          </div>
        </article>

        ${sidebar(
          mostReadWidget(ctx),
          `<section aria-labelledby="latest-side-title">
            <h2 class="block-title" id="latest-side-title">Latest</h2>
            <ul class="block__list">
              ${latestHeadlines.map((a) => `
                <li><a class="hl" href="${articleUrl(a)}">${esc(a.title)}</a>${timeTag(a.publishedAt)}</li>`).join('')}
            </ul>
          </section>`,
          newsletterWidget(),
        )}
      </div>

      ${related.length ? `
        <section class="related" aria-labelledby="related-title">
          <h2 class="block-title" id="related-title">
            <a href="${sectionUrl(article.category)}">More from ${esc(sectionName)} ${icons.chevron}</a>
          </h2>
          <div class="card-row">${related.map((a) => card(ctx, a)).join('')}</div>
        </section>` : ''}`;

    return { active: article.category, title: article.title, html };
  }

  function sectionPage(ctx) {
    const { articles, site, sectionNames, params } = ctx;
    const query = (params.get('q') || '').trim();
    const tag = (params.get('tag') || '').trim();
    const slug = params.get('c') || 'latest';

    let list;
    let heading;
    let intro;
    let active = null;

    if (query) {
      list = searchArticles(articles, sectionNames, query);
      heading = `Results for “${query}”`;
      intro = `${list.length} ${list.length === 1 ? 'story' : 'stories'} found.`;
    } else if (tag) {
      list = articles.filter((a) => a.tags.some((t) => t.toLowerCase() === tag.toLowerCase()));
      heading = tag;
      intro = `Coverage tagged “${tag}”.`;
    } else if (slug === 'latest') {
      list = articles;
      heading = t('latest', 'Latest');
      intro = t('latestIntro', '');
      active = 'latest';
    } else {
      const section = site.sections.find((s) => s.slug === slug);
      if (!section) {
        return {
          active: null,
          title: 'Section not found',
          html: `<div class="notice"><h1>That section doesn’t exist</h1><p><a href="index.html">Return to the front page</a>.</p></div>`,
        };
      }
      list = articles.filter((a) => a.category === slug);
      heading = section.name;
      intro = section.description;
      active = slug;
    }

    const [first, ...rest] = list;
    const row = (a, index) => `
      <article class="row"${index >= PAGE_SIZE ? ' hidden' : ''}>
        <div>
          ${kicker(ctx, a, true)}
          <a href="${articleUrl(a)}"><h2 class="row__title hl">${esc(a.title)}</h2></a>
          <p class="row__summary">${esc(a.summary)}</p>
          <p class="meta byline-inline"><span>By <strong>${esc(a.author)}</strong></span>${timeTag(a.publishedAt)}</p>
        </div>
        <a href="${articleUrl(a)}" tabindex="-1" aria-hidden="true">${media(a)}</a>
      </article>`;

    const listHtml = first ? `
      <article class="section-lead">
        <a href="${articleUrl(first)}" tabindex="-1" aria-hidden="true">${media(first, { eager: true })}</a>
        <div>
          ${kicker(ctx, first, true)}
          <a href="${articleUrl(first)}"><h2 class="section-lead__title hl">${esc(first.title)}</h2></a>
          <p class="section-lead__summary">${esc(first.summary)}</p>
          <p class="meta byline-inline"><span>By <strong>${esc(first.author)}</strong></span>${timeTag(first.publishedAt)}</p>
        </div>
      </article>
      <div data-list>${rest.map(row).join('')}</div>
      ${rest.length > PAGE_SIZE ? '<div class="load-more"><button class="btn" type="button" data-load-more>Load more stories</button></div>' : ''}`
      : `<p class="empty">No stories matched. Try a different search, or browse the <a href="${sectionUrl('latest')}">latest news</a>.</p>`;

    const crumb = query ? 'Search' : tag ? t('topics', 'Topics') : heading;
    const html = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Home</a><span aria-hidden="true">›</span>
        <span aria-current="page">${esc(crumb)}</span>
      </nav>
      <div class="layout">
        <div>
          <header class="section-intro">
            <h1>${esc(heading)}</h1>
            <p>${esc(intro)}</p>
          </header>
          ${listHtml}
        </div>
        ${sidebar(trendingWidget(ctx), mostReadWidget(ctx), newsletterWidget())}
      </div>`;

    return { active, title: query ? `Search: ${query}` : heading, html };
  }

  // Extra pages (player.js) register on window.LedgerPages, and page-wide features (link-gate.js) on
  // window.LedgerHooks, before this script runs.
  const PAGES = { index: homePage, article: articlePage, section: sectionPage, ...(window.LedgerPages || {}) };

  // ---------- Behaviour ----------

  function applyThemeLabel() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      button.setAttribute('aria-label', label);
      button.title = label;
    });
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    applyThemeLabel();
  }

  function flashDone(button) {
    const original = button.innerHTML;
    button.innerHTML = icons.check;
    button.classList.add('is-done');
    setTimeout(() => {
      button.innerHTML = original;
      button.classList.remove('is-done');
    }, 1800);
  }

  function bindEvents() {
    applyThemeLabel();

    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-theme-toggle], [data-search-toggle], [data-copy-link], [data-print], [data-load-more]');
      if (!target) return;

      if (target.matches('[data-theme-toggle]')) toggleTheme();

      if (target.matches('[data-search-toggle]')) {
        const panel = document.getElementById('search-panel');
        panel.hidden = !panel.hidden;
        target.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) panel.querySelector('input').focus();
      }
      if (target.matches('[data-print]')) window.print();

      if (target.matches('[data-copy-link]')) {
        try {
          await navigator.clipboard.writeText(location.href);
          flashDone(target);
        } catch {
          window.prompt('Copy this link:', location.href);
        }
      }

      if (target.matches('[data-load-more]')) {
        const hidden = [...document.querySelectorAll('[data-list] > [hidden]')];
        hidden.slice(0, PAGE_SIZE).forEach((el) => { el.hidden = false; });
        if (hidden.length <= PAGE_SIZE) target.parentElement.remove();
      }
    });

    document.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-newsletter]');
      if (!form) return;
      event.preventDefault();
      const message = document.createElement('p');
      message.className = 'newsletter__done';
      message.setAttribute('role', 'status');
      message.textContent = t('newsletterDone', 'Thanks for signing up.');
      form.replaceWith(message);
    });
  }

  function renderLoadError(error) {
    document.getElementById('main').innerHTML = `
      <div class="notice">
        <h1>The news couldn’t be loaded</h1>
        <p>Browsers block reading the <code>data/</code> folder from a file opened directly.</p>
        <p>Start a local server in the project folder, e.g. <code>python3 -m http.server 8000</code>,
          then open <a href="http://localhost:8000">http://localhost:8000</a>.</p>
      </div>`;
    console.error(error);
  }

  async function init() {
    bindEvents();

    let ctx;
    let view;
    try {
      const data = await loadData();
      labels = data.site.labels || {};
      ctx = { ...data, params: new URLSearchParams(window.LedgerQuery ?? location.search), helpers: { esc, fetchJSON } };
      const render = PAGES[document.body.dataset.page] || homePage;
      view = await render(ctx);
    } catch (error) {
      renderLoadError(error);
      return;
    }

    const main = document.getElementById('main');
    document.getElementById('site-header').innerHTML = renderHeader(ctx, view.active, { topics: view.topics !== false });
    main.innerHTML = view.html;
    view.mount?.(main);
    (window.LedgerHooks || []).forEach((hook) => hook(ctx));
    document.getElementById('site-footer').innerHTML = renderFooter(ctx);
    document.title = view.title ? `${view.title} | ${ctx.site.name}` : `${ctx.site.name} — ${ctx.site.tagline}`;
    applyThemeLabel();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
