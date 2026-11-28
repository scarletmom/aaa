import { useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { FileUp, X } from "lucide-react";
import { api } from "../lib/api.js";
import { Button } from "./controls.jsx";
import { TextArea } from "./form.jsx";
import { useDropTarget } from "./imageIntake.js";

const EXAMPLE = "id,file_name,thumbnail,duration,url,views\nabc123,My video.mp4,https://…/thumb.jpg,04:23,https://www.terabox.com/s/1…,1250";
const SHOWN_SKIPS = 100;

export default function TeraboxImportDialog({ open, onOpenChange, onImported }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} />
        {open && <ImportContent onClose={() => onOpenChange(false)} onImported={onImported} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportContent({ onClose, onImported }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  const readFile = async (file) => {
    setError("");
    try {
      setCsv(await file.text());
      setFileName(file.name);
    } catch {
      setError(`Couldn't read ${file.name}.`);
    }
  };

  const { dragging, dragProps } = useDropTarget((transfer) => {
    const file = transfer.files?.[0];
    if (file && !busy && !result) readFile(file);
  });

  const runImport = async () => {
    setBusy(true);
    setError("");
    try {
      const outcome = await api("/api/terabox-videos/import", { method: "POST", body: { csv } });
      setResult(outcome);
      if (outcome.added) onImported(outcome);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setCsv("");
    setFileName("");
    setResult(null);
  };

  const keepOpenWhileImporting = (e) => busy && e.preventDefault();

  return (
    <Dialog.Content
      className={`dialog terabox-import${dragging ? " is-dragging" : ""}`}
      onEscapeKeyDown={keepOpenWhileImporting}
      onInteractOutside={keepOpenWhileImporting}
      aria-describedby={undefined}
      {...dragProps}
    >
      <div className="image-upload-head">
        <Dialog.Title className="dialog-title">Import Terabox videos</Dialog.Title>
        <Dialog.Close asChild>
          <Button variant="ghost" size="sm" icon={X} aria-label="Close" disabled={busy} />
        </Dialog.Close>
      </div>

      {result ? (
        <ImportResult result={result} />
      ) : (
        <>
          <p className="dialog-text terabox-import-text">
            Paste CSV, or choose or drop a file. Columns: <span className="mono">id, file_name, thumbnail, duration, url, views</span>. The header row is optional; views may be left out.
            Rows whose id or url is already saved are skipped; rows without a url stay off the site.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) readFile(file);
            }}
          />
          <TextArea
            className="mono terabox-import-csv"
            value={csv}
            rows={10}
            spellCheck={false}
            placeholder={EXAMPLE}
            aria-label="CSV"
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName("");
            }}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      <div className="dialog-actions terabox-import-actions">
        {result ? (
          <>
            <Button onClick={startOver}>Import more</Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button icon={FileUp} onClick={() => fileInput.current?.click()} disabled={busy}>
              {fileName ? <span className="terabox-import-file">{fileName}</span> : "Choose file"}
            </Button>
            <div className="spacer" />
            <Button variant="primary" loading={busy} disabled={!csv.trim()} onClick={runImport}>
              Import
            </Button>
          </>
        )}
      </div>
    </Dialog.Content>
  );
}

function ImportResult({ result }) {
  const { added, skipped, raced } = result;
  const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
  return (
    <div className="terabox-import-result">
      <p className="dialog-text">
        Added {plural(added, "video")}
        {skipped.length ? `, skipped ${plural(skipped.length, "row")}` : ""}.
        {raced ? ` ${plural(raced, "row")} matched a video saved during the import and ${raced === 1 ? "was" : "were"} left out.` : ""}
      </p>
      {skipped.length > 0 && (
        <ul className="terabox-import-skips">
          {skipped.slice(0, SHOWN_SKIPS).map(({ row, reason }) => (
            <li key={row}>
              <span className="mono muted">Row {row}</span> {reason}
            </li>
          ))}
          {skipped.length > SHOWN_SKIPS && <li className="muted">…and {plural(skipped.length - SHOWN_SKIPS, "more row")}</li>}
        </ul>
      )}
    </div>
  );
}
