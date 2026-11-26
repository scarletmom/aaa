'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/cn';
import type { Comment, SeedComments } from '@/lib/comments';
import { episodeIndex, titleWithEpisode } from '@/lib/episodes';
import { videosUrl } from '@/lib/format';
import { useAdFree } from '@/lib/adFree';
import { canWatchVideos, proPlan } from '@/lib/roles';
import { getSession, useHydrated, useSession } from '@/lib/session';
import { type CatalogVideo, channelPosters, type Episode, fetchVideo, fetchVideos, openTerabox, recommendedFor } from '@/lib/videos';
import type { TeraboxLink } from '@/lib/teraboxLink';
import ViewerAds from '../site/ViewerAds';
import AccessGate from './AccessGate';
import AdBlockDialog, { useAdBlockCheck } from './AdBlockDialog';
import Catalog from './Catalog';
import ImageResults from './ImageResults';
import ShortsFeed from './ShortsFeed';
import TeraboxView from './TeraboxView';
import { videoContainer } from './styles';
import ProReturn from './ProReturn';
import UpgradeDialog from './UpgradeDialog';
import { type Loaded, useAccountLoad } from './useAccountLoad';
import { useImageSearch } from './useImageSearch';
import VideoTabBar, { type VideoTab } from './VideoTabBar';
import VideoTopBar from './VideoTopBar';
import WatchView from './WatchView';

const UP_NEXT_LIMIT = 6;
const CATALOG_KEEP_MS = 5 * 60 * 1000;

const NO_COMMENTS: Comment[] = [];
const NO_VIDEOS: CatalogVideo[] = [];

const loadCatalog = (_request: string, token: string) => fetchVideos(token);
const loadDetail = (id: string, token: string) => fetchVideo(id, token);

const watchTerabox = (link: TeraboxLink) => openTerabox(link.url, getSession()?.token ?? '');

const loadingMessage = <p className="py-24 text-center text-muted">Loading…</p>;

function LoadProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="max-w-[420px] text-muted">{message}</p>
      <button type="button" onClick={onRetry} className="h-10 rounded-full border border-line px-5 text-[14px] font-semibold hover:border-fg">
        Try again
      </button>
    </div>
  );
}

const loadStatus = (load: Loaded<unknown>) =>
  (load.status === 'loading' ? loadingMessage : load.status === 'error' ? <LoadProblem message={load.message} onRetry={load.retry} /> : null);

interface VideosAppProps {
  comments: SeedComments;
  brand: string;
}

