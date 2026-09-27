import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./admin";

export function requireCron(request: Request): void {
  if (process.env.NODE_ENV === "development" && !process.env.VERCEL && !process.env.VERCEL_ENV) return;
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || !supplied || !timingSafeEqual(createHash("sha256").update(`Bearer ${expected}`).digest(), createHash("sha256").update(supplied).digest())) throw new ApiError(401, "Unauthorized.");
}
