import type { BodyBlock } from './types';

const WORDS_PER_MINUTE = 200;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
// Fixed time zone so the build's HTML and the browser's first render agree.
const staticDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const staticDateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
});
const longDateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return dateFormat.format(new Date(iso));
}

export const formatStaticDate = (iso: string) => staticDateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatStaticDateTime = (iso: string) => staticDateTimeFormat.format(new Date(iso));
export const formatLongDate = (date: Date) => longDateFormat.format(date);

const blockText = (block: BodyBlock) =>
  typeof block === 'string' ? block : 'h' in block ? block.h : block.quote;
export const bodyText = (body: BodyBlock[]) => body.map(blockText).join(' ');

export function readTime(body: BodyBlock[]): number {
  const words = bodyText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat('en-GB');

/** "1.2M views" on cards, "1,234,567 views" with `full`; live streams count people "watching". */
export function formatViews(count: number, { live = false, full = false } = {}): string {
  const number = full ? fullNumber.format(count) : compactNumber.format(count);
  return `${number} ${live ? 'watching' : count === 1 ? 'view' : 'views'}`;
}

export const initials = (name: string) =>
  name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export const tagSlug = (tag: string) =>
  tag.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');

export const homeUrl = '/';
/** The front page for accounts whose home is the videos page. */
export const noteUrl = '/note/';
export const articleUrl = (article: { id: string }) => `/article/${encodeURIComponent(article.id)}/`;
export const sectionUrl = (slug: string) => `/section/${encodeURIComponent(slug)}/`;
export const tagUrl = (tag: string) => `/topic/${tagSlug(tag)}/`;
export const searchUrl = (query: string) => `/search/?q=${encodeURIComponent(query)}`;
export const videosUrl = '/videos/';
export const subscribeUrl = '/subscribe/';
export const teraboxTabUrl = '/videos/?tab=terabox';
export const channelsTabUrl = '/videos/?tab=channels';
export const channelUrl = (name: string) => `/videos/?channel=${encodeURIComponent(name)}`;
export const videoUrl = (id: string, episode?: number) =>
  `/videos/?v=${encodeURIComponent(id)}${episode ? `&ep=${episode}` : ''}`;