export default function VideosApp({ comments, brand }: VideosAppProps) {
  const hydrated = useHydrated();
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('v');
  const onTerabox = !activeId && searchParams.get('tab') === 'terabox';
  const requestedEpisode = Number(searchParams.get('ep')) || 0;
  const start = Number(searchParams.get('t')) || 0;
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('');
  const [searching, setSearching] = useState(false);
  const imageSearch = useImageSearch();

  const allowed = session ? canWatchVideos(session.role) : false;
  const adFree = useAdFree(session);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Latched: ProReturn clears ?pro= from the address as soon as it shows.
  const [proReturn, setProReturn] = useState('');
  const [proSettled, setProSettled] = useState(false);
  const proParam = searchParams.get('pro');
  if (!proReturn && proParam) setProReturn(proParam);
  const settleProReturn = useCallback(() => setProSettled(true), []);
  // A buyer back from checkout is still Member Lite until the payment confirms; don't wall them meanwhile.
  const confirmingPayment = Boolean(proReturn) && !proSettled;
  // Member Lite watches with ads, so blocking them blocks the videos; a valid ad-free pass is never checked.
  const adBlock = useAdBlockCheck(hydrated && allowed && adFree === false && !confirmingPayment);
  const adsCleared = adFree !== null && (adBlock.status === 'off' || adBlock.status === 'clear');
  const accountId = session && allowed && adsCleared ? session.id || session.name : null;
  const catalog = useAccountLoad('catalog', accountId, '', loadCatalog, { keepMs: CATALOG_KEEP_MS });
  // Not kept: each open counts a view and needs a fresh play endpoint.
  const detail = useAccountLoad('detail', accountId, activeId, loadDetail);
  const videos = catalog.status === 'ready' ? catalog.data : NO_VIDEOS;

  const [reported, setReported] = useState<{ id: string; episodes: Episode[]; playing: number } | null>(null);

  const loaded = activeId && detail.status === 'ready' ? detail.data.video : null;
  const ownEpisodes = loaded && reported?.id === loaded.id ? reported : null;
  const active = loaded && ownEpisodes ? { ...loaded, episodes: ownEpisodes.episodes } : loaded;
  const episode = active ? episodeIndex(active, requestedEpisode, ownEpisodes?.playing ?? -1) : -1;
  const activeTitle = active ? titleWithEpisode(active, episode) : '';

  useEffect(() => {
    if (activeTitle) document.title = `${activeTitle} · ${brand}`;
  }, [activeTitle, brand]);

  const search = (value: string) => {
    setQuery(value);
    if ((active || onTerabox) && value) router.push(videosUrl);
  };

  const openSearch = () => {
    // Focusing inside the tap is what lets phones raise the keyboard.
    flushSync(() => setSearching(true));
    document.getElementById('video-search')?.focus();
  };

  const goHome = () => {
    if (!activeId && !onTerabox && !searching && !query && !imageSearch.search) window.scrollTo({ top: 0, behavior: 'smooth' });
    setSearching(false);
    setQuery('');
    setChannel('');
    imageSearch.clear();
  };

  const searchByImage = (file: File) => {
    setQuery('');
    imageSearch.start(file);
    if (active || onTerabox) router.push(videosUrl);
  };

  let content;
  if (!hydrated) {
    content = loadingMessage;
  } else if (!allowed) {
    content = <AccessGate session={session} />;
  } else if (adFree === null || adBlock.status === 'checking') {
    content = loadingMessage;
  } else if (adBlock.status === 'blocked') {
    content = null;
  } else if (activeId && detail.status !== 'ready') {
    content = loadStatus(detail);
  } else if (active?.short) {
    content = <ShortsFeed shorts={videos.filter((v) => v.short)} startId={active.id} />;
  } else if (active && detail.status === 'ready') {
    const upNext = recommendedFor(active, videos, UP_NEXT_LIMIT);
    const moreVideos = videos.filter((v) => v.id !== active.id && !upNext.includes(v));
    content = <WatchView
        video={active}
        playEndpoint={detail.data.play}
        upNext={upNext}
        moreVideos={moreVideos}
        channelPoster={channelPosters(videos).get(active.channel)}
        episode={episode}
        requestedEpisode={requestedEpisode}
        start={start}
        comments={comments[active.id] ?? NO_COMMENTS}
        onEpisodes={(episodes, playing) => setReported({ id: active.id, episodes, playing })}
      />;
  } else if (onTerabox) {
    // The paste box doesn't need the catalog, so it shows while the other videos load.
    content = <TeraboxView videos={videos} videosLoading={catalog.status === 'loading'} onWatch={watchTerabox} />;
  } else if (catalog.status !== 'ready') {
    content = loadStatus(catalog);
  } else if (imageSearch.search) {
    content = <ImageResults search={imageSearch.search} videos={videos} onClear={imageSearch.clear} />;
  } else {
    content = <Catalog videos={videos} query={query} channel={channel} onChannel={setChannel} />;
  }

  const activeTab: VideoTab = searching ? 'search' : onTerabox ? 'terabox' : activeId ? null : 'home';

  return (
    <>
      <ViewerAds />
      <a href="#main" className="absolute -top-10 left-3 z-30 bg-fg px-3 py-2 text-bg focus:top-3">Skip to content</a>
      <VideoTopBar
        brand={brand}
        active={activeTab}
        onHome={goHome}
        searchEnabled={hydrated && allowed}
        searching={searching}
        onSearchingChange={setSearching}
        query={query}
        onQuery={search}
        image={imageSearch.search}
        onImage={searchByImage}
        onClearImage={imageSearch.clear}
        onUpgrade={() => setUpgradeOpen(true)}
      />
      <main id="main" tabIndex={-1} className={cn(videoContainer, 'outline-none max-md:pb-(--tab-bar-h)')}>
        {content}
      </main>
      <VideoTabBar
        active={activeTab}
        searchEnabled={hydrated && allowed}
        onHome={goHome}
        onSearch={openSearch}
      />
      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        extending={Boolean(session && proPlan(session) === 'timed')}
      />
      <AdBlockDialog check={adBlock} onUpgrade={() => setUpgradeOpen(true)} />
      {hydrated && session && proReturn && <ProReturn checkoutRef={proReturn} onSettled={settleProReturn} />}
    </>
  );
}
