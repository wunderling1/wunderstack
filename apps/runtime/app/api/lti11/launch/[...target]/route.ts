import { handleLti11Launch, lti11MethodNotAllowed, parseLaunchPathHint } from "@/lib/lti11/launch";

export const runtime = "nodejs";

export function GET(): Response {
  return lti11MethodNotAllowed();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ target: string[] }> },
): Promise<Response> {
  const { target } = await context.params;
  const hint = parseLaunchPathHint(target);
  if (!hint) {
    return new Response("Invalid launch path", { status: 404 });
  }
  return handleLti11Launch(request, hint);
}
