import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function requireAdmin(request: Request): void {
  const expected = process.env.BIASLY_ADMIN_SECRET;
  const supplied = request.headers.get("x-biasly-admin-secret");
  if (!expected || !supplied || !timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(supplied).digest(),
  )) throw new ApiError(401, "Unauthorized.");
}

export function apiError(error: unknown): Response {
  return Response.json({ error: error instanceof ApiError ? error.message : "Server operation failed." },
    { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}

export async function boundedText(body: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new ApiError(413, "Payload too large."); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
