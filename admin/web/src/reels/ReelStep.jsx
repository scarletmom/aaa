import { useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, Download, Link2, X } from "lucide-react";
import { failureMessage, freshReel, mediaRef, pickUrl, runReelStep } from "../lib/reels.js";
import { Button, TextInput } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { useElapsed } from "./useElapsed.js";

const VIDEO_KEYS = ["url", "mp4", "videoUrl", "video", "file", "result"];

export default function ReelStep({ draft, update, go }) {
  const { toast } = useFeedback();
  const [url, setUrl] = useState(draft.reelUrl);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const elapsed = useElapsed(loading);

  useEffect(() => () => controller.current?.abort(), []);

  const value = url.trim();
  const sameAsLoaded = draft.video && value === draft.reelUrl;
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
      update((current) => {
        const sameReel = current.reelUrl === value && current.video?.url === videoUrl;
        return { ...(sameReel ? {} : freshReel()), reelUrl: value, video: { url: videoUrl, ref: mediaRef(result), duration: null } };
      });
      toast("Video ready");
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
              {sameAsLoaded && (
                <Button icon={ArrowRight} onClick={() => go("frame")}>
                  Continue with loaded video
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
  );
}
