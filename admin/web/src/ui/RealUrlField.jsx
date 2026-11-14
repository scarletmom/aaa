import { Segmented, TextInput } from "./controls.jsx";
import { Field } from "./form.jsx";

export const REAL_URL_TYPES = [
  { value: "player", label: "Player" },
  { value: "iframe", label: "Iframe" },
];

const HINTS = {
  player: "A video file or stream (.m3u8, .mp4). It plays in the news site's player.",
  iframe: "A page that embeds the video. It's shown in an iframe inside the news site's player.",
};

export function RealUrlField({ id = "realUrl", url, type, onChange, error, note }) {
  return (
    <Field
      label="Real URL"
      htmlFor={id}
      error={error}
      hint={note ? `${HINTS[type]} ${note}` : HINTS[type]}
      actions={<Segmented value={type} onChange={(next) => onChange({ realUrlType: next })} options={REAL_URL_TYPES} />}
    >
      <TextInput id={id} mono inputMode="url" value={url} onChange={(e) => onChange({ realUrl: e.target.value })} placeholder="https://" />
    </Field>
  );
}
