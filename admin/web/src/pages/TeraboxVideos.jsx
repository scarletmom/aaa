import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Ellipsis, ExternalLink, FileUp, PencilLine, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { formatCount, formatDate, teraboxVideoPath } from "../lib/content.js";
import { Button, Switch, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError, useThumbnailsPref } from "../ui/site.jsx";
import TeraboxImportDialog from "../ui/TeraboxImportDialog.jsx";

const PAGE_SIZE = 50;

function Stat({ label, value, note }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function Pager({ page, pages, total, onPage }) {
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  return (
    <nav className="list-pager" aria-label="Pages">
      <span className="list-pager-range mono">
        {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
      </span>
      <div className="list-pager-buttons">
        <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" />
        <span className="list-pager-page mono">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" />
      </div>
    </nav>
  );
}

export default function TeraboxVideos() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [videos, setVideos] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showThumbs, setShowThumbs] = useThumbnailsPref();
  const [importOpen, setImportOpen] = useState(false);
  const listRef = useRef(null);

  const load = () =>
    api("/api/terabox-videos")
      .then(setVideos)
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => (videos || []).filter((v) => !query || `${v.title} ${v.key}`.toLowerCase().includes(query)), [videos, query]);
  const published = videos?.filter((v) => v.public).length ?? 0;
  const views = videos?.reduce((sum, v) => sum + v.views, 0) ?? 0;

  // The page lives in the address so coming back from a video's editor returns to it; a new search starts at page 1.
  const pages = Math.max(Math.ceil(visible.length / PAGE_SIZE), 1);
  const page = Math.min(Math.max(Number.parseInt(params.get("page"), 10) || 1, 1), pages);
  const shown = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = (next) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next > 1) updated.set("page", String(next));
      else updated.delete("page");
      return updated;
    });
    listRef.current?.scrollIntoView({ block: "start" });
  };

  const remove = async (video) => {
    const ok = await confirm({
      title: `Delete “${video.title}”`,
      description: "It leaves the Terabox Videos page. Playing its link again on the site saves it as a new video. This can't be undone.",
      confirmLabel: "Delete video",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/terabox-videos/${video.id}`, { method: "DELETE" });
      setVideos((list) => list.filter((v) => v.id !== video.id));
      toast(`Deleted “${video.title}”`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Terabox videos</h1>
          <p className="home-sub">
            {videos ? (
              <>
                <span className="mono">{videos.length}</span> {videos.length === 1 ? "video" : "videos"}, <span className="mono">{published}</span> public. A video
                shows on the Terabox Videos page once it has a Terabox URL.
              </>
            ) : (
              "Videos for the Terabox Videos page"
            )}
          </p>
        </div>
        {!setupNeeded && (
          <Button variant="primary" icon={FileUp} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
        )}
      </div>

      {videos && videos.length > 0 && (
        <div className="stat-row">
          <Stat label="Videos" value={formatCount(videos.length)} note="total" />
          <Stat label="Public" value={formatCount(published)} note={`${formatCount(videos.length - published)} without a Terabox URL`} />
          <Stat label="Views" value={formatCount(views)} note="all time" />
        </div>
      )}

      {setupNeeded ? (
        <SetupNotice />
      ) : videos === null ? (
        <div className="cat-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cat-row post-skeleton" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <h2>No Terabox videos yet</h2>
          <p>Import a CSV of videos, or play a Terabox link on the site. Every row shows up here, finished or not</p>
        </div>
      ) : (
        <>
          <div className="content-toolbar">
            <div className="spacer" />
            <Tip label="Off keeps the list light on mobile data">
              <span>
                <Switch checked={showThumbs} onChange={setShowThumbs} label="Thumbnails" />
              </span>
            </Tip>
          </div>
          <div className="cat-list" ref={listRef}>
            <div className="media-row has-views cat-head">
              <span>Video</span>
              <span className="col-category">Key</span>
              <span>Status</span>
              <span className="col-views">Views</span>
              <span className="col-date">Added</span>
              <span />
            </div>
            {shown.map((video) => {
              const open = () => navigate(teraboxVideoPath(video.id));
              return (
                <div
                  key={video.id}
                  className={`media-row has-views${video.public ? "" : " is-off"}`}
                  role="link"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => e.key === "Enter" && open()}
                >
                  <span className="media-main">
                    <Thumb src={video.thumbnail} duration={video.duration} show={showThumbs} />
                    <span className="media-text">
                      <span className="media-title">{video.title}</span>
                      <span className="media-sub mono">{video.teraboxUrl || "No Terabox URL yet"}</span>
                    </span>
                  </span>
                  <span className="col-category mono">{video.key}</span>
                  <span>
                    <span className={`visibility${video.public ? " is-live" : ""}`}>
                      <span className="dot" />
                      {video.public ? "Public" : "Disabled"}
                    </span>
                  </span>
                  <span className="col-views mono">{formatCount(video.views)}</span>
                  <span className="col-date muted">{formatDate(video.createdAt)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label="Video actions" />}
                      items={[
                        { label: "Edit", icon: PencilLine, onSelect: open },
                        video.teraboxUrl && { label: "Open on Terabox", icon: ExternalLink, onSelect: () => window.open(video.teraboxUrl, "_blank", "noopener") },
                        "separator",
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(video) },
                      ]}
                    />
                  </span>
                </div>
              );
            })}
            {visible.length === 0 && <div className="wf-none">Nothing matches “{params.get("q")}”</div>}
          </div>
          {pages > 1 && <Pager page={page} pages={pages} total={visible.length} onPage={goToPage} />}
        </>
      )}

      <TeraboxImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
    </div>
  );
}
