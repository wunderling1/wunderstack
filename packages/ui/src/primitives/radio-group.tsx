"use client";

import { createContext, useContext, useId } from "react";
import type { ChangeEvent, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

interface RadioGroupContextValue {
  name: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Shared input name; auto-generated when omitted. */
  name?: string;
  /** Selected value (controlled). */
  value?: string;
  onValueChange?: (value: string) => void;
}

/** Groups related radios: shares a `name` and (optionally) controlled value across its `Radio` children. */
export function RadioGroup({
  name,
  value,
  onValueChange,
  className,
  children,
  ...props
}: RadioGroupProps) {
  const fallbackName = useId();
  return (
    <RadioGroupContext.Provider value={{ name: name ?? fallbackName, value, onValueChange }}>
      <div role="radiogroup" className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  /** The value this radio represents. */
  value: string;
  /** Optional inline label rendered next to the dot. */
  label?: ReactNode;
}

/** A single radio option. Reads its group's `name`/value from `RadioGroup` when nested. */
export function Radio({ className, label, value, disabled, checked, onChange, ...props }: RadioProps) {
  const group = useContext(RadioGroupContext);
  const isChecked = group?.value !== undefined ? group.value === value : checked;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    group?.onValueChange?.(value);
    onChange?.(event);
  };

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm text-text",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span className="relative inline-flex">
        <input
          type="radio"
          value={value}
          disabled={disabled}
          onChange={handleChange}
          {...(group ? { name: group.name } : {})}
          {...(isChecked !== undefined ? { checked: isChecked } : {})}
          className={cn(
            "peer h-4 w-4 shrink-0 appearance-none rounded-[var(--radius-pill)] border border-border bg-surface",
            "checked:border-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
            "disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-pill)] bg-primary opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
