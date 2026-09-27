import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

function optionalPostHogConfig(name: string, value: string | undefined): string | undefined {
  const configuredValue = value?.trim();
  if (!configuredValue && process.env.NODE_ENV !== "production") {
    console.error(new Error(`${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`));
  }
  return configuredValue;
}

const projectToken = optionalPostHogConfig("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
const host = optionalPostHogConfig("NEXT_PUBLIC_POSTHOG_HOST", process.env.NEXT_PUBLIC_POSTHOG_HOST);

// This provider is intentionally not global: only the explicit records below leave the app.
export const posthogLogProvider = projectToken && host
  ? new LoggerProvider({
      resource: resourceFromAttributes({ "service.name": "skewed-news" }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${host}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${projectToken}`,
              "Content-Type": "application/json",
            },
          }),
        }),
      ],
    })
  : undefined;

const posthogLogger = posthogLogProvider?.getLogger("skewed-news.posthog");

export function logPostHogPipelineEvent(body: string, attributes: Record<string, string | number>) {
  posthogLogger?.emit({ body, severityNumber: SeverityNumber.INFO, attributes });
}

export async function flushPostHogLogs() {
  await posthogLogProvider?.forceFlush();
}

// Next.js invokes this hook for uncaught errors during requests and rendering.
export async function onRequestError(error: unknown) {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !projectToken || !host) {
    return;
  }

  const { PostHog } = await import("posthog-node");
  const posthog = new PostHog(projectToken, {
    host,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
  });

  await posthog.captureExceptionImmediate(error);
  await posthog.shutdown();
}
