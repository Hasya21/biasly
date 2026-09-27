import "server-only";
import { z } from "zod";
import type { NewAnalysis } from "../supabase/types";
import { validateAnalysis } from "../supabase/validation";

const text = (max: number) => z.string().trim().min(1).max(max);
export const analysisSchema = z
  .object({
    summary: text(4000),
    sentimentScore: z.number().min(-1).max(1),
    sentimentLabel: z.enum(["positive", "neutral", "negative"]),
    politicalFramingLabel: z.enum([
      "left",
      "center",
      "right",
      "mixed",
      "unclear",
    ]),
    leftPercentage: z.number().int().min(0).max(100),
    centerPercentage: z.number().int().min(0).max(100),
    rightPercentage: z.number().int().min(0).max(100),
    confidence: z.number().min(0).max(1),
    framingNotes: z.array(text(1000)).min(1).max(8),
    loadedTerms: z.array(text(160)).max(20),
  })
  .strict();

export const ANALYSIS_DISCLAIMER =
  "Political framing and sentiment are AI-estimated from this article's text, may be inaccurate, and do not establish the publisher's political position. Read the original article and compare other reporting.";
export class AnalysisError extends Error {
  constructor(
    readonly code: string,
    readonly fatal = false,
  ) {
    super("Article analysis failed.");
  }
}
const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function toStoredAnalysis(
  value: unknown,
  articleText: string,
  model: string,
): NewAnalysis {
  const parsed = analysisSchema.safeParse(value);
  if (!parsed.success) throw new AnalysisError("invalid_output");
  const a = parsed.data;
  const scores = [a.leftPercentage, a.centerPercentage, a.rightPercentage];
  const sorted = [...scores].sort((x, y) => y - x);
  const expectedLabel =
    a.confidence < 0.5
      ? "unclear"
      : sorted[0] - sorted[1] < 10
        ? "mixed"
        : (["left", "center", "right"] as const)[scores.indexOf(sorted[0])];
  const expectedSentiment =
    a.sentimentScore < -0.1
      ? "negative"
      : a.sentimentScore > 0.1
        ? "positive"
        : "neutral";
  const total = scores.reduce((sum, score) => sum + score, 0);

  const invalidLoadedTerms = a.loadedTerms.filter(
    (term) => !normalize(articleText).includes(normalize(term)),
  );

  console.log("[analysis-validation]", {
    total,
    percentagesValid: total === 100,

    returnedLabel: a.politicalFramingLabel,
    expectedLabel,
    labelValid: a.politicalFramingLabel === expectedLabel,

    sentimentScore: a.sentimentScore,
    returnedSentiment: a.sentimentLabel,
    expectedSentiment,
    sentimentValid: a.sentimentLabel === expectedSentiment,

    invalidLoadedTerms,
  });

  if (
    total !== 100 ||
    a.politicalFramingLabel !== expectedLabel ||
    a.sentimentLabel !== expectedSentiment ||
    invalidLoadedTerms.length > 0
  ) {
    throw new AnalysisError("invalid_output");
  }
  return validateAnalysis({
    summary: a.summary,
    sentiment_score: a.sentimentScore,
    sentiment_label: a.sentimentLabel,
    bias_label: a.politicalFramingLabel,
    left_percentage: a.leftPercentage,
    center_percentage: a.centerPercentage,
    right_percentage: a.rightPercentage,
    confidence: a.confidence,
    framing_notes: a.framingNotes,
    loaded_terms: a.loadedTerms,
    disclaimer: ANALYSIS_DISCLAIMER,
    model,
  });
}
