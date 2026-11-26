import { cache } from 'react';
import articlesJson from '@/data/articles.json';
import playerJson from '@/data/player.json';
import siteJson from '@/data/site.json';
import appLinksJson from '@/data/videos.json';
import { bodyText, tagSlug } from './format';
import type { AppLink, Article, PlayerConfig, SearchEntry, SiteConfig, Story } from './types';

// src/data/ is bundled at build time; the player and Mini App get the same files from /data/ (app/data/[...file]).
const siteConfig: SiteConfig = siteJson;
const articleList: Article[] = articlesJson;
const appLinks: AppLink[] = appLinksJson;
const playerConfig: PlayerConfig = playerJson;

const byNewest = (a: { publishedAt: string }, b: { publishedAt: string }) =>
  new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();

export interface SiteData {
  site: SiteConfig;
  articles: Story[];
  appLinks: AppLink[];
  sectionNames: Record<string, string>;
  t: (key: string, fallback: string) => string;
}

// Stops the build on data that would produce broken pages.
function checkArticles(articles: Article[], sectionNames: Record<string, string>) {
  const ids = new Set<string>();
  for (const article of articles) {
    if (!article.id) throw new Error(`src/data/articles.json: article without an id: "${article.title}"`);
    if (ids.has(article.id)) throw new Error(`src/data/articles.json: duplicate article id "${article.id}"`);
    if (!sectionNames[article.category]) {
      throw new Error(`src/data/articles.json: article "${article.id}" has unknown category "${article.category}"`);
    }
    ids.add(article.id);
  }
}

export const getSiteData = cache(async (): Promise<SiteData> => {
  const site = siteConfig;
  const sectionNames = Object.fromEntries(site.sections.map((s) => [s.slug, s.name]));
  checkArticles(articleList, sectionNames);
  const articles = articleList
    .map((article) => ({ ...article, sectionName: sectionNames[article.category] || article.category }))
    .sort(byNewest);
  const labels = site.labels || {};
  const t = (key: string, fallback: string) => labels[key] ?? fallback;
  return { site, articles, appLinks, sectionNames, t };
});

export const getPlayerData = async (): Promise<PlayerConfig> => playerConfig;

export async function getArticle(id: string): Promise<Story | null> {
  const { articles } = await getSiteData();
  return articles.find((a) => a.id === id) ?? null;
}

/** Every topic in site.json plus every tag used on a post, keyed by its URL slug. */
export async function getTags(): Promise<Map<string, string>> {
  const { site, articles } = await getSiteData();
  const tags = new Map<string, string>();
  for (const tag of [...site.topics, ...articles.flatMap((a) => a.tags)]) {
    if (!tags.has(tagSlug(tag))) tags.set(tagSlug(tag), tag);
  }
  return tags;
}

export const mostRead = (articles: Story[], limit = 5) => [...articles].sort((a, b) => b.views - a.views).slice(0, limit);

/** What the search page needs per post, with the body flattened to text. */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  const { articles } = await getSiteData();
  return articles.map(({ id, title, summary, category, sectionName, author, authorRole, publishedAt, image, imageCaption, tags, body }) => ({
    id, title, summary, category, sectionName, author, authorRole, publishedAt, image, imageCaption, tags, text: bodyText(body),
  }));
}
