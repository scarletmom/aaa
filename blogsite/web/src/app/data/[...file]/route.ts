import fs from 'node:fs/promises';
import path from 'node:path';

// Writes every file in src/data/ to out/data/ at build time. The static player (/player/) and the
// Telegram Mini App (/tg/) fetch them at runtime: site.json, articles.json, videos.json, player.json, streams/.
export const dynamic = 'force-static';
export const dynamicParams = false;

const DATA_DIR = path.join(process.cwd(), 'src', 'data');

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
};

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.name.startsWith('.') ? [] : [full];
  }));
  return nested.flat();
}

export async function generateStaticParams() {
  const files = await listFiles(DATA_DIR);
  return files.map((file) => ({ file: path.relative(DATA_DIR, file).split(path.sep) }));
}

export async function GET(_request: Request, { params }: RouteContext<'/data/[...file]'>) {
  const { file } = await params;
  const full = path.join(DATA_DIR, ...file);
  if (!full.startsWith(DATA_DIR + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await fs.readFile(full);
    return new Response(body, {
      headers: { 'Content-Type': CONTENT_TYPES[path.extname(full)] ?? 'application/octet-stream' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
