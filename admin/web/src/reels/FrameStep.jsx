import { useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, ImageUp, Pause, Play, ScanFace, SkipForward, Volume2, VolumeX } from "lucide-react";
import { captureFrame, failureMessage, formatClock, matchGroups, runReelStep } from "../lib/reels.js";
import { formatDuration } from "../lib/content.js";
import { Button, Tip } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { useElapsed } from "./useElapsed.js";
import { DeviceImageButton, useThumbnailUpload } from "./thumbnails.jsx";

const FRAME_SECONDS = 1 / 30;

export default function FrameStep({ draft, update, go, back }) {
  const { toast } = useFeedback();
  const videoRef = useRef(null);
  const [duration, setDuration] = useState(draft.video.duration || 0);
  const [time, setTime] = useState(draft.frameTime || 0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const { uploading, upload, uploadFile } = useThumbnailUpload(update);
  const busy = searching ? "details" : uploading;
  const elapsed = useElapsed(Boolean(busy));
  const src = draft.video.url;

  const onLoaded = (e) => {
    const video = e.currentTarget;
    const length = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(length);
    if (draft.frameTime) video.currentTime = Math.min(draft.frameTime, length);
    // The reel's length fills the post's Video length, unless it was typed in already.
    update((current) => ({
      video: { ...current.video, duration: length },
      form: current.form.duration ? current.form : { ...current.form, duration: formatDuration(Math.round(length)) },
    }));
  };

  const seek = (value) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const next = Math.min(Math.max(value, 0), duration || 0);
    video.currentTime = next;
    setTime(next);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const capture = async () => {
    const frame = await captureFrame(videoRef.current, src);
    update({ frameTime: frame.time });
    return frame;
  };

  const uploadThumbnail = () => upload("frame", capture, (frame) => `Frame ${formatClock(frame.time)}`);

  const findDetails = async () => {
    setSearching(true);
    try {
      const frame = await capture();
      const result = await runReelStep("facedigger", { image: frame.file });
      update({ matches: matchGroups(result), chosen: null, searchedFrame: frame.dataUrl, searchedTime: frame.time });
      go("details");
    } catch (err) {
      toast(`Finding details failed. ${failureMessage(err)}`, "error");
    } finally {
      setSearching(false);
    }
  };

  const matchCount = draft.matches?.reduce((sum, group) => sum + group.results.length, 0);
  const progress = duration ? (time / duration) * 100 : 0;
  const selected = draft.thumbnails.find((t) => t.url === draft.form.thumbnail);
  const uploads = draft.thumbnails.length;
  const canCapture = !busy && !failed && Boolean(duration);
  const skipLabel = draft.matches ? "Go to details" : "Skip to post";
  const skip = () => go(draft.matches ? "details" : "post");

  return (
    <div className="reel-split">
      <div className="reel-card reel-player-card">
        <div className="reel-player">
          {failed ? (
            <div className="reel-player-error">
              <p>This video can't play in the browser.</p>
              <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <ExternalLink size={14} strokeWidth={1.75} />
                Open video
              </a>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={src}
              playsInline
              muted={muted}
              preload="auto"
              onClick={togglePlay}
              onLoadedMetadata={onLoaded}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={(e) => {
                setPlaying(false);
                update({ frameTime: e.currentTarget.currentTime });
              }}
              onSeeked={(e) => update({ frameTime: e.currentTarget.currentTime })}
              onError={() => setFailed(true)}
            />
          )}
          {busy && (
            <div className="reel-player-busy" role="status">
              <span className="reel-progress mono">
                {busy === "details" ? "Searching" : "Uploading thumbnail"}… {elapsed}s
              </span>
            </div>
          )}
        </div>

        <div className="reel-scrub">
          <input
            type="range"
            className="reel-slider"
            min={0}
            max={duration || 0}
            step={FRAME_SECONDS}
            value={Math.min(time, duration || 0)}
            disabled={!duration || failed}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ "--progress": `${progress}%` }}
            aria-label="Choose frame"
          />
          <div className="reel-scrub-row">
            <Tip label={playing ? "Pause" : "Play"}>
              <Button variant="ghost" size="sm" icon={playing ? Pause : Play} onClick={togglePlay} disabled={failed} aria-label={playing ? "Pause" : "Play"} />
            </Tip>
            <Tip label="Previous frame">
              <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => seek(time - FRAME_SECONDS)} disabled={failed} aria-label="Previous frame" />
            </Tip>
            <span className="reel-clock mono">
              {formatClock(time)} <span className="muted">/ {formatClock(duration)}</span>
            </span>
            <Tip label="Next frame">
              <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => seek(time + FRAME_SECONDS)} disabled={failed} aria-label="Next frame" />
            </Tip>
            <Tip label={muted ? "Unmute" : "Mute"}>
              <Button variant="ghost" size="sm" icon={muted ? VolumeX : Volume2} onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} />
            </Tip>
          </div>
        </div>
      </div>

      <aside className="reel-side">
        <div className="reel-card reel-side-card">
          <h3>Choose a frame</h3>
          <p className="reel-lead">Slide to the frame you want. Upload it as the thumbnail, search it for details, or both, using the same frame or different ones.</p>

          <div className="reel-status-list">
            <div className="reel-status">
              <span className={`reel-status-thumb${draft.form.thumbnail ? "" : " is-empty"}`}>
                {draft.form.thumbnail && <img src={draft.form.thumbnail} alt="" referrerPolicy="no-referrer" />}
              </span>
              <span>
                <span className="reel-status-title">Thumbnail</span>
                <span className="reel-status-sub">
                  {selected ? selected.label : draft.form.thumbnail ? "Your own URL" : "Not uploaded yet"}
                  {uploads > 1 && ` · ${uploads} uploaded, pick one on Post`}
                </span>
              </span>
            </div>
            {draft.matches && (
              <button type="button" className="reel-status is-link" onClick={() => go("details")}>
                <span className="reel-status-thumb">{draft.searchedFrame && <img src={draft.searchedFrame} alt="" />}</span>
                <span>
                  <span className="reel-status-title">Details</span>
                  <span className="reel-status-sub">
                    {matchCount} {matchCount === 1 ? "match" : "matches"}
                    {draft.searchedTime != null ? ` from ${formatClock(draft.searchedTime)}` : ""}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={1.75} className="muted" />
              </button>
            )}
          </div>

          <div className="reel-side-actions reel-wide-only">
            <Button icon={ImageUp} onClick={uploadThumbnail} loading={uploading === "frame"} disabled={!canCapture}>
              {uploads ? "Upload this frame instead" : "Upload for thumbnail"}
            </Button>
            <Button variant="primary" icon={ScanFace} onClick={findDetails} loading={busy === "details"} disabled={!canCapture}>
              Find details
            </Button>
          </div>
          <DeviceImageButton variant="ghost" className="reel-device-btn" onFile={uploadFile} loading={uploading === "device"} disabled={Boolean(busy)}>
            Or upload an image from device
          </DeviceImageButton>
          <Button variant="ghost" icon={SkipForward} className="reel-narrow-only reel-skip" onClick={skip} disabled={Boolean(busy)}>
            {skipLabel}
          </Button>
        </div>
      </aside>

      <div className="reel-actions reel-footer">
        <Button variant="ghost" icon={ArrowLeft} onClick={back} disabled={Boolean(busy)}>
          Back
        </Button>
        <div className="spacer" />
        <Button variant="ghost" icon={SkipForward} className="reel-wide-only" onClick={skip} disabled={Boolean(busy)}>
          {skipLabel}
        </Button>
        <Button icon={ImageUp} className="reel-narrow-only" onClick={uploadThumbnail} loading={uploading === "frame"} disabled={!canCapture}>
          Thumbnail
        </Button>
        <Button variant="primary" icon={ScanFace} className="reel-narrow-only" onClick={findDetails} loading={busy === "details"} disabled={!canCapture}>
          Find details
        </Button>
      </div>
    </div>
  );
}
