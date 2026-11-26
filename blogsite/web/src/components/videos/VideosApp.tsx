'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/cn';
import type { Comment, SeedComments } from '@/lib/comments';
import { episodeIndex, titleWithEpisode } from '@/lib/episodes';
import { channelUrl, teraboxTabUrl, videosUrl } from '@/lib/format';
import { useAdFree } from '@/lib/adFree';
import { takeProPlan } from '@/lib/pro';
import { canWatchVideos, proPlan } from '@/lib/roles';
import { getSession, useHydrated, useSession } from '@/lib/session';
import {
  type CatalogVideo,
  type Episode,
  fetchShorts,
  fetchTeraboxPage,
  fetchVideo,
  fetchVideoPage,
  fetchVideos,
  openTerabox,
  type TeraboxPage,
  type VideoPage,
} from '@/lib/videos';
import type { TeraboxLink } from '@/lib/teraboxLink';
import ViewerAds from '../site/ViewerAds';
import AccessGate from './AccessGate';
import AdBlockDialog, { useAdBlockCheck } from './AdBlockDialog';
import Catalog from './Catalog';
import ChannelsView from './ChannelsView';
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
const SEARCH_DELAY_MS = 300;

const NO_COMMENTS: Comment[] = [];
const NO_VIDEOS: CatalogVideo[] = [];

