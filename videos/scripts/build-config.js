#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const OUT_FILE = path.join(ROOT, 'data', 'site.json');

// Hosts like Cloudflare Pages provide these as real env vars, so .env is optional.
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const env = (key) => (process.env[key] || '').trim();

const site = {
  name: env('SITE_NAME'),
  tagline: env('SITE_TAGLINE'),
  apiUrl: env('API_URL'),
  telegram: env('TELEGRAM_URL'),
};

if (!site.apiUrl) {
  console.error('API_URL is not set. Add it to videos/.env (see .env.example).');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(site, null, 2)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT_FILE)} (apiUrl: ${site.apiUrl})`);
