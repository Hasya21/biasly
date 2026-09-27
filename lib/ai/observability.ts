import "server-only";
import { PostHog } from "posthog-node";

export type AiObservabilityContext = {
  sessionId: string;
  traceId: string;
};

type GenerationCapture = {
  model: string;
  input: string;
  output?: string;
  latencyMs: number;
};

let client: PostHog | undefined;

function configuredPostHogValue(name: string, value: string | undefined): string | undefined {
  const configuredValue = value?.trim();
  if (!configuredValue && process.env.NODE_ENV !== "production") {
    console.error(new Error(`${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`));
  }
  return configuredValue;
}

function getClient(): PostHog | undefined {
  const projectToken = configuredPostHogValue("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
  const host = configuredPostHogValue("NEXT_PUBLIC_POSTHOG_HOST", process.env.NEXT_PUBLIC_POSTHOG_HOST);
  if (!projectToken || !host) return undefined;

  client ??= new PostHog(projectToken, {
    host,
    privacyMode: false,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureAiGeneration(context: AiObservabilityContext, generation: GenerationCapture): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;

  try {
    await posthog.captureAiImmediate({
      distinctId: "analysis-pipeline",
      event: "$ai_generation",
      properties: {
        $ai_provider: "openai",
        $ai_model: generation.model,
        $ai_input: [{ role: "user", content: generation.input }],
        ...(generation.output === undefined ? {} : { $ai_output_choices: [{ role: "assistant", content: generation.output }] }),
        $ai_latency: generation.latencyMs,
        $ai_session_id: context.sessionId,
        posthog_trace_id: context.traceId,
      },
    });
  } catch {
    console.warn("[ai-observability] generation capture failed");
  }
}
