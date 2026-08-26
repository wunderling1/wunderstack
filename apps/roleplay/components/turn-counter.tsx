import { Pill } from "@wunderstack/ui";

export function TurnCounter({ used, max }: { used: number; max: number }) {
  return (
    <Pill variant="outline" aria-label={`Beurt ${used} van ${max}`}>
      Beurt {used} / {max}
    </Pill>
  );
}
