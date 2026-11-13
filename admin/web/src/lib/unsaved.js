import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { useFeedback } from "../ui/overlays.jsx";

// Asks before any navigation away (links, the browser's Back button, closing the tab) while there
// are unsaved changes, offering Discard or Save and close. `onSave` resolves to true when saving worked.
// Call `allowLeave()` right before navigating away on purpose, e.g. after deleting.
export function useUnsavedChanges(isDirty, onSave) {
  const { confirm } = useFeedback();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirm({
      title: "Discard unsaved changes?",
      description: "Edits since the last save will be lost.",
      secondaryLabel: "Discard",
      secondaryDanger: true,
      confirmLabel: "Save and close",
    }).then(async (choice) => {
      if (choice === "secondary") return blocker.proceed();
      if (choice === true && (await saveRef.current())) {
        dirtyRef.current = false;
        return blocker.proceed();
      }
      blocker.reset();
    });
  }, [blocker.state]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return {
    allowLeave: () => {
      dirtyRef.current = false;
    },
  };
}
