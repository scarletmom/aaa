import { useState } from "react";
import { DatabaseZap } from "lucide-react";
import { formatDuration, initialOf } from "../lib/content.js";

const THUMBS_KEY = "studio:thumbnails";

// Thumbnails default off so the list stays a few KB on mobile data, like link-gate's low power mode.
export function useThumbnailsPref() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(THUMBS_KEY) === "on";
    } catch {
      return false;
    }
  });
  const set = (value) => {
    setOn(value);
    try {
      localStorage.setItem(THUMBS_KEY, value ? "on" : "off");
    } catch {}
  };
  return [on, set];
}

export function Thumb({ src, duration, show = true, size = "md" }) {
  const [failed, setFailed] = useState(false);
  const length = formatDuration(duration);
  return (
    <span className={`thumb thumb-${size}`}>
      {show && src && !failed && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
      {length && <span className="thumb-duration mono">{length}</span>}
    </span>
  );
}

export function CategoryAvatar({ name, src, size = 40 }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="cat-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initialOf(name)}
    </span>
  );
}

export function SetupNotice() {
  return (
    <div className="empty-state setup-notice">
      <DatabaseZap size={32} strokeWidth={1.25} />
      <h2>Connect the website database</h2>
      <p>
        Copy <code>DATABASE_URL</code> and <code>MYSQL_CA_CERT</code> from link-gate's server <code>.env</code> into this app's <code>.env</code>, then
        restart the server.
      </p>
    </div>
  );
}

export const isSetupError = (err) => err?.code === "no_database";
