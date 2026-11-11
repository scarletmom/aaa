#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const EXCLUDE = new Set([
  'dist', 'node_modules', 'scripts', 'package.json', 'package-lock.json', 'README.md', '.DS_Store', '.gitignore', '.env', '.env.example',
]);
const OBFUSCATE_DIR = path.join(ROOT, 'assets', 'js');

// Control-flow flattening and dead-code injection are left off: they slow player.js noticeably at runtime.
const OBFUSCATOR_OPTIONS = {
  compact: true,
  target: 'browser',
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  numbersToExpressions: true,
  simplify: true,
  unicodeEscapeSequence: false,
  sourceMap: false,
};

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (src === OBFUSCATE_DIR && entry.name.endsWith('.js')) obfuscate(from, to);
    else fs.copyFileSync(from, to);
  }
}

function obfuscate(from, to) {
  const source = fs.readFileSync(from, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS);
  fs.writeFileSync(to, result.getObfuscatedCode());
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`  ${path.relative(ROOT, from)}  ${kb(source.length)} -> ${kb(fs.statSync(to).size)}`);
}

fs.rmSync(DIST, { recursive: true, force: true });
console.log('obfuscating assets/js:');
copyTree(ROOT, DIST);
console.log(`wrote ${path.relative(process.cwd(), DIST) || DIST}/`);
