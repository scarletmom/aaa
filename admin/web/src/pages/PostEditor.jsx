import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Popover } from "radix-ui";
import { ArrowLeft, Copy, CopyPlus, Ellipsis, ExternalLink, Eye, EyeOff, History, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { duplicatePath, formatCount, formatDate, formatDuration, loadSite, postPath, publicPostUrl, uniqueTag } from "../lib/content.js";
import { Button, TextInput, Tip } from "../ui/controls.jsx";
import { Field, TextArea } from "../ui/form.jsx";
import { CategorySelect, NO_CATEGORY } from "../ui/categories.jsx";
import { RealUrlField } from "../ui/RealUrlField.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { SetupNotice, Thumb, isSetupError } from "../ui/site.jsx";

const EMPTY = { postTag: "", title: "", description: "", thumbnail: "", realUrl: "", realUrlType: "player", categoryId: NO_CATEGORY, duration: "" };

function toForm(post) {
  return {
    postTag: post.postTag,
    title: post.title,
    description: post.description,
    thumbnail: post.thumbnail || "",
    realUrl: post.realUrl || "",
    realUrlType: post.realUrlType || "player",
    categoryId: post.categoryId ? String(post.categoryId) : NO_CATEGORY,
    duration: formatDuration(post.durationSeconds),
  };
}

function ReusePicker({ posts, onPick }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const matches = posts.filter((post) => !needle || `${post.title} ${post.description}`.toLowerCase().includes(needle)).slice(0, 50);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="sm" icon={History}>
          Reuse
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu reuse-pop" align="end" sideOffset={6}>
          <TextInput autoFocus placeholder="Search previous posts" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="reuse-list">
            {matches.map((post) => (
              <button
                key={post.postTag}
                type="button"
                className="reuse-item"
                onClick={() => {
                  onPick(post);
                  setOpen(false);
                }}
              >
                <span className="reuse-title">{post.title}</span>
                <span className="reuse-desc">{post.description}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="form-hint reuse-empty">No post matches that search</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default function PostEditor() {
  const { tag } = useParams();
  const isNew = !tag;
  const [params] = useSearchParams();
  const from = isNew ? params.get("from") : null;
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [form, setForm] = useState(isNew && !from ? EMPTY : null);
  const [saved, setSaved] = useState(isNew && !from ? EMPTY : null);
  const [post, setPost] = useState(null);
  const [source, setSource] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [site, setSite] = useState({});
  const [allPosts, setAllPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const autoTag = useRef(isNew);

  useEffect(() => {
    const fail = (err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error"));
    loadSite().then(setSite).catch(() => {});
    const postsLoad = api("/api/posts").then((list) => {
      setAllPosts(list);
      return list;
    });
    api("/api/categories").then(setCategories).catch(fail);

    if (from) {
      Promise.all([postsLoad, api(`/api/posts/${encodeURIComponent(from)}`)])
        .then(([list, original]) => {
          const copy = { ...toForm(original), postTag: uniqueTag(original.title, new Set(list.map((p) => p.postTag))) };
          autoTag.current = true;
          setSource(original);
          setForm(copy);
          setSaved(copy);
          setErrors({});
        })
        .catch((err) => {
          setForm(EMPTY);
          setSaved(EMPTY);
          if (err.status === 404) toast("The post to duplicate no longer exists", "error");
          else fail(err);
        });
      return;
    }

    postsLoad.catch(fail);
    if (isNew) return;
    api(`/api/posts/${encodeURIComponent(tag)}`)
      .then((loaded) => {
        setPost(loaded);
        setForm(toForm(loaded));
        setSaved(toForm(loaded));
      })
      .catch((err) => {
        if (err.status === 404) {
          toast("That post no longer exists", "error");
          navigate("/content", { replace: true });
        } else fail(err);
      });
  }, [tag, from]);

  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const taken = useMemo(() => new Set(allPosts.map((p) => p.postTag)), [allPosts]);

  const set = (patch) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (autoTag.current && "title" in patch) next.postTag = uniqueTag(next.title, taken);
      return next;
    });
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
      const result = isNew
        ? await api("/api/posts", { method: "POST", body })
        : await api(`/api/posts/${encodeURIComponent(tag)}`, { method: "PUT", body });
      setPost(result);
      setForm(toForm(result));
      setSaved(toForm(result));
      setErrors({});
      toast(isNew ? `Created “${result.title}”` : "Changes saved");
      if (isNew) navigate(postPath(result.postTag), { replace: true });
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (enabled) => {
    try {
      await api(`/api/posts/${encodeURIComponent(tag)}/enabled`, { method: "POST", body: { enabled } });
      setPost((current) => ({ ...current, enabled }));
      toast(enabled ? "Post is live again" : "Post is disabled and now returns 404");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${post.title}”`,
      description: `The video page for ${post.postTag} stops working and its views are lost. This can't be undone.`,
      confirmLabel: "Delete post",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/posts/${encodeURIComponent(tag)}`, { method: "DELETE" });
      toast(`Deleted “${post.title}”`);
      setSaved(form);
      navigate("/content");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link", "error");
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

  const tagForLink = isNew ? form.postTag : tag;
  const url = publicPostUrl(site.siteUrl, tagForLink);
  const reusable = allPosts.filter((p) => p.postTag !== tag);

  return (
    <div className="home details">
      <div className="details-head">
        <Link to="/content" className="details-back">
          <ArrowLeft size={16} strokeWidth={1.75} />
          Content
        </Link>
        <div className="details-title-row">
          <h1>{isNew ? (source ? "Duplicate post" : "New post") : "Post details"}</h1>
          <div className="spacer" />
          {dirty && <span className="unsaved">Unsaved changes</span>}
          {!isNew && (
            <Menu
              trigger={<Button variant="ghost" icon={Ellipsis} aria-label="More actions" />}
              items={[
                url && { label: "View on site", icon: ExternalLink, onSelect: () => window.open(url, "_blank", "noopener") },
                { label: post?.enabled ? "Disable" : "Enable", icon: post?.enabled ? EyeOff : Eye, onSelect: () => setEnabled(!post?.enabled) },
                { label: "Duplicate", icon: CopyPlus, onSelect: () => navigate(duplicatePath(tag)) },
                "separator",
                { label: "Delete post", icon: Trash2, danger: true, onSelect: remove },
              ]}
            />
          )}
          <Button onClick={() => setForm(saved)} disabled={!dirty || saving}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty && !isNew}>
            {isNew ? "Create post" : "Save"}
          </Button>
        </div>
        {source && (
          <p className="home-sub">
            Copied from “{source.title}”. Change what differs, then create it as a new post.
          </p>
        )}
      </div>

      <form
        className="details-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="details-form">
          <Field label="Title" htmlFor="title" error={errors.title} actions={reusable.length > 0 && <ReusePicker posts={reusable} onPick={(p) => set({ title: p.title, description: p.description })} />}>
            <TextInput id="title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Shown on the card and the gate page" />
          </Field>

          <Field label="Description" htmlFor="description" error={errors.description}>
            <TextArea id="description" rows={5} maxLength={2000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <Field label="Thumbnail URL" htmlFor="thumbnail" error={errors.thumbnail} hint="Optional. Must start with http:// or https://">
            <TextInput id="thumbnail" mono value={form.thumbnail} onChange={(e) => set({ thumbnail: e.target.value })} placeholder="https://" />
          </Field>

          <Field
            label="Category"
            error={errors.categoryId}
            hint={categories.length ? "Optional. The model, author or type this belongs to." : "No categories yet. Pick New category… to add one."}
          >
            <CategorySelect value={form.categoryId} onChange={(value) => set({ categoryId: value })} categories={categories} onCategoriesChange={setCategories} />
          </Field>

          <RealUrlField url={form.realUrl} type={form.realUrlType} onChange={set} error={errors.realUrl} note="It never appears in any page." />

          <div className="form-grid">
            <Field label="Video length" htmlFor="duration" error={errors.duration} hint="e.g. 12:34. Leave blank to read it from the .m3u8 on save.">
              <TextInput id="duration" mono value={form.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Auto" />
            </Field>

            <Field
              label="Post tag"
              htmlFor="postTag"
              error={errors.postTag}
              hint={isNew ? "Filled from the title. Edit it to override." : "The link can't change once a post exists."}
              actions={
                isNew && (
                  <Tip label="Build it from the title again">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={RefreshCw}
                      aria-label="Generate from title"
                      onClick={() => {
                        autoTag.current = true;
                        set({ postTag: uniqueTag(form.title, taken) });
                      }}
                    />
                  </Tip>
                )
              }
            >
              <div className={`field-box text-input prefixed${isNew ? "" : " is-readonly"}`}>
                <span className="mono muted">?v=</span>
                <input
                  id="postTag"
                  className="mono"
                  value={form.postTag}
                  readOnly={!isNew}
                  maxLength={64}
                  spellCheck={false}
                  onChange={(e) => {
                    autoTag.current = false;
                    set({ postTag: e.target.value });
                  }}
                />
              </div>
            </Field>
          </div>
          <button type="submit" hidden />
        </div>

        <aside className="details-side">
          <div className="preview-card">
            <Thumb src={form.thumbnail} duration={post?.durationSeconds} size="lg" />
            <div className="preview-meta">
              <span className="preview-label">Link</span>
              <div className="preview-link">
                {url ? (
                  <a href={isNew ? undefined : url} target="_blank" rel="noopener noreferrer" className="mono">
                    {url.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  <span className="mono">?v={tagForLink || "…"}</span>
                )}
                {url && !isNew && (
                  <Tip label="Copy link">
                    <button type="button" className="row-icon" aria-label="Copy link" onClick={() => copyLink(url)}>
                      <Copy size={16} strokeWidth={1.5} />
                    </button>
                  </Tip>
                )}
              </div>
              {!isNew && post && (
                <dl className="preview-facts">
                  <div>
                    <dt>Visibility</dt>
                    <dd>
                      <span className={`visibility${post.enabled ? " is-live" : ""}`}>
                        <span className="dot" />
                        {post.enabled ? "Live" : "Disabled"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Views</dt>
                    <dd className="mono">{formatCount(post.views)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(post.createdAt)}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
