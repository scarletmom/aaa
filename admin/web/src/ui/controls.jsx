import { Checkbox as RCheckbox, Select as RSelect, Switch as RSwitch, ToggleGroup, Tooltip } from "radix-ui";
import { Check, ChevronDown, LoaderCircle, Minus, Plus } from "lucide-react";

const cx = (...names) => names.filter(Boolean).join(" ");

export function Button({ variant = "secondary", size = "md", icon: Icon, loading = false, className, children, ...rest }) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button type="button" className={cx("btn", `btn-${variant}`, `btn-${size}`, !children && "btn-icon", className)} {...rest}>
      {loading ? <LoaderCircle className="spin" size={iconSize} strokeWidth={1.75} /> : Icon && <Icon size={iconSize} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

// Spreads `rest` so Tip can sit inside another Radix `asChild` trigger and still pass its handlers through.
export function Tip({ label, keys, side = "bottom", children, ...rest }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild {...rest}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={6}>
          {label}
          {keys && (
            <span className="tip-keys">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          )}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TipProvider = ({ children }) => (
  <Tooltip.Provider delayDuration={400} skipDelayDuration={200}>
    {children}
  </Tooltip.Provider>
);

function normalize(options) {
  return options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
}

export function Select({ value, onChange, options, size = "md", mono = false, className, placeholder, ...rest }) {
  const items = normalize(options);
  return (
    <RSelect.Root value={value} onValueChange={onChange}>
      <RSelect.Trigger className={cx("field-box", "select-trigger", `select-${size}`, mono && "mono", className)} {...rest}>
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon className="select-chevron">
          <ChevronDown size={14} strokeWidth={1.75} />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="menu select-menu" position="popper" sideOffset={4}>
          <RSelect.Viewport>
            {items.map((item) => (
              <RSelect.Item key={item.value} value={item.value} className={cx("menu-item", mono && "mono")}>
                {item.icon && <item.icon size={16} strokeWidth={1.5} className="menu-icon" />}
                <RSelect.ItemText>{item.label}</RSelect.ItemText>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
                <RSelect.ItemIndicator className="menu-check">
                  <Check size={14} strokeWidth={2} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Switch({ checked, onChange, label, ...rest }) {
  return (
    <label className="switch-row">
      <RSwitch.Root className="switch" checked={checked} onCheckedChange={onChange} {...rest}>
        <RSwitch.Thumb className="switch-thumb" />
      </RSwitch.Root>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, ...rest }) {
  return (
    <label className="check-row">
      <RCheckbox.Root className="checkbox" checked={checked} onCheckedChange={(value) => onChange(value === true)} {...rest}>
        <RCheckbox.Indicator>
          <Check size={12} strokeWidth={2.5} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label && <span>{label}</span>}
    </label>
  );
}

export function TextInput({ className, mono = false, icon: Icon, ...rest }) {
  if (!Icon) return <input className={cx("field-box", "text-input", mono && "mono", className)} spellCheck={false} {...rest} />;
  return (
    <div className={cx("field-box", "text-input", "with-icon", className)}>
      <Icon size={16} strokeWidth={1.5} />
      <input className={mono ? "mono" : undefined} spellCheck={false} {...rest} />
    </div>
  );
}

export function NumberInput({ value, onChange, step = 1, min = 0 }) {
  const set = (next) => onChange(Math.max(min, Number.isFinite(next) ? next : 0));
  return (
    <div className="field-box number-input">
      <input inputMode="numeric" value={value ?? 0} onChange={(e) => set(Number(e.target.value.replace(/[^\d.-]/g, "")))} />
      <button type="button" aria-label="Decrease" onClick={() => set(Number(value) - step)}>
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Increase" onClick={() => set(Number(value) + step)}>
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Segmented({ value, onChange, options, size = "sm" }) {
  return (
    <ToggleGroup.Root type="single" className={cx("segmented", `segmented-${size}`)} value={value} onValueChange={(next) => next && onChange(next)}>
      {normalize(options).map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className="segmented-item">
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
