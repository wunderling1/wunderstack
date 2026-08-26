import { handleLti11Launch, lti11MethodNotAllowed } from "@/lib/lti11/launch";

export const runtime = "nodejs";

export function GET(): Response {
  return lti11MethodNotAllowed();
}

export async function POST(request: Request): Promise<Response> {
  return handleLti11Launch(request, null);
}
