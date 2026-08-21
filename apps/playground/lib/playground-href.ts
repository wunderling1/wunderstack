import type { PlaygroundAgent } from "./runtime-config";

/** Build a playground URL that patches agent/fund while keeping the rest of the query. */
export function playgroundHref(
  pathname: string,
  searchParams: { toString(): string },
  patch: { agent?: PlaygroundAgent; fund?: string },
): string {
  const params = new URLSearchParams(searchParams.toString());
  if (patch.agent !== undefined) {
    if (patch.agent === "cao") {
      params.delete("agent");
    } else {
      params.set("agent", patch.agent);
    }
  }
  if (patch.fund !== undefined) {
    params.set("fund", patch.fund);
  }
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}
