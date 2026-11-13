import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImageOff, SearchX } from "lucide-react";
import { formatClock } from "../lib/reels.js";
import { Button } from "../ui/controls.jsx";

const PAGE_SIZE = 24;

function scoreTone(similarity) {
  if (similarity == null) return "none";
  if (similarity >= 80) return "high";
  if (similarity >= 60) return "mid";
  return "low";
}

function MatchCard({ match, chosen, onChoose }) {
  const [broken, setBroken] = useState(false);
  const tone = scoreTone(match.similarity);
  const label = match.title || match.url || "Untitled";
  return (
    <article className={`match-card${chosen ? " is-chosen" : ""}`}>
      <div className={`match-score is-${tone}`}>
        <span className="match-score-value mono">{match.similarity == null ? "—" : `${match.similarity}%`}</span>
        <span className="match-score-bar" aria-hidden="true">
          <span style={{ width: `${match.similarity ?? 0}%` }} />
        </span>
      </div>
      <a className="match-thumb" href={match.url || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label} in a new tab`}>
        {match.thumbnail && !broken ? (
          <img src={match.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <ImageOff size={20} strokeWidth={1.5} />
        )}
        <span className="match-tag">{match.tag}</span>
      </a>
      <div className="match-body">
        <a className="match-title" href={match.url || undefined} target="_blank" rel="noopener noreferrer" title={label}>
          {label}
        </a>
        <Button size="sm" variant={chosen ? "primary" : "secondary"} icon={chosen ? Check : undefined} onClick={onChoose} disabled={!match.url}>
          {chosen ? "Chosen" : "Use for post"}
        </Button>
      </div>
    </article>
  );
}

export default function DetailsStep({ draft, update, go, back }) {
  const groups = draft.matches || [];
  const total = groups.reduce((sum, group) => sum + group.results.length, 0);
  const [tab, setTab] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = tab === "all" ? groups.flatMap((group) => group.results).sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1)) : groups.find((g) => g.tag === tab)?.results || [];
  const chosen = groups.flatMap((group) => group.results).find((match) => match.key === draft.chosen);

  // Fills Real URL and Title from the match, but keeps anything typed by hand.
  const choose = (match) => {
    update((current) => {
      if (current.chosen === match.key) return { chosen: null };
      const previous = groups.flatMap((g) => g.results).find((m) => m.key === current.chosen);
      const form = { ...current.form };
      if (!form.realUrl || form.realUrl === previous?.url) form.realUrl = match.url;
      if (match.title && (!form.title || form.title === previous?.title)) form.title = match.title;
      return { chosen: match.key, form };
    });
  };

  return (
    <div className="reel-details">
      <div className="reel-card reel-summary">
        <span className="reel-status-thumb is-lg">{draft.searchedFrame && <img src={draft.searchedFrame} alt="Searched frame" />}</span>
        <div className="reel-summary-text">
          <h2>
            {total} {total === 1 ? "match" : "matches"}
            {groups.length > 0 && <span className="muted"> across {groups.length} {groups.length === 1 ? "source" : "sources"}</span>}
          </h2>
          <p className="reel-lead">
            {draft.searchedTime != null && `Searched the frame at ${formatClock(draft.searchedTime)}. `}
            Open a thumbnail to check it, then pick the one to post.
          </p>
          <div className="reel-summary-facts">
            <span className={`reel-fact${draft.form.thumbnail ? " is-ok" : ""}`}>
              {draft.form.thumbnail ? <Check size={14} strokeWidth={2} /> : null}
              {draft.form.thumbnail ? "Thumbnail set" : "No thumbnail yet"}
            </span>
            <span className={`reel-fact${chosen ? " is-ok" : ""}`}>
              {chosen ? <Check size={14} strokeWidth={2} /> : null}
              {chosen ? `Using “${chosen.title || chosen.tag}”` : "No match chosen"}
            </span>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="empty-state reel-empty">
          <SearchX size={28} strokeWidth={1.25} />
          <h2>No matches for this frame</h2>
          <p>Go back and try a frame where the face is clearer, or continue and fill in the post yourself.</p>
        </div>
      ) : (
        <>
          <div className="content-tabs reel-tabs" role="tablist" aria-label="Sources">
            {[{ tag: "all", results: { length: total } }, ...groups].map((group) => (
              <button key={group.tag} type="button" role="tab" aria-selected={tab === group.tag} className="content-tab" onClick={() => {
                  setTab(group.tag);
                  setLimit(PAGE_SIZE);
                }}
              >
                {group.tag === "all" ? "All" : group.tag}
                <span className="content-tab-count mono">{group.results.length}</span>
              </button>
            ))}
          </div>
          <div className="match-grid">
            {shown.slice(0, limit).map((match) => (
              <MatchCard key={match.key} match={match} chosen={match.key === draft.chosen} onChoose={() => choose(match)} />
            ))}
          </div>
          {shown.length > limit && (
            <Button className="match-more" icon={ChevronDown} onClick={() => setLimit(limit + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, shown.length - limit)} more · {shown.length - limit} left
            </Button>
          )}
        </>
      )}

      <div className="reel-actions reel-footer">
        <Button variant="ghost" icon={ArrowLeft} onClick={back}>
          Back to frames
        </Button>
        <div className="spacer" />
        <Button variant="primary" onClick={() => go("post")}>
          Next
          <ArrowRight size={16} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
