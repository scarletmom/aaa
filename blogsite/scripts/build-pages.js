#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pages.json');

function fail(message) {
  console.error(`build-pages failed: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (err) {
    fail(`${file}: ${err.message}`);
  }
}

const site = readJson('data/site.json');
const articles = readJson('data/articles.json');
const player = readJson('data/player.json');

const q = encodeURIComponent;
const sectionNames = Object.fromEntries(site.sections.map((s) => [s.slug, s.name]));
const byNewest = (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt);

const ids = new Set();
for (const article of articles) {
  if (!article.id) fail(`article without an id: "${article.title}"`);
  if (ids.has(article.id)) fail(`duplicate article id "${article.id}"`);
  if (!sectionNames[article.category]) {
    fail(`article "${article.id}" has unknown category "${article.category}"`);
  }
  ids.add(article.id);
}

// Paths match the links app.js builds, so each slug opens on the live site.
const pages = [
  { slug: '/', title: site.name },
  { slug: '/player/', title: player.title },
  ...site.sections.map((section) => ({ slug: `/section.html?c=${q(section.slug)}`, title: section.name })),
  ...site.topics.map((topic) => ({ slug: `/section.html?tag=${q(topic)}`, title: topic })),
  ...[...articles].sort(byNewest).map((article) => ({ slug: `/article.html?id=${q(article.id)}`, title: article.title })),
];

fs.writeFileSync(OUT, `${JSON.stringify(pages, null, 2)}\n`);
console.log(`wrote pages.json: ${pages.length} pages`);
