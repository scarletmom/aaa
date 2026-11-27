import { useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, Download, History, Link2, SkipForward, X } from "lucide-react";
import { STAGE_LABELS, failureMessage, findSavedReel, freshReel, mediaRef, normalizeDraft, pickUrl, runReelStep, startSavedReel, timeAgo } from "../lib/reels.js";
import { Button, TextInput } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { useElapsed } from "./useElapsed.js";
import RecentReels from "./RecentReels.jsx";

const VIDEO_KEYS = ["url", "mp4", "videoUrl", "video", "file", "result"];

const LOOKUP_DELAY_MS = 350;

// Finds this link among saved reels as it's typed or pasted, so it can be continued on any device.
function useSavedMatch(value) {
  const [match, setMatch] = useState(null);
  useEffect(() => {
    setMatch(null);
    if (!/^https?:\/\/\S+$/i.test(value)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findSavedReel(value, { signal: controller.signal })
        .then(({ draft }) => setMatch(draft))
        .catch(() => {});
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  return match;
}

export default function ReelStep({ draft, update, go, resume, onDeleted }) {
  const { toast } = useFeedback();
  const [url, setUrl] = useState(draft.reelUrl);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const elapsed = useElapsed(loading);

  useEffect(() => () => controller.current?.abort(), []);

  const value = url.trim();
  const sameAsLoaded = draft.video && value === draft.reelUrl;
  const saved = useSavedMatch(value);
  const savedElsewhere = saved && saved.id !== draft.id ? saved : null;
  const [resuming, setResuming] = useState(false);

  const continueSaved = async () => {
    setResuming(true);
    try {
      await resume(savedElsewhere.id);
    } catch (err) {
      toast(`Couldn't open the saved reel. ${failureMessage(err)}`, "error");
      setResuming(false);
    }
  };
  const canPaste = Boolean(navigator.clipboard?.readText);

  const paste = async () => {
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      if (pasted) {
        setUrl(pasted);
        setError("");
      }
    } catch {
      toast("The browser didn't allow reading the clipboard. Paste into the field instead.", "error");
    }
  };

  const download = async () => {
    if (!/^https?:\/\//i.test(value)) return setError("Paste the full reel link, starting with https://");
    setError("");
    setLoading(true);
    controller.current = new AbortController();
    try {
      const result = await runReelStep("download", { url: value }, { signal: controller.current.signal });
      const videoUrl = pickUrl(result, VIDEO_KEYS);
      if (!videoUrl) throw new Error("The download workflow finished but returned no video URL. Its Output step must return { url }.");
      const video = { url: videoUrl, ref: mediaRef(result), duration: null };
      const stored = await startSavedReel(value, video).catch((err) => {
        if (err.code !== "no_database") toast(`The video is ready, but it couldn't be saved to Recent. ${failureMessage(err)}`, "error");
        return null;
      });
      // The same reel keeps its frame, matches and form, here or from its saved copy, until it's posted.
      const keepsLocal = draft.reelUrl === value && !draft.post;
      update((current) => {
        if (current.reelUrl === value && !current.post) return { id: stored?.id ?? current.id, reelUrl: value, video };
        if (stored) return { ...normalizeDraft(stored.draft), id: stored.id, searchedFrame: null, customImage: null };
        return { ...freshReel(), id: null, reelUrl: value, video };
      });
      toast(!keepsLocal && stored?.resumed ? "Video ready · picked up where you left off" : "Video ready");
      go("frame");
    } catch (err) {
      const message = failureMessage(err);
      if (message) setError(message);
    } finally {
      setLoading(false);
    }
  };

  const looksLikeInstagram = !value || /instagram\.com|instagr\.am/i.test(value);

  return (
    <div className="reel-start-wrap">
      <div className="reel-card reel-start">
        <span className="reel-start-icon" aria-hidden="true">
          <Link2 size={22} strokeWidth={1.5} />
        </span>
        <h2>Paste the reel link</h2>
        <p className="reel-lead">The download workflow turns it into an .mp4 you can scrub through and pick a frame from.</p>

        <form
          className="reel-start-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) download();
          }}
        >
          <Field
            label="Instagram reel URL"
            htmlFor="reelUrl"
            error={error}
            hint={looksLikeInstagram ? "e.g. https://www.instagram.com/reel/…" : "This isn't an Instagram link. It still runs, if your workflow handles it."}
            actions={
              canPaste && (
                <Button variant="ghost" size="sm" icon={ClipboardPaste} onClick={paste} disabled={loading}>
                  Paste
                </Button>
              )
            }
          >
            <TextInput
              id="reelUrl"
              mono
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.instagram.com/reel/…"
              value={url}
              disabled={loading}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
            />
          </Field>

          {savedElsewhere && !loading && (
            <div className="reel-saved" role="status">
              <History size={16} strokeWidth={1.75} />
              <span>
                <span className="reel-status-title">{savedElsewhere.stage === "share" || savedElsewhere.stage === "shared" ? "Already posted" : "You started this reel before"}</span>
                <span className="reel-status-sub">
                  {STAGE_LABELS[savedElsewhere.stage]} · {timeAgo(savedElsewhere.updatedAt)}
                </span>
              </span>
              <Button size="sm" icon={ArrowRight} onClick={continueSaved} loading={resuming}>
                Continue
              </Button>
            </div>
          )}

          <div className="reel-actions">
            {loading ? (
              <>
                <span className="reel-progress mono" role="status">
                  Downloading… {elapsed}s
                </span>
                <Button variant="ghost" icon={X} onClick={() => controller.current?.abort()}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {sameAsLoaded ? (
                  <Button icon={ArrowRight} onClick={() => go("frame")}>
                    Continue with loaded video
                  </Button>
                ) : (
                  <Button variant="ghost" icon={SkipForward} onClick={() => go("post")}>
                    Skip to post
                  </Button>
                )}
                <Button type="submit" variant="primary" icon={Download} disabled={!value}>
                  {sameAsLoaded ? "Download again" : "Get video"}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
      <RecentReels currentId={draft.id} onOpen={resume} onDeleted={onDeleted} />
    </div>
  );
}
