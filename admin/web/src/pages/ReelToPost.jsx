import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Check, Ellipsis, Plus, RotateCcw, Workflow, TriangleAlert } from "lucide-react";
import { EMPTY_DRAFT as EMPTY, STEPS, failureMessage, hasProgress, loadReelSetup, loadSavedReel, normalizeDraft, reachableSteps, resumeStep, withoutTransient } from "../lib/reels.js";
import { workflowPath } from "../lib/workflow.js";
import { Button } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import ReelStep from "../reels/ReelStep.jsx";
import FrameStep from "../reels/FrameStep.jsx";
import DetailsStep from "../reels/DetailsStep.jsx";
import PostStep from "../reels/PostStep.jsx";
import ShareStep from "../reels/ShareStep.jsx";
import { useReelSync } from "../reels/useReelSync.js";

// This tab's copy of the draft, so a refresh is instant; a saved reel is then refreshed from the database.
const DRAFT_KEY = "studio:reel-draft";

function readDraft() {
  try {
    return normalizeDraft(JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"));
  } catch {
    return EMPTY;
  }
}

function writeDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(withoutTransient(draft)));
  } catch {}
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
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

  const update = (patch) => setDraft((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
  const markSynced = useReelSync(draft, update, (err) => toast(`Progress couldn't be saved. ${failureMessage(err)}`, "error"));

  const applySaved = (saved) => {
    const next = { ...normalizeDraft(saved.draft), id: saved.id };
    markSynced(next);
    setDraft(next);
    return next;
  };

  // Another device may have moved this reel on since this tab last saw it.
  useEffect(() => {
    if (!draft.id) return;
    loadSavedReel(draft.id)
      .then(applySaved)
      .catch((err) => {
        if (err.status === 404) update({ id: null });
      });
  }, []);

  const open = useMemo(() => reachableSteps(draft), [draft]);
  const wanted = params.get("step") || "reel";
  const step = open.includes(wanted) ? wanted : open[open.length - 1];

  useEffect(() => {
    if (step !== wanted) setParams(step === "reel" ? {} : { step }, { replace: true });
  }, [step, wanted]);

  const go = (key) => setParams(key === "reel" ? {} : { step: key });
  const previous = (key) => open[open.indexOf(key) - 1] || "reel";

  const reset = () => {
    clearDraft();
    setDraft(EMPTY);
    setParams({}, { replace: true });
  };

  const resume = async (id) => {
    go(resumeStep(applySaved(await loadSavedReel(id))));
  };

  const startOver = async () => {
    const ok = await confirm({
      title: "Start over?",
      description: "The video, thumbnails, matches and the form you filled in are cleared.",
      confirmLabel: "Start over",
      danger: true,
    });
    if (ok) reset();
  };

  const missing = setup ? Object.values(setup).filter((s) => !s.exists) : [];
  const shared = { draft, update, go, back: () => go(previous(step)) };
  const onDeleted = (id) => id === draft.id && reset();

  return (
    <div className="home reel-page">
      <div className="home-head reel-head">
        <div>
          <h1>Reel to post</h1>
          <p className="home-sub">Turn an Instagram reel into a post, then share it on Telegram</p>
        </div>
        <div className="reel-head-actions">
          {draft.id && draft.video ? (
            <Button variant="ghost" icon={Plus} onClick={reset}>
              New reel
            </Button>
          ) : (
            hasProgress(draft) &&
            !draft.post && (
              <Button variant="ghost" icon={RotateCcw} onClick={startOver}>
                Start over
              </Button>
            )
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
        {step === "reel" && <ReelStep {...shared} resume={resume} onDeleted={onDeleted} />}
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
