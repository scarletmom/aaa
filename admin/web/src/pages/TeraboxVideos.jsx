import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { formatDate } from "../lib/content.js";
import { Switch, Tip } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError, useThumbnailsPref } from "../ui/site.jsx";

export default function TeraboxVideos() {
  const { toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [videos, setVideos] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showThumbs, setShowThumbs] = useThumbnailsPref();

  useEffect(() => {
    api("/api/terabox-videos")
      .then(setVideos)
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));
  }, []);

  const visible = useMemo(() => (videos || []).filter((v) => !query || `${v.title} ${v.key}`.toLowerCase().includes(query)), [videos, query]);
  const published = videos?.filter((v) => v.public).length ?? 0;

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
      </div>

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
          <p>Videos added to the terabox_videos table show up here, finished or not</p>
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
          <div className="cat-list">
            <div className="media-row cat-head">
              <span>Video</span>
              <span className="col-category">Key</span>
              <span>Status</span>
              <span className="col-date">Added</span>
              <span />
            </div>
            {visible.map((video) => (
              <div key={video.id} className={`media-row is-static${video.public ? "" : " is-off"}`}>
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
                <span className="col-date muted">{formatDate(video.createdAt)}</span>
                <span>
                  {video.teraboxUrl && (
                    <Tip label="Open on Terabox">
                      <a className="row-icon" href={video.teraboxUrl} target="_blank" rel="noopener noreferrer" aria-label="Open on Terabox">
                        <ExternalLink size={16} strokeWidth={1.5} />
                      </a>
                    </Tip>
                  )}
                </span>
              </div>
            ))}
            {visible.length === 0 && <div className="wf-none">Nothing matches “{params.get("q")}”</div>}
          </div>
        </>
      )}
    </div>
  );
}
