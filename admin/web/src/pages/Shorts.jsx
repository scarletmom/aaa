import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ellipsis, Eye, EyeOff, PencilLine, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { formatDate, shortPath } from "../lib/content.js";
import { Button, Switch, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError, useThumbnailsPref } from "../ui/site.jsx";

export default function Shorts() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [shorts, setShorts] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showThumbs, setShowThumbs] = useThumbnailsPref();

  useEffect(() => {
    api("/api/shorts")
      .then(setShorts)
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));
  }, []);

  const visible = useMemo(
    () => (shorts || []).filter((s) => !query || `${s.title} ${s.category?.name || ""}`.toLowerCase().includes(query)),
    [shorts, query]
  );

  const setEnabled = async (short, enabled) => {
    try {
      await api(`/api/shorts/${short.id}/enabled`, { method: "POST", body: { enabled } });
      setShorts((list) => list.map((s) => (s.id === short.id ? { ...s, enabled } : s)));
      toast(enabled ? "Short is live" : "Short is hidden from the site");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (short) => {
    const ok = await confirm({
      title: `Delete “${short.title}”`,
      description: "It leaves the Shorts shelf and feed. This can't be undone.",
      confirmLabel: "Delete short",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/shorts/${short.id}`, { method: "DELETE" });
      setShorts((list) => list.filter((s) => s.id !== short.id));
      toast(`Deleted “${short.title}”`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const live = shorts?.filter((s) => s.enabled).length ?? 0;

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Shorts</h1>
          <p className="home-sub">
            {shorts ? (
              <>
                <span className="mono">{shorts.length}</span> {shorts.length === 1 ? "short" : "shorts"}, <span className="mono">{live}</span> live. They show
                as Shorts shelves on the videos home page.
              </>
            ) : (
              "Vertical clips for the Shorts shelf and feed"
            )}
          </p>
        </div>
        {!setupNeeded && (
          <Button variant="primary" icon={Plus} onClick={() => navigate("/shorts/new")}>
            New short
          </Button>
        )}
      </div>

      {setupNeeded ? (
        <SetupNotice />
      ) : shorts === null ? (
        <div className="cat-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cat-row post-skeleton" />
          ))}
        </div>
      ) : shorts.length === 0 ? (
        <div className="empty-state">
          <h2>No shorts yet</h2>
          <p>A short is a vertical clip played from its video URL (.mp4, .m3u8 or .mpd)</p>
          <Button variant="primary" icon={Plus} onClick={() => navigate("/shorts/new")}>
            New short
          </Button>
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
              <span>Short</span>
              <span className="col-category">Category</span>
              <span>Visibility</span>
              <span className="col-date">Created</span>
              <span />
            </div>
            {visible.map((short) => {
              const open = () => navigate(shortPath(short.id));
              return (
                <div
                  key={short.id}
                  className={`media-row${short.enabled ? "" : " is-off"}`}
                  role="link"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => e.key === "Enter" && open()}
                >
                  <span className="media-main">
                    <Thumb src={short.thumbnail} duration={short.durationSeconds} show={showThumbs} size="short" />
                    <span className="media-text">
                      <span className="media-title">{short.title}</span>
                      <span className="media-sub mono">{short.videoUrl}</span>
                    </span>
                  </span>
                  <span className="col-category">{short.category?.name || <span className="muted">—</span>}</span>
                  <span>
                    <span className={`visibility${short.enabled ? " is-live" : ""}`}>
                      <span className="dot" />
                      {short.enabled ? "Live" : "Disabled"}
                    </span>
                  </span>
                  <span className="col-date muted">{formatDate(short.createdAt)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label="Short actions" />}
                      items={[
                        { label: "Edit", icon: PencilLine, onSelect: open },
                        { label: short.enabled ? "Disable" : "Enable", icon: short.enabled ? EyeOff : Eye, onSelect: () => setEnabled(short, !short.enabled) },
                        "separator",
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(short) },
                      ]}
                    />
                  </span>
                </div>
              );
            })}
            {visible.length === 0 && <div className="wf-none">Nothing matches “{params.get("q")}”</div>}
          </div>
        </>
      )}
    </div>
  );
}
