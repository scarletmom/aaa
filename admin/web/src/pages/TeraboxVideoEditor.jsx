import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ellipsis, ExternalLink, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { formatDate } from "../lib/content.js";
import { Button, TextInput } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError } from "../ui/site.jsx";

const toForm = (video) => ({
  key: video.key,
  title: video.title,
  teraboxUrl: video.teraboxUrl || "",
  thumbnail: video.thumbnail || "",
  duration: video.duration || "",
});

export default function TeraboxVideoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [video, setVideo] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    api(`/api/terabox-videos/${id}`)
      .then((loaded) => {
        setVideo(loaded);
        setForm(toForm(loaded));
        setSaved(toForm(loaded));
      })
      .catch((err) => {
        if (err.status === 404) {
          toast("That Terabox video no longer exists", "error");
          navigate("/terabox-videos", { replace: true });
        } else if (isSetupError(err)) setSetupNeeded(true);
        else toast(err.message, "error");
      });
  }, [id]);

  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await api(`/api/terabox-videos/${id}`, { method: "PUT", body: form });
      setVideo(result);
      setForm(toForm(result));
      setSaved(toForm(result));
      setErrors({});
      toast(result.public ? "Changes saved" : "Saved. With no Terabox URL it stays off the site.");
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${video.title}”`,
      description: "It leaves the Terabox Videos page. Playing its link again on the site saves it as a new video. This can't be undone.",
      confirmLabel: "Delete video",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/terabox-videos/${id}`, { method: "DELETE" });
      toast(`Deleted “${video.title}”`);
      setSaved(form);
      navigate("/terabox-videos");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (setupNeeded) {
    return (
      <div className="home">
        <SetupNotice />
      </div>
    );
  }

  if (!form) return <div className="home editor-skeleton" />;

  return (
    <div className="home details">
      <div className="details-head">
        <Link to="/terabox-videos" className="details-back">
          <ArrowLeft size={16} strokeWidth={1.75} />
          Terabox videos
        </Link>
        <div className="details-title-row">
          <h1>Terabox video</h1>
          <div className="spacer" />
          {dirty && <span className="unsaved">Unsaved changes</span>}
          <Menu
            trigger={<Button variant="ghost" icon={Ellipsis} aria-label="More actions" />}
            items={[
              video.teraboxUrl && { label: "Open on Terabox", icon: ExternalLink, onSelect: () => window.open(video.teraboxUrl, "_blank", "noopener") },
              video.teraboxUrl && "separator",
              { label: "Delete video", icon: Trash2, danger: true, onSelect: remove },
            ]}
          />
          <Button onClick={() => setForm(saved)} disabled={!dirty || saving}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      <form
        className="details-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="details-form">
          <Field label="Title" htmlFor="title" error={errors.title}>
            <TextInput id="title" value={form.title} maxLength={255} onChange={(e) => set({ title: e.target.value })} />
          </Field>

          <Field
            label="Terabox URL"
            htmlFor="teraboxUrl"
            error={errors.teraboxUrl}
            hint="The share link. Clear it to take the video off the site; it stays here as unfinished."
          >
            <TextInput id="teraboxUrl" mono value={form.teraboxUrl} onChange={(e) => set({ teraboxUrl: e.target.value })} placeholder="https://www.terabox.com/s/1…" />
          </Field>

          <Field label="Thumbnail URL" htmlFor="thumbnail" error={errors.thumbnail} hint="Optional. Must start with http:// or https://">
            <TextInput id="thumbnail" mono value={form.thumbnail} onChange={(e) => set({ thumbnail: e.target.value })} placeholder="https://" />
          </Field>

          <div className="form-grid">
            <Field label="Length" htmlFor="duration" error={errors.duration} hint="Optional, e.g. 04:23.">
              <TextInput id="duration" mono value={form.duration} maxLength={16} onChange={(e) => set({ duration: e.target.value })} />
            </Field>
            <Field label="Key" htmlFor="key" error={errors.key} hint="Unique, e.g. 1767079.">
              <TextInput id="key" mono value={form.key} maxLength={32} onChange={(e) => set({ key: e.target.value })} />
            </Field>
          </div>
          <button type="submit" hidden />
        </div>

        <aside className="details-side">
          <div className="preview-card">
            <Thumb src={form.thumbnail} duration={form.duration} size="lg" />
            <div className="preview-meta">
              <dl className="preview-facts">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`visibility${video.public ? " is-live" : ""}`}>
                      <span className="dot" />
                      {video.public ? "Public" : "Disabled"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(video.createdAt)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
