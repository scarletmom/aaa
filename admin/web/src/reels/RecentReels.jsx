import { useEffect, useState } from "react";
import { ChevronRight, Clapperboard, LoaderCircle, Trash2 } from "lucide-react";
import { STAGE_LABELS, deleteSavedReel, failureMessage, loadRecentReels, shortReel, timeAgo } from "../lib/reels.js";
import { Button, Tip } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";

export default function RecentReels({ currentId, onOpen, onDeleted }) {
  const { confirm, toast } = useFeedback();
  const [items, setItems] = useState(null);
  const [unavailable, setUnavailable] = useState("");
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    loadRecentReels()
      .then(({ drafts }) => setItems(drafts))
      .catch((err) => setUnavailable(err.code === "no_database" ? "Recent reels are saved in the database, which isn't set up here." : failureMessage(err)));
  }, []);

  const open = async (item) => {
    setOpening(item.id);
    try {
      await onOpen(item.id);
    } catch (err) {
      toast(`Couldn't open that reel. ${failureMessage(err)}`, "error");
      if (err.status === 404) setItems((list) => list.filter((entry) => entry.id !== item.id));
    } finally {
      setOpening(null);
    }
  };

  const remove = async (item) => {
    const ok = await confirm({
      title: "Remove from Recent?",
      description: "Its saved progress is deleted on every device. A post it already created stays on the site.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSavedReel(item.id);
      setItems((list) => list.filter((entry) => entry.id !== item.id));
      onDeleted(item.id);
    } catch (err) {
      toast(`Couldn't remove it. ${failureMessage(err)}`, "error");
    }
  };

  if (unavailable) return <p className="reel-recent-note">{unavailable}</p>;

  return (
    <section className="reel-recent" aria-labelledby="reel-recent-title">
      <h3 id="reel-recent-title">Recent</h3>
      {items === null ? (
        <p className="reel-recent-note">
          <LoaderCircle className="spin" size={14} strokeWidth={1.75} /> Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="reel-recent-note">Reels you download show up here, so you can pick them up later on any device.</p>
      ) : (
        <ul className="reel-recent-list">
          {items.map((item) => (
            <li key={item.id} className="reel-recent-item">
              <button type="button" className="reel-status is-link" onClick={() => open(item)} disabled={Boolean(opening)}>
                <span className={`reel-status-thumb${item.thumbnail ? "" : " is-empty"}`}>
                  {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Clapperboard size={16} strokeWidth={1.5} />}
                </span>
                <span>
                  <span className="reel-status-title" title={item.reelUrl}>
                    {item.title || shortReel(item.reelUrl)}
                  </span>
                  <span className="reel-status-sub">
                    {item.id === currentId ? "Open now · " : ""}
                    {STAGE_LABELS[item.stage]} · {timeAgo(item.updatedAt)}
                  </span>
                </span>
                {opening === item.id ? <LoaderCircle className="spin muted" size={16} strokeWidth={1.75} /> : <ChevronRight size={16} strokeWidth={1.75} className="muted" />}
              </button>
              <Tip label="Remove">
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(item)} disabled={Boolean(opening)} aria-label={`Remove ${item.title || shortReel(item.reelUrl)}`} />
              </Tip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
