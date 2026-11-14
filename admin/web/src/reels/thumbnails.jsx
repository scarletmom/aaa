import { useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { failureMessage, imageFromDevice, uploadImage } from "../lib/reels.js";
import { Button } from "../ui/controls.jsx";
import { useFeedback } from "../ui/overlays.jsx";

// Every upload is kept for this reel and becomes the post's thumbnail; the Post step can switch between them.
export function useThumbnailUpload(update) {
  const { toast } = useFeedback();
  const [uploading, setUploading] = useState(null);

  const upload = async (kind, getImage, labelFor) => {
    setUploading(kind);
    try {
      const image = await getImage();
      const url = await uploadImage(image);
      const entry = { url, label: labelFor(image) };
      update((current) => ({
        thumbnails: [...current.thumbnails.filter((t) => t.url !== url), entry],
        form: { ...current.form, thumbnail: url },
      }));
      toast(`Thumbnail uploaded · ${entry.label}`);
    } catch (err) {
      const message = failureMessage(err);
      if (message) toast(`Thumbnail upload failed. ${message}`, "error");
    } finally {
      setUploading(null);
    }
  };

  const uploadFile = (file) => upload("device", () => imageFromDevice(file), () => file.name);

  return { uploading, upload, uploadFile };
}

export function DeviceImageButton({ onFile, children = "Upload from device", ...rest }) {
  const input = useRef(null);
  return (
    <>
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
      <Button icon={ImagePlus} onClick={() => input.current?.click()} {...rest}>
        {children}
      </Button>
    </>
  );
}

export function ThumbnailChooser({ thumbnails, selected, onSelect }) {
  if (!thumbnails.length) return null;
  return (
    <div className="thumb-chooser" role="radiogroup" aria-label="Uploaded thumbnails">
      {thumbnails.map((thumbnail) => {
        const isSelected = thumbnail.url === selected;
        return (
          <button
            key={thumbnail.url}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`thumb-choice${isSelected ? " is-selected" : ""}`}
            onClick={() => onSelect(thumbnail.url)}
            title={thumbnail.label}
          >
            <img src={thumbnail.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            {isSelected && (
              <span className="thumb-choice-check">
                <Check size={12} strokeWidth={2.5} />
              </span>
            )}
            <span className="thumb-choice-label">{thumbnail.label}</span>
          </button>
        );
      })}
    </div>
  );
}
