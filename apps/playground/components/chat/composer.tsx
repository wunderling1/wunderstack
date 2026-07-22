"use client";

import { IconButton } from "@wunderstack/ui";
import { SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (message: string) => void;
  className?: string;
}

/**
 * Pill input + circular send button. App-local chat shell (D16: the composer is not a shared
 * trust-pattern, so it lives in the consuming app, not in `@wunderstack/ui`).
 */
export function Composer({
  disabled = false,
  placeholder = "Stel je vraag…",
  onSend,
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
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-end gap-2 rounded-[var(--radius-pill)] border border-border bg-surface p-2 shadow-sm",
        className,
      )}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-text outline-none",
          "placeholder:text-text-subtle disabled:opacity-50",
        )}
      />
      <IconButton
        type="submit"
        label="Verstuur"
        disabled={disabled || value.trim().length === 0}
        className="h-9 w-9"
      >
        <SendHorizontal className="h-4 w-4" />
      </IconButton>
    </form>
  );
}
