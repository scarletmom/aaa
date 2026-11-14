import { useId, useRef, useState } from "react";
import { Dialog, Popover } from "radix-ui";
import { Check, ChevronDown, ImageUp, Plus, Search, X } from "lucide-react";
import { api } from "../lib/api.js";
import { Button, TextInput } from "./controls.jsx";
import { Field } from "./form.jsx";
import ImageUploadDialog from "./ImageUploadDialog.jsx";
import { useFeedback } from "./overlays.jsx";
import { CategoryAvatar } from "./site.jsx";

export const NO_CATEGORY = "none";
const NEW_CATEGORY = "__new";
const EMPTY = { name: "", avatar: "" };

export function CategoryIdentity({ form, errors, set, autoFocus = false }) {
  const { toast } = useFeedback();
  const [uploadOpen, setUploadOpen] = useState(false);
  const id = useId();

  return (
    <div className="cat-identity">
      <button type="button" className="cat-avatar-upload" onClick={() => setUploadOpen(true)} aria-label="Upload picture">
        <CategoryAvatar key={form.avatar} name={form.name} src={form.avatar} size={72} />
        <span className="cat-avatar-upload-badge">
          <ImageUp size={14} strokeWidth={1.75} />
        </span>
      </button>
      <div className="cat-identity-fields">
        <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
          <TextInput
            id={`${id}-name`}
            value={form.name}
            maxLength={100}
            autoFocus={autoFocus}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Jane Doe, Web, App"
          />
        </Field>
        <Field label="Picture URL" htmlFor={`${id}-avatar`} error={errors.avatar} hint="Optional. Without one, /r shows the first letter.">
          <div className="input-with-button">
            <TextInput id={`${id}-avatar`} mono value={form.avatar} onChange={(e) => set({ avatar: e.target.value })} placeholder="https://" />
            <Button icon={ImageUp} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          </div>
        </Field>
      </div>
      <ImageUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(url) => {
          set({ avatar: url });
          toast("Picture uploaded");
        }}
      />
    </div>
  );
}

const byName = (a, b) => a.name.localeCompare(b.name);

// The category picker on post forms: searchable, and "New category…" creates one in a modal and selects it.
export function CategorySelect({ value, onChange, categories, onCategoriesChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(null);
  const pendingCreate = useRef(null);
  const list = useRef(null);

  const needle = search.trim().toLowerCase();
  const exact = categories.some((c) => c.name.toLowerCase() === needle);
  const items = [
    ...(needle ? [] : [{ key: NO_CATEGORY, label: "None", muted: true }]),
    ...categories.filter((c) => !needle || c.name.toLowerCase().includes(needle)).map((c) => ({ key: String(c.id), label: c.name, category: c })),
    { key: NEW_CATEGORY, label: needle && !exact ? `Create “${search.trim()}”` : "New category…", create: true },
  ];
  const selected = categories.find((c) => String(c.id) === value);

  const openChange = (next) => {
    setOpen(next);
    if (next) {
      setSearch("");
      setActive(Math.max(categories.findIndex((c) => String(c.id) === value) + 1, 0));
    }
  };

  const choose = (item) => {
    if (item.create) pendingCreate.current = needle && !exact ? search.trim() : "";
    else onChange(item.key);
    setOpen(false);
  };

  const move = (step) => {
    const next = (active + step + items.length) % items.length;
    setActive(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) choose(items[active]);
    }
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={openChange}>
        <Popover.Trigger asChild>
          <button type="button" className="field-box select-trigger category-trigger" aria-label="Category">
            {selected ? (
              <span className="category-option">
                <CategoryAvatar name={selected.name} src={selected.avatar} size={20} />
                {selected.name}
              </span>
            ) : (
              <span className="muted">None</span>
            )}
            <span className="select-chevron">
              <ChevronDown size={14} strokeWidth={1.75} />
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="menu category-pop"
            align="start"
            sideOffset={4}
            // Opens the dialog only once the popover has closed and refocused its trigger, or that refocus would pull focus out of the dialog.
            onCloseAutoFocus={() => {
              if (pendingCreate.current === null) return;
              const name = pendingCreate.current;
              pendingCreate.current = null;
              setTimeout(() => setCreating({ name }));
            }}
          >
            <TextInput
              icon={Search}
              autoFocus
              placeholder="Search categories"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              aria-label="Search categories"
            />
            {needle && items.length === 1 && <p className="form-hint category-empty">No category matches that search</p>}
            <div ref={list} className="category-list" role="listbox" aria-label="Categories">
              {items.map((item, index) => (
                <div
                  key={item.key}
                  role="option"
                  aria-selected={item.key === value}
                  className={`menu-item${item.create ? " category-create" : ""}`}
                  data-highlighted={index === active ? "" : undefined}
                  onMouseMove={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  {item.create ? (
                    <Plus size={16} strokeWidth={1.5} className="menu-icon" />
                  ) : item.category ? (
                    <CategoryAvatar name={item.category.name} src={item.category.avatar} size={20} />
                  ) : null}
                  <span className={`category-option-label${item.muted ? " muted" : ""}`}>{item.label}</span>
                  {item.key === value && (
                    <span className="menu-check">
                      <Check size={14} strokeWidth={2} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <NewCategoryDialog
        open={Boolean(creating)}
        initialName={creating?.name}
        onOpenChange={(next) => !next && setCreating(null)}
        onCreated={(category) => {
          onCategoriesChange((current) => [...current.filter((c) => c.id !== category.id), category].sort(byName));
          onChange(String(category.id));
        }}
      />
    </>
  );
}

export function NewCategoryDialog({ open, onOpenChange, onCreated, initialName = "" }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        {open && <NewCategoryContent initialName={initialName} onClose={() => onOpenChange(false)} onCreated={onCreated} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NewCategoryContent({ initialName, onClose, onCreated }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState({ ...EMPTY, name: initialName });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const create = async () => {
    setSaving(true);
    try {
      const category = await api("/api/categories", { method: "POST", body: { ...form, postTags: [] } });
      onCreated(category);
      toast(`Created ${category.name}`);
      onClose();
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      else toast(err.message, "error");
      setSaving(false);
    }
  };

  const keepOpenWhileSaving = (e) => saving && e.preventDefault();

  return (
    <Dialog.Content className="dialog category-dialog" onEscapeKeyDown={keepOpenWhileSaving} onInteractOutside={keepOpenWhileSaving} aria-describedby={undefined}>
      {/* Events bubble through portals in React, so the post form around this dialog must not see this submit. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!saving) create();
        }}
      >
        <div className="category-dialog-head">
          <Dialog.Title className="dialog-title">New category</Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="ghost" size="sm" icon={X} aria-label="Close" disabled={saving} />
          </Dialog.Close>
        </div>
        <CategoryIdentity form={form} errors={errors} set={set} autoFocus />
        <div className="dialog-actions">
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="submit" variant="primary" loading={saving} disabled={!form.name.trim()}>
            Create category
          </Button>
        </div>
      </form>
    </Dialog.Content>
  );
}
