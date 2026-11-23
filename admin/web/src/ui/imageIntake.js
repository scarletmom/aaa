import { useEffect, useRef, useState } from "react";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const PASTE_KEYS = IS_MAC ? ["⌘", "V"] : ["Ctrl", "V"];
export const CAN_READ_CLIPBOARD = Boolean(navigator.clipboard?.read);

export const isHttpUrl = (text) => /^https?:\/\/\S+$/i.test(text.trim());

export const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "link";
  }
};

export function imageFileOf(transfer) {
  const files = [...(transfer.files || [])];
  const fromItems = [...(transfer.items || [])].filter((item) => item.kind === "file").map((item) => item.getAsFile());
  return [...files, ...fromItems].find((file) => file?.type.startsWith("image/")) || null;
}

// Images dragged or copied from a web page often arrive as markup or a link rather than bytes.
export function imageUrlOf(transfer) {
  const html = transfer.getData("text/html");
  const src = html && new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
  if (src && isHttpUrl(src)) return src;
  const uri = transfer.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  if (uri && isHttpUrl(uri)) return uri;
  const text = transfer.getData("text/plain");
  return text && isHttpUrl(text) ? text.trim() : "";
}

// Reads the clipboard through the async API: an image first, then an image link. Resolves to null when there's neither.
export async function readClipboardImage() {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return { file: new File([await item.getType(type)], "clipboard", { type }) };
  }
  for (const item of items) {
    if (!item.types.includes("text/plain")) continue;
    const text = await (await item.getType("text/plain")).text();
    if (isHttpUrl(text)) return { url: text.trim() };
  }
  return null;
}

// Calls the latest handler on every paste anywhere in the page, while `enabled`.
export function useDocumentPaste(handler, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event) => latest.current(event);
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);
}

// Drag state for a drop zone; child elements fire their own enter/leave events, hence the depth count.
export function useDropTarget(onDrop) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const dragProps = {
    onDragEnter: (e) => {
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e) => e.preventDefault(),
    onDragLeave: () => {
      depth.current = Math.max(depth.current - 1, 0);
      if (!depth.current) setDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      onDrop(e.dataTransfer);
    },
  };
  return { dragging, dragProps };
}