const loadCatalog = (_request: string, token: string) => fetchVideos(token);
const loadPage = (request: string, token: string) => fetchVideoPage(JSON.parse(request), token);
const loadShorts = (_request: string, token: string) => fetchShorts(token);
const loadTeraboxPage = (request: string, token: string) => fetchTeraboxPage(Number(request), token);
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
  const onChannels = !activeId && searchParams.get('tab') === 'channels';
  // Sent by the blog's Terabox Player page; it plays once and then leaves the address.
  const teraboxLink = onTerabox ? searchParams.get('link') ?? '' : '';
  const shortId = activeId ? null : searchParams.get('short');
  // In the address, so the channels page can link to a filtered home page and Back undoes a filter.
  const channel = searchParams.get('channel') ?? '';
  const requestedEpisode = Number(searchParams.get('ep')) || 0;
  const start = Number(searchParams.get('t')) || 0;
  const [query, setQuery] = useState('');
  const [searchWords, setSearchWords] = useState('');
  // Remembered with the filter it was turned under, so new search words or a new channel start again at page 1.
  const [pageTurn, setPageTurn] = useState({ filter: '', page: 1 });
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
  // A Member who chose Pro comes back from the videos site's captcha as Member Lite with ?upgrade=pro: checkout opens for
  // the plan they picked (or the plans, if it wasn't kept).
  const wantsPro = searchParams.get('upgrade') === 'pro';
  const [checkoutPlan, setCheckoutPlan] = useState('');
  useEffect(() => {
    if (!wantsPro || !session || !canWatchVideos(session.role)) return;
    if (session.role === 'member-lite') {
      setCheckoutPlan(takeProPlan());
      setUpgradeOpen(true);
    }
    router.replace(videosUrl, { scroll: false });
  }, [wantsPro, session, router]);
  // A buyer back from checkout is still Member Lite until the payment confirms; don't wall them meanwhile.
  const confirmingPayment = Boolean(proReturn) && !proSettled;
  // Member Lite watches with ads, so blocking them blocks the videos; a valid ad-free pass is never checked.
  const adBlock = useAdBlockCheck(hydrated && allowed && adFree === false && !confirmingPayment);
  const adsCleared = adFree !== null && (adBlock.status === 'off' || adBlock.status === 'clear');
  const accountId = session && allowed && adsCleared ? session.id || session.name : null;
  const filter = `${searchWords}\n${channel}`;
  const page = pageTurn.filter === filter ? pageTurn.page : 1;
  const setPage = (next: number) => setPageTurn({ filter, page: next });
  const pageRequest = !imageSearch.search && !shortId ? JSON.stringify({ page, query: searchWords, channel }) : null;
  const paged = useAccountLoad('page', accountId, pageRequest, loadPage, { keepMs: CATALOG_KEEP_MS });
  // The last page stays up while the next one loads.
  const [shownPage, setShownPage] = useState<VideoPage | null>(null);
  if (paged.status === 'ready' && paged.data !== shownPage) setShownPage(paged.data);
  const shortsLoad = useAccountLoad('shorts', accountId, '', loadShorts, { keepMs: CATALOG_KEEP_MS });
  const shorts = shortsLoad.status === 'ready' ? shortsLoad.data : NO_VIDEOS;
  const [teraboxPageNumber, setTeraboxPageNumber] = useState(1);
  const teraboxLoad = useAccountLoad('terabox', accountId, onTerabox ? String(teraboxPageNumber) : null, loadTeraboxPage, { keepMs: CATALOG_KEEP_MS });
  const [shownTerabox, setShownTerabox] = useState<TeraboxPage | null>(null);
  if (teraboxLoad.status === 'ready' && teraboxLoad.data !== shownTerabox) setShownTerabox(teraboxLoad.data);
  // Not kept: each open counts a view and needs a fresh play endpoint.
  const detail = useAccountLoad('detail', accountId, activeId, loadDetail);

  const [reported, setReported] = useState<{ id: string; episodes: Episode[]; playing: number } | null>(null);

  const loaded = activeId && detail.status === 'ready' ? detail.data.video : null;
  const ownEpisodes = loaded && reported?.id === loaded.id ? reported : null;
  const active = loaded && ownEpisodes ? { ...loaded, episodes: ownEpisodes.episodes } : loaded;
  const episode = active ? episodeIndex(active, requestedEpisode, ownEpisodes?.playing ?? -1) : -1;
  const activeTitle = active ? titleWithEpisode(active, episode) : '';
  // Only image search still needs every video at once.
  const needsCatalog = Boolean(imageSearch.search);
  const catalog = useAccountLoad('catalog', accountId, needsCatalog ? '' : null, loadCatalog, { keepMs: CATALOG_KEEP_MS });
  const videos = catalog.status === 'ready' ? catalog.data : NO_VIDEOS;

  useEffect(() => {
    const timer = setTimeout(() => setSearchWords(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (activeTitle) document.title = `${activeTitle} · ${brand}`;
  }, [activeTitle, brand]);

  const search = (value: string) => {
    setQuery(value);
    if ((active || onTerabox || onChannels || shortId) && value) router.push(channel ? channelUrl(channel) : videosUrl);
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
    setSearchWords('');
    setPageTurn({ filter: '', page: 1 });
    imageSearch.clear();
  };

  const searchByImage = (file: File) => {
    setQuery('');
    imageSearch.start(file);
    if (active || onTerabox || onChannels || shortId) router.push(videosUrl);
  };

  const chooseChannel = (name: string) => router.push(name ? channelUrl(name) : videosUrl);

  const catalogPage = (sidebar: boolean) => shownPage && (
    <Catalog
      page={shownPage}
      shorts={searchWords || channel ? NO_VIDEOS : shorts}
      channel={channel}
      onChannel={chooseChannel}
      sidebar={sidebar}
      onPage={setPage}
      filtered={Boolean(searchWords || channel)}
      busy={paged.status === 'loading'}
    />
  );

  let content;
  if (!hydrated) {
    content = loadingMessage;
  } else if (!allowed) {
    content = <AccessGate session={session} />;
  } else if (adFree === null || adBlock.status === 'checking') {
    content = loadingMessage;
  } else if (adBlock.status === 'blocked') {
    content = null;
  } else if (shortId) {
    if (shortsLoad.status !== 'ready') content = loadStatus(shortsLoad);
    else if (!shorts.length) content = <p className="py-24 text-center text-muted">There are no shorts to watch yet.</p>;
    else content = <ShortsFeed shorts={shorts} startId={shortId} />;
  } else if (activeId && detail.status !== 'ready') {
    content = loadStatus(detail);
  } else if (active && detail.status === 'ready') {
    content = <WatchView
        video={active}
        playEndpoint={detail.data.play}
        upNext={detail.data.related.slice(0, UP_NEXT_LIMIT)}
        moreVideos={catalogPage(false)}
        channelPoster={shownPage?.channels.find((c) => c.name === active.channel)?.avatar || undefined}
        episode={episode}
        requestedEpisode={requestedEpisode}
        start={start}
        comments={comments[active.id] ?? NO_COMMENTS}
        onEpisodes={(episodes, playing) => setReported({ id: active.id, episodes, playing })}
      />;
  } else if (onTerabox) {
    content = (
      <TeraboxView
        initialLink={teraboxLink}
        onInitialLink={() => router.replace(teraboxTabUrl, { scroll: false })}
        onWatch={watchTerabox}
        listing={shownTerabox}
        listingProblem={teraboxLoad.status === 'error' ? loadStatus(teraboxLoad) : null}
        onPage={setTeraboxPageNumber}
        listingBusy={teraboxLoad.status === 'loading'}
      />
    );
  } else if (onChannels) {
    content = shownPage ? <ChannelsView channels={shownPage.channels} active={channel} /> : loadStatus(paged);
  } else if (imageSearch.search) {
    content = catalog.status === 'ready'
      ? <ImageResults search={imageSearch.search} videos={videos} onClear={imageSearch.clear} />
      : loadStatus(catalog);
  } else if (paged.status === 'error' || !shownPage) {
    content = loadStatus(paged);
  } else {
    content = catalogPage(true);
  }

  const activeTab: VideoTab = searching ? 'search' : onTerabox ? 'terabox' : activeId || shortId ? null : 'home';

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
        checkoutPlan={checkoutPlan}
        onClose={() => setUpgradeOpen(false)}
        extending={Boolean(session && proPlan(session) === 'timed')}
      />
      <AdBlockDialog check={adBlock} onUpgrade={() => setUpgradeOpen(true)} />
      {hydrated && session && proReturn && <ProReturn checkoutRef={proReturn} onSettled={settleProReturn} />}
    </>
  );
}
