import { Chat } from "@/components/chat/chat";

/**
 * Embeddable chat, rendered inside the widget iframe (see public/widget/widget.js). Minimal chrome:
 * the host page provides the frame. Same-origin with /api/chat, so no CORS needed.
 *
 * Optional `?fund=<key>` restricts answers to one O&O fund's CAO.
 */
export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fundParam = params.fund;
  const fund = typeof fundParam === "string" ? fundParam : undefined;

  return (
    <main className="h-dvh bg-background">
      <Chat embedded {...(fund ? { fund } : {})} />
    </main>
  );
}
