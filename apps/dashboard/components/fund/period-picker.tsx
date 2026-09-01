import Link from "next/link";
import { NavPills, navPillClassName } from "@wunderstack/ui";
import { PERIOD_LABELS, PERIODS, periodHref, type PeriodId } from "@/lib/period";

export function PeriodPicker({
  pathname,
  period,
  extras,
}: {
  pathname: string;
  period: PeriodId;
  extras?: Record<string, string | undefined>;
}) {
  return (
    <NavPills aria-label="Periode">
      {PERIODS.map((id) => (
        <Link
          key={id}
          href={periodHref(pathname, id, extras)}
          aria-current={id === period ? "page" : undefined}
          className={navPillClassName(id === period)}
        >
          {PERIOD_LABELS[id]}
        </Link>
      ))}
    </NavPills>
  );
}
