import type { DayCount } from "@wunderstack/analytics";
import { formatDayPointLabel } from "@/lib/activity-copy";

const WIDTH = 240;
const HEIGHT = 72;
const PAD_X = 4;
const PAD_Y = 4;

/**
 * Daily question volume. Hover is a native title on each point — no client state, no click
 * (S11a: the reeks has no destination). One day is a bar, not a line of one point.
 */
export function ActivitySparkline({ series }: { series: readonly DayCount[] }) {
  if (series.length === 0) return null;
  const max = Math.max(...series.map((row) => row.questions), 1);
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;

  if (series.length === 1) {
    const point = series[0];
    if (point === undefined) return null;
    const barHeight = (point.questions / max) * innerH;
    const x = WIDTH / 2 - 6;
    const y = HEIGHT - PAD_Y - barHeight;
    return (
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-16 w-full max-w-xs text-text"
        role="img"
        aria-label={formatDayPointLabel(point)}
      >
        <title>{formatDayPointLabel(point)}</title>
        <rect x={x} y={y} width={12} height={Math.max(barHeight, 1)} fill="currentColor" rx="2" />
      </svg>
    );
  }

  const coords = series.map((point, index) => {
    const x = PAD_X + (index / (series.length - 1)) * innerW;
    const y = HEIGHT - PAD_Y - (point.questions / max) * innerH;
    return { x, y, point };
  });
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-16 w-full max-w-xs text-text"
      role="img"
      aria-label="Vragen per dag in dit venster"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      {coords.map(({ x, y, point }) => (
        <g key={point.day}>
          <circle cx={x} cy={y} r="2" fill="currentColor" />
          <circle cx={x} cy={y} r="8" fill="transparent">
            <title>{formatDayPointLabel(point)}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
