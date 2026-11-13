import { Popover } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { USAGES } from "../lib/workflow.js";
import { Button, Checkbox } from "../ui/controls.jsx";

export function UsagePicker({ usage, onChange, blockers }) {
  const label = USAGES.filter((option) => usage.includes(option.value))
    .map((option) => option.label)
    .join(" + ");

  const toggle = (value, on) => {
    const next = USAGES.map((option) => option.value).filter((key) => (key === value ? on : usage.includes(key)));
    if (next.length) onChange(next);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" className="usage-trigger">
          <span className="muted">Use for</span> {label}
          <ChevronDown size={14} strokeWidth={1.75} />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu usage-pop" align="end" sideOffset={6}>
          {USAGES.map((option) => {
            const checked = usage.includes(option.value);
            const blocked = option.value === "delivery" && !checked && blockers.length > 0;
            const onlyOne = checked && usage.length === 1;
            return (
              <div key={option.value} className="usage-option">
                <Checkbox checked={checked} disabled={blocked || onlyOne} onChange={(on) => toggle(option.value, on)} label={option.label} />
                <p className="usage-hint">{option.hint}</p>
                {blocked && <p className="usage-blocked">Remove the pipeline-only steps first: {blockers.join(", ")}</p>}
              </div>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
