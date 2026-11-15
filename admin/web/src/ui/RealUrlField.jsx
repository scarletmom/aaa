import { Checkbox, Segmented, TextInput } from "./controls.jsx";
import { Field } from "./form.jsx";

export const REAL_URL_TYPES = [
  { value: "player", label: "Player" },
  { value: "iframe", label: "Iframe" },
];

const HINTS = {
  player: "A video file or stream (.m3u8, .mp4). It plays in the news site's player.",
  iframe: "A page that embeds the video. It's shown in an iframe inside the news site's player.",
};

const RUN_WORKFLOW_HINTS = {
  on: "The matching Delivery workflow runs on this page URL, and the iframe shows what it returns.",
  off: "Shown as is. Delivery workflows don't run on it.",
};

// Pass runWorkflow to offer the per-post "Run workflow" choice for Iframe URLs.
export function RealUrlField({ id = "realUrl", url, type, runWorkflow, onChange, error, note }) {
  const offersWorkflow = type === "iframe" && runWorkflow !== undefined;
  const hint = [HINTS[type], offersWorkflow && RUN_WORKFLOW_HINTS[runWorkflow ? "on" : "off"], note].filter(Boolean).join(" ");
  return (
    <Field
      label="Real URL"
      htmlFor={id}
      error={error}
      hint={hint}
      actions={<Segmented value={type} onChange={(next) => onChange({ realUrlType: next })} options={REAL_URL_TYPES} />}
    >
      <TextInput id={id} mono inputMode="url" value={url} onChange={(e) => onChange({ realUrl: e.target.value })} placeholder="https://" />
      {offersWorkflow && <Checkbox checked={runWorkflow} onChange={(value) => onChange({ runWorkflow: value })} label="Run workflow" />}
    </Field>
  );
}
