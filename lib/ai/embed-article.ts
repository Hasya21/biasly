import "server-only";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Article, Embedding } from "../supabase/types";
import { requiredText, validateEmbedding } from "../supabase/validation";
import { checkAnalysisConfiguration } from "./analyze-article";
import { captureAiGeneration, type AiObservabilityContext } from "./observability";
import { budgetSignal } from "../pipeline/budget";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export type EmbeddingGenerator = (value: string, observability?: AiObservabilityContext) => Promise<Embedding>;
const generate: EmbeddingGenerator = async (value, observability) => {
  const startedAt = Date.now();
  const result = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value,
    maxRetries: 0,
    abortSignal: budgetSignal(90_000),
  });
  if (observability) {
    await captureAiGeneration(observability, {
      model: EMBEDDING_MODEL,
      input: value,
      latencyMs: Date.now() - startedAt,
    });
  }
  return result.embedding;
};

export function embeddingInput(article: Pick<Article, "title">, summary: string): string {
  return `${requiredText(article.title, "Title")}\n\n${requiredText(summary, "Summary")}`;
}

export async function generateArticleEmbedding(article: Pick<Article, "title">, summary: string, generator: EmbeddingGenerator = generate, observability?: AiObservabilityContext): Promise<Embedding> {
  if (generator === generate) checkAnalysisConfiguration();
  return validateEmbedding(await generator(embeddingInput(article, summary), observability));
}
