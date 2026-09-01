import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
} from "@wunderstack/ui";
import type { ReactNode } from "react";

/** Fund-level heading. App chrome (sidebar + switcher) lives in the admin layout. */
export function FundLevelChrome({
  fundKey,
  displayName,
  inactiveBanner,
  children,
}: {
  fundKey: string;
  displayName: string;
  inactiveBanner: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/funds">Fondsen</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{displayName}</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumbs>
        <div>
          <h2 className="font-display text-lg font-semibold">{displayName}</h2>
          <p className="mt-1 font-mono text-sm text-text-muted">{fundKey}</p>
        </div>
      </div>

      {inactiveBanner}

      {children}
    </div>
  );
}
