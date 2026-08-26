"use client";

import { IconButton } from "@wunderstack/ui";
import { ArrowUp } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) {
      return;
    }
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
      className="flex items-end gap-2 rounded-[var(--radius-pill)] bg-surface p-2.5 shadow-[var(--elevation-raised)]"
    >
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Typ je antwoord…"
        disabled={disabled}
        className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-4 py-3 text-base text-text outline-none placeholder:text-text-subtle disabled:opacity-50"
      />
      <IconButton
        type="submit"
        label="Verstuur"
        disabled={disabled || value.trim().length === 0}
        className="h-12 w-12"
      >
        <ArrowUp className="h-5 w-5" />
      </IconButton>
    </form>
  );
}
