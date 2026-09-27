import "server-only";
import { z } from "zod";
import { boundedText } from "../api/admin";
import { budgetSignal } from "../pipeline/budget";
import { MAX_HTML_BYTES } from "../pipeline/limits";
import { publicUrl } from "../parsing/urls";
import { checkScrapeConfiguration, ScrapeError } from "./oxylabs";

export const SCHEDULE_CRON = "0 * * * *";
const identifier = z.string().regex(/^\d+$/);
const scheduleSchema = z.object({ schedule_id: identifier, active: z.boolean(), cron: z.string(), end_time: z.string(), items_count: z.number().int() });
const runsSchema = z.object({ runs: z.array(z.object({ run_id: identifier, jobs: z.array(z.object({ id: identifier, result_status: z.enum(["done", "pending", "faulted"]), created_at: z.string() })) })) });
export type ProviderSchedule = z.infer<typeof scheduleSchema>;
export type ProviderRun = z.infer<typeof runsSchema>["runs"][number];

/** Tokenize strings first so numeric IDs are quoted before JSON.parse, including in arrays. */
export function decodeProviderJson(raw: string): unknown {
  const protectedJson = raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (token.startsWith('"')) return token;
    // All integer tokens are strings initially; only non-ID fields become numbers below.
    return /^-?\d+$/.test(token) ? JSON.stringify(token) : token;
  });
  return JSON.parse(protectedJson, (key: string, value: unknown) => {
    if (["items_count", "status_code", "create_status_code", "page"].includes(key) && typeof value === "string" && /^\d+$/.test(value)) {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new ScrapeError("scheduler_response");
      return number;
    }
    return value;
  }) as unknown;
}
export function providerDate(value: string): number {
  const time = Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (!Number.isFinite(time)) throw new ScrapeError("scheduler_date");
  return time;
}
export class SchedulerClient {
  constructor(private readonly transport: typeof fetch = fetch) {}
  private async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    checkScrapeConfiguration();
    try {
      const response = await this.transport(`https://data.oxylabs.io/v1${path}`, {
        method, redirect: "error", cache: "no-store", signal: budgetSignal(30_000),
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${process.env.OXY_WSA_USERNAME}:${process.env.OXY_WSA_PASSWORD}`).toString("base64")}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw new ScrapeError("provider_auth", true);
        throw new ScrapeError(response.status === 404 ? "scheduler_not_found" : "scheduler_request");
      }
      const raw = await boundedText(response.body, MAX_HTML_BYTES);
      return raw.trim() ? decodeProviderJson(raw) : null;
    } catch (error) {
      if (error instanceof ScrapeError) throw error;
      throw new ScrapeError("scheduler_response");
    }
  }
  async create(url: string): Promise<ProviderSchedule> {
    const end = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    return scheduleSchema.parse(await this.request("/schedules", "POST", { cron: SCHEDULE_CRON, end_time: end, items: [{ source: "universal", url: publicUrl(url) }] }));
  }
  async list(): Promise<string[]> { return z.object({ schedules: z.array(identifier) }).parse(await this.request("/schedules")).schedules; }
  async info(id: string): Promise<ProviderSchedule | null> {
    try { return scheduleSchema.parse(await this.request(`/schedules/${identifier.parse(id)}`)); }
    catch (error) { if (error instanceof ScrapeError && error.code === "scheduler_not_found") return null; throw error; }
  }
  async state(id: string, active: boolean): Promise<void> { await this.request(`/schedules/${identifier.parse(id)}/state`, "PUT", { active }); }
  async runs(id: string): Promise<ProviderRun[]> { return runsSchema.parse(await this.request(`/schedules/${identifier.parse(id)}/runs`)).runs; }
  async result(jobId: string): Promise<{ html: string; url: string }> {
    const payload = z.object({ results: z.array(z.object({ content: z.string().trim().min(1), url: z.string(), job_id: identifier, status_code: z.literal(200), type: z.literal("raw").optional() })).length(1) })
      .parse(await this.request(`/queries/${identifier.parse(jobId)}/results?type=raw`));
    const result = payload.results[0];
    if (result.job_id !== jobId) throw new ScrapeError("scheduler_job_mismatch");
    return { html: result.content, url: publicUrl(result.url) };
  }
}
