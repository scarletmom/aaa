import { useEffect, useState } from "react";
import { ArrowLeft, ImageUp, RefreshCw, Save } from "lucide-react";
import { api } from "../lib/api.js";
import { loadSite, publicPostUrl, uniqueTag } from "../lib/content.js";
import { failureMessage, fieldErrors, runReelStep } from "../lib/reels.js";
import { Button, TextInput, Tip } from "../ui/controls.jsx";
import { Field, TextArea } from "../ui/form.jsx";
import { CategorySelect, NO_CATEGORY } from "../ui/categories.jsx";
import { RealUrlField } from "../ui/RealUrlField.jsx";
import { useFeedback } from "../ui/overlays.jsx";
import { Thumb } from "../ui/site.jsx";
import { useElapsed } from "./useElapsed.js";
import { DeviceImageButton, ThumbnailChooser, useThumbnailUpload } from "./thumbnails.jsx";

const REQUIRED = { title: "Title is required.", description: "Description is required.", realUrl: "Real URL is required." };

export default function PostStep({ draft, update, go, back }) {
  const { toast } = useFeedback();
  const form = draft.form;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [site, setSite] = useState({});
  const [categories, setCategories] = useState([]);
  const [taken, setTaken] = useState(new Set());
  const elapsed = useElapsed(saving);
  const { uploading, uploadFile } = useThumbnailUpload(update);
  const selectedUpload = draft.thumbnails.find((t) => t.url === form.thumbnail);

  useEffect(() => {
    loadSite().then(setSite).catch(() => {});
    api("/api/categories").then(setCategories).catch(() => {});
    api("/api/posts")
      .then((posts) => setTaken(new Set(posts.map((post) => post.postTag))))
      .catch(() => {});
  }, []);

  // The title can arrive from the chosen match, and the taken tags load late, so rebuild the auto tag for both.
  useEffect(() => {
    if (draft.autoTag && form.title) set({ postTag: uniqueTag(form.title, taken) });
  }, [taken]);

  function set(patch) {
    update((current) => {
      const next = { ...current.form, ...patch };
      if (current.autoTag && "title" in patch) next.postTag = uniqueTag(next.title, taken);
      return { form: next };
    });
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  }

  const save = async () => {
    const missing = Object.fromEntries(Object.entries(REQUIRED).filter(([key]) => !String(form[key] || "").trim()));
    if (Object.keys(missing).length) {
      setErrors(missing);
      return toast("Fill in the required fields", "error");
    }
    setSaving(true);
    try {
      const post = await runReelStep("post", {
        title: form.title.trim(),
        description: form.description.trim(),
        realUrl: form.realUrl.trim(),
        realUrlType: form.realUrlType || "player",
        thumbnail: form.thumbnail.trim(),
        category: form.categoryId === NO_CATEGORY ? "" : form.categoryId,
        duration: form.duration.trim(),
        postTag: form.postTag.trim(),
      });
      const postTag = post.postTag || post.tag || form.postTag;
      if (!postTag) throw new Error("The post workflow finished but returned no postTag.");
      const link = post.viewUrl || publicPostUrl(site.siteUrl, postTag);
      update({
        post: { postTag, title: post.title || form.title, link },
        share: { message: post.title || form.title, linkName: "Watch now", linkUrl: link, sent: false },
      });
      toast(`Created “${post.title || form.title}”`);
      go("share");
    } catch (err) {
      const fields = fieldErrors(err.message);
      if (Object.keys(fields).length) setErrors(fields);
      toast(`Couldn't create the post. ${failureMessage(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="reel-post"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) save();
      }}
    >
      <div className="details-body reel-post-body">
        <div className="details-form">
          <Field label="Title" htmlFor="title" error={errors.title}>
            <TextInput id="title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Shown on the card and the gate page" />
          </Field>

          <Field label="Description" htmlFor="description" error={errors.description}>
            <TextArea id="description" rows={4} maxLength={2000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <Field
            label="Thumbnail"
            htmlFor="thumbnail"
            error={errors.thumbnail}
            hint={
              selectedUpload
                ? `Using ${selectedUpload.label}. Pick another above, or paste any image URL.`
                : draft.thumbnails.length
                  ? "Pick one of your uploads above, or paste any image URL."
                  : "Optional. Upload a frame or an image, or paste an image URL."
            }
            actions={
              <>
                <Button variant="ghost" size="sm" icon={ImageUp} onClick={() => go("frame")} disabled={Boolean(uploading)}>
                  Pick a frame
                </Button>
                <DeviceImageButton variant="ghost" size="sm" onFile={uploadFile} loading={uploading === "device"} disabled={Boolean(uploading)}>
                  Upload image
                </DeviceImageButton>
              </>
            }
          >
            <ThumbnailChooser thumbnails={draft.thumbnails} selected={form.thumbnail} onSelect={(url) => set({ thumbnail: url })} />
            <TextInput id="thumbnail" mono value={form.thumbnail} onChange={(e) => set({ thumbnail: e.target.value })} placeholder="https://" />
          </Field>

          <Field label="Category" error={errors.category} hint={categories.length ? "Optional" : "No categories yet. Pick New category… to add one."}>
            <CategorySelect value={form.categoryId} onChange={(value) => set({ categoryId: value })} categories={categories} onCategoriesChange={setCategories} />
          </Field>

          <RealUrlField url={form.realUrl} type={form.realUrlType || "player"} onChange={set} error={errors.realUrl} note="Filled from the match you chose." />

          <div className="form-grid">
            <Field label="Video length" htmlFor="duration" error={errors.duration} hint="e.g. 12:34. Blank reads it from an .m3u8.">
              <TextInput id="duration" mono value={form.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Auto" />
            </Field>

            <Field
              label="Post tag"
              htmlFor="postTag"
              error={errors.postTag}
              hint="Filled from the title. Edit it to override."
              actions={
                <Tip label="Build it from the title again">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={RefreshCw}
                    aria-label="Generate from title"
                    onClick={() => {
                      update({ autoTag: true });
                      set({ postTag: uniqueTag(form.title, taken) });
                    }}
                  />
                </Tip>
              }
            >
              <div className="field-box text-input prefixed">
                <span className="mono muted">/r/</span>
                <input
                  id="postTag"
                  className="mono"
                  value={form.postTag}
                  maxLength={64}
                  spellCheck={false}
                  onChange={(e) => {
                    update({ autoTag: false });
                    set({ postTag: e.target.value });
                  }}
                />
              </div>
            </Field>
          </div>
        </div>

        <aside className="details-side">
          <div className="preview-card">
            <Thumb src={form.thumbnail} duration={Math.round(draft.video?.duration || 0)} size="lg" />
            <div className="preview-meta">
              <span className="preview-label">Preview</span>
              <strong className="reel-preview-title">{form.title || "Untitled"}</strong>
              <span className="preview-link">
                <span className="mono">
                  {(site.siteUrl || "").replace(/^https?:\/\//, "")}/r/{form.postTag || "…"}
                </span>
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="reel-actions reel-footer">
        <Button variant="ghost" icon={ArrowLeft} onClick={back} disabled={saving}>
          Back
        </Button>
        <div className="spacer" />
        {saving && <span className="reel-progress mono">Saving… {elapsed}s</span>}
        <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={Boolean(uploading)}>
          Save post
        </Button>
      </div>
    </form>
  );
}
