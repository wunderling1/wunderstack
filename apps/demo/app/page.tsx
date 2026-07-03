import { env } from "@wunderstack/shared";

export default function Home() {
  return (
    <main>
      <h1>Wunderstack</h1>
      <p>CAO-agent demo — running in {env.NODE_ENV} mode.</p>
    </main>
  );
}
