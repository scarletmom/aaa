import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Check, Ellipsis, RotateCcw, Workflow, TriangleAlert } from "lucide-react";
import { EMPTY_DRAFT as EMPTY, EMPTY_FORM, STEPS, loadReelSetup } from "../lib/reels.js";
import { workflowPath } from "../lib/workflow.js";
import { Button } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import ReelStep from "../reels/ReelStep.jsx";
import FrameStep from "../reels/FrameStep.jsx";
import DetailsStep from "../reels/DetailsStep.jsx";
import PostStep from "../reels/PostStep.jsx";
import ShareStep from "../reels/ShareStep.jsx";

const DRAFT_KEY = "studio:reel-draft";

// Captured frames are kept in memory only; they're large and a refresh can simply grab them again.
const TRANSIENT = ["searchedFrame"];

function readDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (!saved) return EMPTY;
    // Drafts saved before several thumbnails were kept had a single `thumbnail`.
    const thumbnails = saved.thumbnails || (saved.thumbnail ? [{ url: saved.thumbnail.url, label: "Frame" }] : []);
    return { ...EMPTY, ...saved, thumbnails, form: { ...EMPTY_FORM, ...saved.form } };
  } catch {
    return EMPTY;
  }
}

function writeDraft(draft) {
  try {
    const kept = Object.fromEntries(Object.entries(draft).filter(([key]) => !TRANSIENT.includes(key)));
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(kept));
  } catch {}
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

// Once the post exists, the earlier steps are closed so it can't be created twice.
function reachable(draft) {
  if (draft.post) return ["share"];
  return STEPS.map((s) => s.key).filter((key) => key === "reel" || (draft.video && (key !== "details" || draft.matches) && key !== "share"));
}

function Stepper({ current, open, onGo }) {
  const index = STEPS.findIndex((step) => step.key === current);
  return (
    <nav className="reel-stepper" aria-label="Steps">
      <ol>
        {STEPS.map((step, i) => {
          const done = i < index;
          const enabled = open.includes(step.key) && step.key !== current;
          return (
            <li key={step.key} className={`reel-stepper-item${i === index ? " is-current" : ""}${done ? " is-done" : ""}`}>
              <button type="button" disabled={!enabled} onClick={() => onGo(step.key)} aria-current={i === index ? "step" : undefined}>
                <span className="reel-stepper-dot">{done ? <Check size={12} strokeWidth={2.5} /> : i + 1}</span>
                <span className="reel-stepper-label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="reel-stepper-compact">
        Step {index + 1} of {STEPS.length} · <strong>{STEPS[index]?.label}</strong>
      </p>
    </nav>
  );
}

function SetupBanner({ missing }) {
  return (
    <div className="reel-banner" role="alert">
      <TriangleAlert size={18} strokeWidth={1.75} />
      <div>
        <strong>Some workflows this page runs don't exist yet</strong>
        <p>
          Missing: {missing.map((step) => step.name).join(", ")}. Run <code>npm run reels:setup</code> in the admin folder to create them.
        </p>
      </div>
    </div>
  );
}

export default function ReelToPost() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(readDraft);
  const [setup, setSetup] = useState(null);

  useEffect(() => {
    loadReelSetup()
      .then(({ steps }) => setSetup(steps))
      .catch((err) => toast(err.message, "error"));
  }, []);

  useEffect(() => writeDraft(draft), [draft]);

  const open = useMemo(() => reachable(draft), [draft]);
  const wanted = params.get("step") || "reel";
  const step = open.includes(wanted) ? wanted : open[open.length - 1];

  useEffect(() => {
    if (step !== wanted) setParams(step === "reel" ? {} : { step }, { replace: true });
  }, [step, wanted]);

  const update = (patch) => setDraft((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  const go = (key) => setParams(key === "reel" ? {} : { step: key });
  const previous = (key) => open[open.indexOf(key) - 1] || "reel";

  const reset = () => {
    clearDraft();
    setDraft(EMPTY);
    setParams({}, { replace: true });
  };

  const startOver = async () => {
    const ok = await confirm({
      title: "Start over?",
      description: "The video, chosen frame, matches and the form you filled in are cleared.",
      confirmLabel: "Start over",
      danger: true,
    });
    if (ok) reset();
  };

  const missing = setup ? Object.values(setup).filter((s) => !s.exists) : [];
  const shared = { draft, update, go, back: () => go(previous(step)) };

  return (
    <div className="home reel-page">
      <div className="home-head reel-head">
        <div>
          <h1>Reel to post</h1>
          <p className="home-sub">Turn an Instagram reel into a post, then share it on Telegram</p>
        </div>
        <div className="reel-head-actions">
          {draft.video && !draft.post && (
            <Button variant="ghost" icon={RotateCcw} onClick={startOver}>
              Start over
            </Button>
          )}
          {setup && (
            <Menu
              trigger={<Button variant="ghost" icon={Ellipsis} aria-label="Workflows used here" />}
              items={Object.values(setup)
                .filter((s) => s.exists)
                .map((s) => ({ label: s.name, icon: Workflow, onSelect: () => navigate(workflowPath(s.id)) }))}
            />
          )}
        </div>
      </div>

      {missing.length > 0 && <SetupBanner missing={missing} />}

      <Stepper current={step} open={open} onGo={go} />

      <section className="reel-body" key={step}>
        {step === "reel" && <ReelStep {...shared} />}
        {step === "frame" && <FrameStep {...shared} />}
        {step === "details" && <DetailsStep {...shared} />}
        {step === "post" && <PostStep {...shared} />}
        {step === "share" && (
          <ShareStep
            {...shared}
            onClose={() => {
              reset();
              toast("Done. Ready for the next reel");
            }}
          />
        )}
      </section>
    </div>
  );
}
