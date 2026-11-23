'use client';

import { useMemo } from 'react';
import { useCurrentPage, useLinkQuery } from '@/lib/linkQuery';
import type { SearchEntry } from '@/lib/types';
import SectionIntro from './SectionIntro';
import StoryList from './StoryList';

function search(articles: SearchEntry[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter((article) => {
    const haystack = [article.title, article.summary, article.author, article.sectionName, article.tags.join(' '), article.text]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

interface SearchResultsProps {
  articles: SearchEntry[];
  latestTitle: string;
  latestIntro: string;
}

// Runs in the browser: a static page can't know ?q= ahead of time.
export default function SearchResults({ articles, latestTitle, latestIntro }: SearchResultsProps) {
  const { path } = useCurrentPage();
  const query = (useLinkQuery().get('q') || '').trim();
  const results = useMemo(() => (query ? search(articles, query) : articles), [articles, query]);

  if (!path) return <p className="py-20 text-center text-muted">Loading…</p>;

  const count = `${results.length} ${results.length === 1 ? 'story' : 'stories'} found.`;
  return (
    <>
      {/* An empty search lists every post, as section.html?q= did. */}
      {query ? <SectionIntro heading={`Results for “${query}”`} intro={count} /> : <SectionIntro heading={latestTitle} intro={latestIntro} />}
      <StoryList key={query} articles={results} />
    </>
  );
}
