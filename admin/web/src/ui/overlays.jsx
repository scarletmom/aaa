import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { CircleAlert, Check } from "lucide-react";
import { Button } from "./controls.jsx";

export function Menu({ trigger, items, align = "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={6} onClick={(e) => e.stopPropagation()}>
          {items.filter(Boolean).map((item, index) =>
            item === "separator" ? (
              <DropdownMenu.Separator key={index} className="menu-separator" />
            ) : (
              <DropdownMenu.Item key={item.label} className={`menu-item${item.danger ? " danger" : ""}`} onSelect={item.onSelect}>
                {item.icon && <item.icon size={16} strokeWidth={1.5} className="menu-icon" />}
                {item.label}
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </DropdownMenu.Item>
            )
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

// Promise-based confirm and toast, so callers can `await confirm(...)` instead of window.confirm.
export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setDialog({ confirmLabel: "Confirm", ...options, resolve })),
    []
  );

  const toast = useCallback((message, tone = "info") => {
    const id = (nextId.current += 1);
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 5000 : 2400);
  }, []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <AlertDialog.Root open={Boolean(dialog)} onOpenChange={(open) => !open && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title className="dialog-title">{dialog?.title}</AlertDialog.Title>
            {dialog?.description && <AlertDialog.Description className="dialog-text">{dialog.description}</AlertDialog.Description>}
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => close(true)}>
                  {dialog?.confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === "error" ? <CircleAlert size={16} strokeWidth={1.5} /> : <Check size={16} strokeWidth={1.75} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
