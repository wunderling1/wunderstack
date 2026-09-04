import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Expose pathname to server pages (PeriodPicker and other page-level widgets).
 * Next 16: this file is `proxy.ts` (the former `middleware` convention).
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
