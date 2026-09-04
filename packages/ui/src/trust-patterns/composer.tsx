"use client";

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Field } from "../primitives/field";
import { IconButton } from "../primitives/icon-button";
import type { DensitySize } from "./answer-card";

export interface ComposerProps {
  /** Called with the trimmed message when the user submits. */
  onSend: (message: string) => void;
  /** Called when the user clicks Stop while `stopping` is true. */
  onStop?: () => void;
  /** Disable the input (and send). Stop remains clickable when `stopping`. */
  disabled?: boolean;
  /** When true, the primary button is Stop instead of Send. */
  stopping?: boolean;
  placeholder?: string;
  /**
   * Density (D18). Playground/roleplay use `lg` (48 px send); embed uses `sm`.
   * Default `md` matches IconButton/Field defaults.
   */
  size?: DensitySize;
  /**
   * Multi-line textarea (playground/roleplay). When false, a single-line `Field` is used
   * (embed panel).
   */
  multiline?: boolean;
  className?: string;
}

/**
 * Trust-pattern: pill input + circular send/stop button. Promoted from three app-local
 * copies (playground, roleplay, embed) under the rule of three (D18). Icons are inline SVG
 * so the embed panel stays Lucide-free.
 */
export function Composer({
  onSend,
  onStop,
  disabled = false,
  stopping = false,
  placeholder = "Typ je vraag…",
  size = "md",
  multiline = true,
  className,
}: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (stopping) {
      onStop?.();
      return;
    }
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (stopping) return;
      submit();
    }
  };

  const compact = size === "sm";
  const inputSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-end gap-2 rounded-[var(--radius-pill)] bg-surface shadow-[var(--elevation-raised)]",
        compact ? "p-2" : "p-2.5",
        className,
      )}
    >
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled && !stopping}
          className={cn(
            "max-h-40 flex-1 resize-none bg-transparent text-text outline-none",
            "placeholder:text-text-subtle disabled:opacity-50",
            size === "lg" && "min-h-12 px-4 py-3 text-base",
            size === "md" && "min-h-10 px-3 py-2 text-sm",
            size === "sm" && "min-h-8 px-2.5 py-1.5 text-xs",
          )}
        />
      ) : (
        <Field
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled && !stopping}
          size={inputSize}
          className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
        />
      )}
      {stopping ? (
        <IconButton type="submit" label="Stop" size={size} className="shrink-0">
          <StopIcon className={iconClass(size)} />
        </IconButton>
      ) : (
        <IconButton
          type="submit"
          label="Verstuur"
          size={size}
          disabled={disabled || value.trim().length === 0}
          className="shrink-0"
        >
          <ArrowUpIcon className={iconClass(size)} />
        </IconButton>
      )}
    </form>
  );
}

function iconClass(size: DensitySize): string {
  if (size === "lg") return "h-5 w-5";
  if (size === "sm") return "h-3.5 w-3.5";
  return "h-4 w-4";
}

function ArrowUpIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M8 13V3m0 0L4 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}
