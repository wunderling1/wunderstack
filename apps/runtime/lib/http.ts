/**
 * Bounded request-body reading for the API routes (security-audit finding #7, API4 Unrestricted
 * Resource Consumption). App-Router route handlers have no built-in body-size limit, so calling
 * `request.json()` buffers an arbitrarily large body into memory before Zod's field caps apply.
 *
 * `readBodyBounded` rejects on `Content-Length` first, then reads the stream while counting bytes and
 * aborts as soon as the cap is exceeded — so a lying/absent Content-Length cannot bypass the limit.
 * It returns the raw text so callers that need the exact bytes (webhook HMAC verification) can use
 * them before parsing.
 */

/** Default max body size for the JSON endpoints. A CAO question is tiny; 16 KB is generous. */
export const MAX_BODY_BYTES = 16 * 1024;

export type ReadBodyResult =
  | { ok: true; raw: string }
  | { ok: false; status: 400 | 413; error: string };

export async function readBodyBounded(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<ReadBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, status: 413, error: "payload_too_large" };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "empty_body" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {
          /* stream already closing */
        });
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, raw: new TextDecoder().decode(merged) };
}
