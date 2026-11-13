import { useState } from "react";
import { Link } from "react-router";
import { Check, CircleCheck, Copy, ExternalLink, PencilLine, Send } from "lucide-react";
import { absoluteUrl, failureMessage, runReelStep } from "../lib/reels.js";
import { postPath } from "../lib/content.js";
import { Button, TextInput, Tip } from "../ui/controls.jsx";
import { Field, TextArea } from "../ui/form.jsx";
import { useFeedback } from "../ui/overlays.jsx";

const REQUIRED = { message: "Write the message to send.", linkName: "Name the link button.", linkUrl: "Add the link the button opens." };

export default function ShareStep({ draft, update, onClose }) {
  const { toast } = useFeedback();
  const { post } = draft;
  const share = draft.share || {};
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const videoUrl = absoluteUrl(draft.video?.url);
  const isPrivateFile = draft.video?.url?.startsWith("/media/");

  const set = (patch) => {
    update((current) => ({ share: { ...current.share, ...patch } }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  const send = async () => {
    const missing = Object.fromEntries(Object.entries(REQUIRED).filter(([key]) => !String(share[key] || "").trim()));
    if (Object.keys(missing).length) return setErrors(missing);
    setSending(true);
    try {
      await runReelStep("notify", {
        videoUrl,
        message: share.message.trim(),
        linkName: share.linkName.trim(),
        linkUrl: share.linkUrl.trim(),
        ...(draft.video?.ref ? { video: draft.video.ref } : {}),
      });
      set({ sent: true });
      toast("Notification sent to Telegram");
    } catch (err) {
      toast(`Notification failed. ${failureMessage(err)}`, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reel-share">
      <div className="reel-card reel-done">
        <CircleCheck size={36} strokeWidth={1.5} className="reel-done-icon" />
        <h2>Post created</h2>
        <p className="reel-lead">{post.title}</p>
        <div className="reel-done-link">
          {post.link ? (
            <>
              <a href={post.link} target="_blank" rel="noopener noreferrer" className="mono">
                {post.link.replace(/^https?:\/\//, "")}
              </a>
              <Tip label="Copy link">
                <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy link" onClick={() => copy(post.link)} />
              </Tip>
              <Tip label="Open">
                <a className="btn btn-ghost btn-sm btn-icon" href={post.link} target="_blank" rel="noopener noreferrer" aria-label="Open post">
                  <ExternalLink size={14} strokeWidth={1.75} />
                </a>
              </Tip>
            </>
          ) : (
            <span className="mono muted">/r/{post.postTag}</span>
          )}
        </div>
        <Link to={postPath(post.postTag)} className="details-back">
          <PencilLine size={14} strokeWidth={1.75} />
          Edit post in Content
        </Link>
      </div>

      <form
        className="reel-card reel-notify"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sending) send();
        }}
      >
        <div className="reel-notify-head">
          <h3>Send Telegram notification</h3>
          {share.sent && (
            <span className="reel-fact is-ok">
              <Check size={14} strokeWidth={2} />
              Sent
            </span>
          )}
        </div>

        <Field label="Video" hint={isPrivateFile ? "Saved on this server behind sign-in. The workflow also gets the file as video, so it can upload it itself." : "The .mp4 from the download step"}>
          <TextInput mono value={videoUrl} readOnly className="is-readonly" aria-label="Video URL" />
        </Field>

        <Field label="Message" htmlFor="message" error={errors.message}>
          <TextArea id="message" rows={4} value={share.message || ""} onChange={(e) => set({ message: e.target.value, sent: false })} />
        </Field>

        <div className="form-grid">
          <Field label="Link button text" htmlFor="linkName" error={errors.linkName}>
            <TextInput id="linkName" value={share.linkName || ""} onChange={(e) => set({ linkName: e.target.value, sent: false })} />
          </Field>
          <Field label="Link URL" htmlFor="linkUrl" error={errors.linkUrl} hint={post.link ? undefined : "Set SITE_URL in .env to fill this in."}>
            <TextInput id="linkUrl" mono inputMode="url" value={share.linkUrl || ""} onChange={(e) => set({ linkUrl: e.target.value, sent: false })} placeholder="https://" />
          </Field>
        </div>

        <div className="reel-actions reel-footer">
          <Button type="submit" variant={share.sent ? "secondary" : "primary"} icon={Send} loading={sending}>
            {share.sent ? "Send again" : "Send notification"}
          </Button>
          <div className="spacer" />
          <Button variant={share.sent ? "primary" : "ghost"} icon={Check} onClick={onClose} disabled={sending}>
            Done
          </Button>
        </div>
      </form>
    </div>
  );
}
