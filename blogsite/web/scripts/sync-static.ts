// Puts the blogsite's static parts (player, Telegram Mini App, their scripts, ad worker) into public/.
//   dev:   symlinks to the source folders, so edits show on reload
//   build: copies from ../dist, the blogsite's own build with obfuscated JavaScript
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const BLOGSITE = path.resolve(WEB, '..');
const PUBLIC = path.join(WEB, 'public');
const ENTRIES = ['player', 'tg', 'assets', 'sw.js', '_headers', 'test-link.json'];

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'build') {
  console.error('Usage: sync-static.ts dev|build');
  process.exit(1);
}

const source = mode === 'dev' ? BLOGSITE : path.join(BLOGSITE, 'dist');
if (!fs.existsSync(source)) {
  console.error(`${source} is missing. Run \`npm run build\` in the blogsite folder first.`);
  process.exit(1);
}

for (const entry of ENTRIES) {
  const from = path.join(source, entry);
  const to = path.join(PUBLIC, entry);
  fs.rmSync(to, { recursive: true, force: true });
  if (!fs.existsSync(from)) continue;
  if (mode === 'dev') fs.symlinkSync(path.relative(PUBLIC, from), to);
  else fs.cpSync(from, to, { recursive: true });
}
console.log(`public/: ${mode === 'dev' ? 'linked' : 'copied'} ${ENTRIES.join(', ')} from ${path.relative(WEB, source)}`);
