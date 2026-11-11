import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Search } from "lucide-react";
import { iconFor } from "../lib/workflow.js";
import { useEditor } from "./context.js";

export function AddNodeMenu({ onPick, children, side = "right", align = "start" }) {
  const { types } = useEditor();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef(null);
  const contentRef = useRef(null);
  const searchRef = useRef(null);

  // React Flow handles pointerdown on the pane, so Radix never sees the outside click; listen in the capture phase instead.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (contentRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(types).filter(
      (type) => type.type !== "input" && (!q || type.label.toLowerCase().includes(q) || type.description.toLowerCase().includes(q))
    );
  }, [types, query]);

  const pick = (type) => {
    setOpen(false);
    onPick(type.type);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % Math.max(options.length, 1));
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault();
      pick(options[active]);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
        setActive(0);
      }}
    >
      <Popover.Trigger asChild ref={triggerRef}>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          className="menu picker"
          side={side}
          align={align}
          sideOffset={8}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            // React Flow refocuses the clicked step after this runs, so take focus back on the next frame.
            e.preventDefault();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <div className="picker-search">
            <Search size={16} strokeWidth={1.5} />
            <input
              ref={searchRef}
              placeholder="Add a step"
              value={query}
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
          </div>
          <div className="picker-list">
            {options.map((type, index) => {
              const Icon = iconFor(type.type);
              return (
                <button
                  key={type.type}
                  type="button"
                  className={`picker-item${index === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(type)}
                >
                  <span className="picker-icon">
                    <Icon size={16} strokeWidth={1.5} />
                  </span>
                  <span className="picker-text">
                    <span>{type.label}</span>
                    <span className="picker-desc">{type.description.replace(/\.$/, "")}</span>
                  </span>
                </button>
              );
            })}
            {options.length === 0 && <div className="picker-none">No step called “{query}”</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
