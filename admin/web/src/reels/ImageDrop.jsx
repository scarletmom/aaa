import { useRef } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { Button, Kbd } from "../ui/controls.jsx";
import { PASTE_KEYS } from "../ui/imageIntake.js";

// A compact drop zone: shows the chosen image, or a prompt to drop, paste or browse for one.
export default function ImageDrop({ image, reading, dragging, disabled, onFile, onRemove }) {
  const input = useRef(null);
  const browse = () => input.current?.click();

  return (
    <div className={`reel-drop${dragging ? " is-dragging" : ""}${image ? " has-image" : ""}`}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {image ? (
        <>
          <span className="reel-status-thumb">
            <img src={image.dataUrl} alt="" />
          </span>
          <span className="reel-drop-caption">
            <span className="reel-status-title" title={image.label}>
              {image.label}
            </span>
            <span className="reel-status-sub">{dragging ? "Drop to replace" : "Drop or paste to replace"}</span>
          </span>
          <span className="reel-drop-actions">
            <Button variant="ghost" size="sm" onClick={browse} disabled={disabled}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" icon={X} onClick={onRemove} disabled={disabled} aria-label="Remove image" />
          </span>
        </>
      ) : (
        <button type="button" className="reel-drop-empty" onClick={browse} disabled={disabled || reading}>
          {reading ? <LoaderCircle className="spin" size={18} strokeWidth={1.75} /> : <ImagePlus size={18} strokeWidth={1.5} />}
          <span>
            <span className="reel-status-title">{reading ? "Reading image…" : dragging ? "Drop to use this image" : "Use your own image"}</span>
            <span className="reel-status-sub">
              Drop, click to choose, or press <Kbd>{PASTE_KEYS[0]}</Kbd> <Kbd>{PASTE_KEYS[1]}</Kbd>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
