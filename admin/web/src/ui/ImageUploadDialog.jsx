import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ClipboardPaste, ImagePlus, Link2, LoaderCircle, X } from "lucide-react";
import { failureMessage, imageFromDevice, imageFromUrl, uploadImage } from "../lib/reels.js";
import { Button, Kbd, TextInput } from "./controls.jsx";
import { CAN_READ_CLIPBOARD, PASTE_KEYS, hostOf, imageFileOf, imageUrlOf, readClipboardImage, useDocumentPaste, useDropTarget } from "./imageIntake.js";

export default function ImageUploadDialog({ open, onOpenChange, onUploaded, title = "Upload picture" }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} />
        {open && <UploadContent title={title} onClose={() => onOpenChange(false)} onUploaded={onUploaded} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UploadContent({ title, onClose, onUploaded }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const fileInput = useRef(null);
  const linkInput = useRef(null);

  const take = async (read, label) => {
    setBusy("reading");
    setError("");
    try {
      const image = await read();
      setPending({ ...image, label });
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const fromFile = (file, label = file.name) => take(() => imageFromDevice(file), label);
  const fromLink = (url) => {
    setLink(url);
    return take(() => imageFromUrl(url), hostOf(url));
  };

  const fromTransfer = (transfer, { pasted = false } = {}) => {
    const file = imageFileOf(transfer);
    const url = file ? "" : imageUrlOf(transfer);
    if (file) fromFile(file, pasted ? "Pasted image" : file.name);
    else if (url) fromLink(url);
    return Boolean(file || url);
  };

  useDocumentPaste((event) => {
    if (busy) return;
    const typingInLink = event.target === linkInput.current;
    if (typingInLink && !imageFileOf(event.clipboardData)) return;
    if (fromTransfer(event.clipboardData, { pasted: true })) event.preventDefault();
    else if (!typingInLink) setError("The clipboard has no image or image link in it.");
  });

  const readClipboard = async () => {
    setError("");
    try {
      const found = await readClipboardImage();
      if (found?.file) return fromFile(found.file, "Pasted image");
      if (found?.url) return fromLink(found.url);
      setError("The clipboard has no image or image link in it.");
    } catch (err) {
      setError(err.name === "NotAllowedError" ? `Clipboard access was blocked. Press ${PASTE_KEYS.join("")} instead.` : failureMessage(err));
    }
  };

  const upload = async () => {
    setBusy("uploading");
    setError("");
    try {
      onUploaded(await uploadImage(pending));
      onClose();
    } catch (err) {
      setError(failureMessage(err));
      setBusy(null);
    }
  };

  const { dragging, dragProps } = useDropTarget((transfer) => {
    if (busy) return;
    if (!fromTransfer(transfer)) setError("That wasn't an image. Drop an image file or an image from a web page.");
  });

  const keepOpenWhileUploading = (e) => busy === "uploading" && e.preventDefault();

  return (
    <Dialog.Content
      className="dialog image-upload"
      onEscapeKeyDown={keepOpenWhileUploading}
      onInteractOutside={keepOpenWhileUploading}
      aria-describedby={undefined}
      {...dragProps}
    >
      <div className="image-upload-head">
        <Dialog.Title className="dialog-title">{title}</Dialog.Title>
        <Dialog.Close asChild>
          <Button variant="ghost" size="sm" icon={X} aria-label="Close" disabled={busy === "uploading"} />
        </Dialog.Close>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) fromFile(file);
        }}
      />

      <button
        type="button"
        className={`image-drop${dragging ? " is-dragging" : ""}${pending ? " has-image" : ""}`}
        onClick={() => fileInput.current?.click()}
        disabled={Boolean(busy)}
      >
        {busy === "reading" ? (
          <span className="image-drop-hint">
            <LoaderCircle className="spin" size={20} strokeWidth={1.75} />
            Reading image…
          </span>
        ) : pending ? (
          <>
            <img src={pending.dataUrl} alt="" />
            <span className="image-drop-caption">
              <span className="image-drop-name">{pending.label}</span>
              <span className="muted">Click, drop or paste to replace</span>
            </span>
          </>
        ) : (
          <span className="image-drop-hint">
            <ImagePlus size={24} strokeWidth={1.5} />
            <span className="image-drop-title">{dragging ? "Drop to use this image" : "Drag an image here, or click to browse"}</span>
            <span className="muted">
              Copied an image? Press <Kbd>{PASTE_KEYS[0]}</Kbd> <Kbd>{PASTE_KEYS[1]}</Kbd>
            </span>
          </span>
        )}
      </button>

      <div className="image-upload-sources">
        <TextInput
          ref={linkInput}
          icon={Link2}
          mono
          className="image-upload-link"
          placeholder="https://…/image.jpg"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (link.trim() && !busy) fromLink(link);
          }}
          disabled={busy === "uploading"}
          aria-label="Image link"
        />
        <Button onClick={() => fromLink(link)} disabled={!link.trim() || Boolean(busy)}>
          Fetch
        </Button>
        {CAN_READ_CLIPBOARD && (
          <Button icon={ClipboardPaste} onClick={readClipboard} disabled={Boolean(busy)}>
            Paste
          </Button>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-actions">
        <Dialog.Close asChild>
          <Button variant="ghost" disabled={busy === "uploading"}>
            Cancel
          </Button>
        </Dialog.Close>
        <Button variant="primary" onClick={upload} loading={busy === "uploading"} disabled={!pending || Boolean(busy)}>
          Upload
        </Button>
      </div>
    </Dialog.Content>
  );
}
