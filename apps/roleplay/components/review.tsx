import { Card, Chip } from "@wunderstack/ui";
import type { RoleplayReviewPayload } from "@wunderstack/shared/browser";

function formatScore(value: number): string {
  return value.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function ReviewCard({ review }: { review: RoleplayReviewPayload }) {
  return (
    <Card className="flex w-full max-w-xl flex-col gap-6 px-8 py-8">
      <header className="flex flex-col gap-2">
        <Chip variant={review.passed ? "verified" : "caution"}>
          {review.passed ? "Geslaagd" : "Niet gehaald"}
        </Chip>
        <h1 className="font-display text-2xl font-semibold text-text">Terugkoppeling</h1>
        <p className="text-sm text-text-muted">
          {formatScore(review.weightedScore)} van de {formatScore(review.passThreshold)}
        </p>
      </header>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-text">{review.feedbackSummary}</p>
      <ol className="flex flex-col gap-4">
        {review.criteria.map((criterion) => (
          <li key={criterion.question} className="flex flex-col gap-1 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-text">{criterion.question}</p>
              <p className="shrink-0 text-sm tabular-nums text-text-muted">
                {criterion.score === null ? "—" : formatScore(criterion.score)}
              </p>
            </div>
            {criterion.feedback.length > 0 ? (
              <p className="text-sm text-text-muted">{criterion.feedback}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
