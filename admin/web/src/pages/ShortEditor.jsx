import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ellipsis, Eye, EyeOff, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { formatDate, formatDuration, shortPath } from "../lib/content.js";
import { Button, TextInput } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { CategorySelect, NO_CATEGORY } from "../ui/categories.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError } from "../ui/site.jsx";

const EMPTY = { title: "", videoUrl: "", thumbnail: "", categoryId: NO_CATEGORY, duration: "" };

function toForm(short) {
  return {
    title: short.title,
    videoUrl: short.videoUrl,
    thumbnail: short.thumbnail || "",
    categoryId: short.categoryId ? String(short.categoryId) : NO_CATEGORY,
    duration: formatDuration(short.durationSeconds),
  };
}

export default function ShortEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [saved, setSaved] = useState(isNew ? EMPTY : null);
  const [short, setShort] = useState(null);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    const fail = (err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error"));
    api("/api/categories").then(setCategories).catch(fail);
    if (isNew) return;
    api(`/api/shorts/${id}`)
      .then((loaded) => {
        setShort(loaded);
        setForm(toForm(loaded));
        setSaved(toForm(loaded));
      })
      .catch((err) => {
        if (err.status === 404) {
          toast("That short no longer exists", "error");
          navigate("/shorts", { replace: true });
        } else fail(err);
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
      const body = { ...form, categoryId: form.categoryId === NO_CATEGORY ? null : form.categoryId };
      const result = isNew ? await api("/api/shorts", { method: "POST", body }) : await api(`/api/shorts/${id}`, { method: "PUT", body });
      setShort(result);
      setForm(toForm(result));
      setSaved(toForm(result));
      setErrors({});
      toast(isNew ? `Created “${result.title}”` : "Changes saved");
      if (isNew) navigate(shortPath(result.id), { replace: true });
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (enabled) => {
    try {
      await api(`/api/shorts/${id}/enabled`, { method: "POST", body: { enabled } });
      setShort((current) => ({ ...current, enabled }));
      toast(enabled ? "Short is live" : "Short is hidden from the site");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${short.title}”`,
      description: "It leaves the Shorts shelf and feed. This can't be undone.",
      confirmLabel: "Delete short",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/shorts/${id}`, { method: "DELETE" });
      toast(`Deleted “${short.title}”`);
      setSaved(form);
      navigate("/shorts");
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
        <Link to="/shorts" className="details-back">
          <ArrowLeft size={16} strokeWidth={1.75} />
          Shorts
        </Link>
        <div className="details-title-row">
          <h1>{isNew ? "New short" : "Short details"}</h1>
          <div className="spacer" />
          {dirty && <span className="unsaved">Unsaved changes</span>}
          {!isNew && short && (
            <Menu
              trigger={<Button variant="ghost" icon={Ellipsis} aria-label="More actions" />}
              items={[
                { label: short.enabled ? "Disable" : "Enable", icon: short.enabled ? EyeOff : Eye, onSelect: () => setEnabled(!short.enabled) },
                "separator",
                { label: "Delete short", icon: Trash2, danger: true, onSelect: remove },
              ]}
            />
          )}
          <Button onClick={() => setForm(saved)} disabled={!dirty || saving}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty && !isNew}>
            {isNew ? "Create short" : "Save"}
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
            <TextInput id="title" value={form.title} maxLength={255} onChange={(e) => set({ title: e.target.value })} placeholder="Shown under the short" />
          </Field>

          <Field label="Video URL" htmlFor="videoUrl" error={errors.videoUrl} hint="The clip itself: an .mp4, .m3u8 (HLS) or .mpd (DASH) link. Viewers' browsers load it directly.">
            <TextInput id="videoUrl" mono value={form.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://" />
          </Field>

          <Field label="Thumbnail URL" htmlFor="thumbnail" error={errors.thumbnail} hint="Optional. A vertical (9:16) picture works best.">
            <TextInput id="thumbnail" mono value={form.thumbnail} onChange={(e) => set({ thumbnail: e.target.value })} placeholder="https://" />
          </Field>

          <Field label="Category" error={errors.categoryId} hint={categories.length ? "Optional. Its name and picture show beside the short." : "No categories yet. Pick New category… to add one."}>
            <CategorySelect value={form.categoryId} onChange={(value) => set({ categoryId: value })} categories={categories} onCategoriesChange={setCategories} />
          </Field>

          <Field label="Length" htmlFor="duration" error={errors.duration} hint="e.g. 0:45. Leave blank to read it from an .m3u8 on save.">
            <TextInput id="duration" mono value={form.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Auto" />
          </Field>
          <button type="submit" hidden />
        </div>

        <aside className="details-side">
          <div className="preview-card preview-short">
            <Thumb src={form.thumbnail} duration={short?.durationSeconds} size="short-lg" />
            {!isNew && short && (
              <div className="preview-meta">
                <dl className="preview-facts">
                  <div>
                    <dt>Visibility</dt>
                    <dd>
                      <span className={`visibility${short.enabled ? " is-live" : ""}`}>
                        <span className="dot" />
                        {short.enabled ? "Live" : "Disabled"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(short.createdAt)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
