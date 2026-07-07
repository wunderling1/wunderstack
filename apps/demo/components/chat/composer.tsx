"use client";

import { SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ComposerProps {
  disabled: boolean;
  onSend: (question: string) => void;
}

export function Composer({ disabled, onSend }: ComposerProps) {
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
      className="flex items-end gap-2 rounded-lg border border-border bg-card p-2 shadow-sm"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Stel je vraag over de CAO…"
        className={cn(
          "max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm",
          "outline-none placeholder:text-muted-foreground",
        )}
      />
      <Button type="submit" size="icon" disabled={disabled || value.trim().length === 0} aria-label="Verstuur">
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </form>
  );
}
