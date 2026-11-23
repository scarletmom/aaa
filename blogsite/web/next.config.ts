import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import site from './src/data/site.json' with { type: 'json' };

export default function nextConfig(phase: string): NextConfig {
  // Without the key no ad-free pass verifies, so every Member Pro would get ads.
  if (phase === PHASE_PRODUCTION_BUILD && !(site as { adFreeKey?: unknown }).adFreeKey) {
    throw new Error('src/data/site.json needs adFreeKey: run `npm run ad-free-key` in server/ with its production env and paste the output.');
  }
  return {
    // Static HTML in out/, deployable to the same static hosts as the old site.
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
    // The blogsite folder has its own package-lock.json; this app's root is web/.
    turbopack: { root: import.meta.dirname },
    agentRules: false,
    // Static hosts open public/player/index.html for /player/ by themselves; the dev server needs telling.
    ...(phase === PHASE_DEVELOPMENT_SERVER && {
      rewrites: async () => [
        { source: '/player/', destination: '/player/index.html' },
        { source: '/tg/', destination: '/tg/index.html' },
      ],
    }),
  };
}
