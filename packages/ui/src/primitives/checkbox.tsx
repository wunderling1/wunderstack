import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional inline label rendered next to the box. */
  label?: ReactNode;
}

/**
 * Native checkbox with a custom check overlay. Built on the real `<input type="checkbox">` so it stays
 * accessible (label association, keyboard, form submission); only the visual box is restyled.
 */
export function Checkbox({ className, label, disabled, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm text-text",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span className="relative inline-flex">
        <input
          type="checkbox"
          disabled={disabled}
          className={cn(
            "peer h-4 w-4 shrink-0 appearance-none rounded-[var(--radius-input)] border border-border bg-surface",
            "checked:border-primary checked:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
            "disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        <Check
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-on-primary opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
