import { Chat } from "@/components/chat/chat";

/** Public CAO-agent demo. Streamed answers with source attribution; no auth (public). */
export default function DemoPage() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">W</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Wunderstack — CAO-agent</h1>
            <p className="text-xs text-muted-foreground">Antwoorden met bronvermelding uit de CAO</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>
    </main>
  );
}
