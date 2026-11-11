import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ellipsis, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { categoryPath } from "../lib/content.js";
import { Button, Checkbox, Switch, TextInput } from "../ui/controls.jsx";
import { Field } from "../ui/form.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { CategoryAvatar, SetupNotice, isSetupError } from "../ui/site.jsx";

const EMPTY = { name: "", avatar: "", postTags: [] };
const sameForm = (a, b) => a.name === b.name && a.avatar === b.avatar && [...a.postTags].sort().join() === [...b.postTags].sort().join();

export default function CategoryEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [saved, setSaved] = useState(isNew ? EMPTY : null);
  const [posts, setPosts] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    const fail = (err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error"));
    api("/api/posts").then(setPosts).catch(fail);
    if (isNew) return;
    api(`/api/categories/${id}`)
      .then((category) => {
        const loaded = { name: category.name, avatar: category.avatar || "", postTags: category.postTags };
        setForm(loaded);
        setSaved(loaded);
      })
      .catch((err) => {
        if (err.status === 404) {
          toast("That category no longer exists", "error");
          navigate("/categories", { replace: true });
        } else fail(err);
      });
  }, [id]);

  const dirty = form && saved && !sameForm(form, saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selected = useMemo(() => new Set(form?.postTags || []), [form]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (posts || []).filter(
      (post) => (!selectedOnly || selected.has(post.postTag)) && (!needle || `${post.title} ${post.postTag}`.toLowerCase().includes(needle))
    );
  }, [posts, search, selectedOnly, selected]);

  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const toggle = (tag, on) => set({ postTags: on ? [...form.postTags, tag] : form.postTags.filter((t) => t !== tag) });
  const selectShown = (on) => {
    const tags = new Set(form.postTags);
    for (const post of shown) on ? tags.add(post.postTag) : tags.delete(post.postTag);
    set({ postTags: [...tags] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = isNew
        ? await api("/api/categories", { method: "POST", body: form })
        : await api(`/api/categories/${id}`, { method: "PUT", body: form });
      setSaved(form);
      setErrors({});
      toast(isNew ? `Created ${result.name}` : "Changes saved");
      if (isNew) navigate(categoryPath(result.id), { replace: true });
      api("/api/posts").then(setPosts).catch(() => {});
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${saved.name}`,
      description: "Its posts stay live, just uncategorised.",
      confirmLabel: "Delete category",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      toast(`Deleted ${saved.name}`);
      setSaved(form);
      navigate("/categories");
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

  const categoryId = Number(id);
  const allShownSelected = shown.length > 0 && shown.every((post) => selected.has(post.postTag));

  return (
    <div className="home details">
      <div className="details-head">
        <Link to="/categories" className="details-back">
          <ArrowLeft size={16} strokeWidth={1.75} />
          Categories
        </Link>
        <div className="details-title-row">
          <h1>{isNew ? "New category" : "Category details"}</h1>
          <div className="spacer" />
          {dirty && <span className="unsaved">Unsaved changes</span>}
          {!isNew && <Menu trigger={<Button variant="ghost" icon={Ellipsis} aria-label="More actions" />} items={[{ label: "Delete category", icon: Trash2, danger: true, onSelect: remove }]} />}
          <Button onClick={() => setForm(saved)} disabled={!dirty || saving}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty && !isNew}>
            {isNew ? "Create category" : "Save"}
          </Button>
        </div>
      </div>

      <form
        className="details-body details-single"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="details-form">
          <div className="cat-identity">
            <CategoryAvatar key={form.avatar} name={form.name} src={form.avatar} size={72} />
            <div className="cat-identity-fields">
              <Field label="Name" htmlFor="name" error={errors.name}>
                <TextInput id="name" value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Jane Doe, Web, App" />
              </Field>
              <Field label="Picture URL" htmlFor="avatar" error={errors.avatar} hint="Optional. Without one, /r shows the first letter.">
                <TextInput id="avatar" mono value={form.avatar} onChange={(e) => set({ avatar: e.target.value })} placeholder="https://" />
              </Field>
            </div>
          </div>

          <section className="post-picker">
            <div className="post-picker-head">
              <div>
                <h2>Posts</h2>
                <p className="form-hint">
                  <span className="mono">{selected.size}</span> selected. Picking a post from another category moves it here.
                </p>
              </div>
            </div>
            <div className="post-picker-tools">
              <TextInput icon={Search} placeholder="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} className="post-picker-search" />
              <Switch checked={selectedOnly} onChange={setSelectedOnly} label="Selected only" />
              <div className="spacer" />
              <Button variant="ghost" size="sm" onClick={() => selectShown(!allShownSelected)} disabled={!shown.length}>
                {allShownSelected ? "Clear shown" : "Select shown"}
              </Button>
            </div>
            <div className="post-picker-list">
              {posts === null ? (
                <div className="post-picker-empty">Loading posts…</div>
              ) : (
                shown.map((post) => {
                  const elsewhere = post.category && post.category.id !== categoryId;
                  return (
                    <div key={post.postTag} className={`post-picker-row${post.enabled ? "" : " is-off"}`} onClick={() => toggle(post.postTag, !selected.has(post.postTag))}>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(post.postTag)} onChange={(on) => toggle(post.postTag, on)} aria-label={post.title} />
                      </span>
                      <span className="post-picker-text">
                        <span className="post-picker-title">{post.title}</span>
                        <span className="post-picker-tag mono">?v={post.postTag}</span>
                      </span>
                      {elsewhere && <span className="chip">{post.category.name}</span>}
                      {!post.enabled && <span className="chip chip-off">Disabled</span>}
                    </div>
                  );
                })
              )}
              {posts && shown.length === 0 && <div className="post-picker-empty">{selectedOnly ? "No posts selected yet" : "No posts match that search"}</div>}
            </div>
          </section>
          <button type="submit" hidden />
        </div>
      </form>
    </div>
  );
}
