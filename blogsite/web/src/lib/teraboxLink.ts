// Terabox serves the same share links from many mirror domains.
const TERABOX_HOSTS = [
  'terabox.com', 'terabox.app', 'terabox.fun', 'terabox.club', 'teraboxapp.com', 'teraboxlink.com', 'teraboxshare.com',
  '1024tera.com', '1024terabox.com', 'terasharelink.com', 'terafileshare.com', 'freeterabox.com',
  '4funbox.com', '4funbox.co', 'mirrobox.com', 'nephobox.com', 'momerybox.com', 'tibibox.com', 'gibibox.com',
];

export interface TeraboxLink {
  /** The share link as https, ready to send on. */
  url: string;
  /** The share's id: `surl=` in the link, or the part after `/s/1`. */
  shareId: string;
}

export type TeraboxResult = { link: TeraboxLink } | { error: string };

const isTeraboxHost = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return TERABOX_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
};

function shareIdOf(url: URL): string | null {
  const fromQuery = url.searchParams.get('surl');
  if (fromQuery) return fromQuery;
  const fromPath = /^\/s\/1([\w-]+)/.exec(url.pathname)?.[1];
  return fromPath || null;
}

export function parseTeraboxLink(text: string): TeraboxResult {
  const trimmed = text.trim();
  if (!trimmed) return { error: 'Paste a Terabox link first.' };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: 'That doesn’t look like a link. Copy the full share link from Terabox.' };
  }
  if (!isTeraboxHost(url.hostname)) return { error: 'That isn’t a Terabox link.' };
  const shareId = shareIdOf(url);
  if (!shareId) return { error: 'This Terabox link has no share in it. Copy the link from Terabox’s Share button.' };
  url.protocol = 'https:';
  return { link: { url: url.href, shareId } };
}
