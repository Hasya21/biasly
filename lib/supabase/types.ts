export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type SentimentLabel = "positive" | "neutral" | "negative";
export type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";
export type Embedding = number[];
export type StoredEmbedding = number[] | string;

export type Source = {
  id: string; name: string; listing_url: string; parser_strategy: string | null;
  active: boolean; logo_url: string | null; created_at: string; updated_at: string;
};
export type Article = {
  id: string; source_id: string; original_url: string; canonical_url: string;
  title: string; image_url: string; published_at: string; raw_text: string;
  scraped_at: string; analyzed_at: string | null;
};
export type ArticleAnalysis = {
  id: string; article_id: string; summary: string; sentiment_score: number;
  sentiment_label: SentimentLabel; bias_score: number; bias_label: BiasLabel;
  left_percentage: number; center_percentage: number; right_percentage: number;
  confidence: number; framing_notes: string[]; loaded_terms: string[];
  disclaimer: string; model: string; embedding: StoredEmbedding | null; created_at: string;
};
export type Log = {
  id: string; event_type: string; level: "info" | "warn" | "error"; message: string;
  source_id: string | null; article_id: string | null; run_id: string | null;
  context: { [key: string]: Json | undefined }; created_at: string;
};
export type Schedule = {
  id: string; source_id: string; schedule_id: string; state: "active" | "inactive";
  listing_url: string | null;
  last_attempted_at: string | null;
  created_at: string; updated_at: string;
};
export type ScheduleRun = {
  id: string; schedule_id: string; external_run_id: string; job_id: string;
  status: "processing" | "completed" | "failed"; started_at: string;
  completed_at: string | null; summary: { [key: string]: Json | undefined };
  error_code: string | null;
};
export type NewSource = Pick<Source, "name" | "listing_url"> & Partial<Pick<Source, "parser_strategy" | "active" | "logo_url">>;
export type NewArticle = Omit<Article, "id" | "scraped_at" | "analyzed_at">;
export type NewAnalysis = Omit<ArticleAnalysis, "id" | "article_id" | "bias_score" | "embedding" | "created_at">;
export type NewLog = Pick<Log, "event_type" | "level" | "message"> & Partial<Pick<Log, "source_id" | "article_id" | "run_id" | "context">>;
export type NewSchedule = Pick<Schedule, "source_id" | "schedule_id" | "state"> & Partial<Pick<Schedule, "listing_url">>;
export type NewRun = Pick<ScheduleRun, "schedule_id" | "external_run_id" | "job_id">;

type Relationship<Name extends string, Column extends string, Target extends string, One extends boolean = false> = {
  foreignKeyName: Name; columns: [Column]; isOneToOne: One;
  referencedRelation: Target; referencedColumns: ["id"];
};
type Table<Row, Insert, Relations, Update = Partial<Insert>> = {
  Row: Row; Insert: Insert; Update: Update; Relationships: Relations;
};
export type Database = {
  public: {
    Tables: {
      article_analysis_work: Table<{
        article_id: string; attempt_token: string; last_run_id: string; last_attempted_at: string;
        was_fresh: boolean; in_progress: boolean; failures: number; next_attempt_at: string; error_code: string | null;
      }, never, [Relationship<"article_analysis_work_article_id_fkey", "article_id", "articles", true>]>;
      pipeline_leases: Table<{ name: "scheduler" | "hourly_pipeline"; owner: string; expires_at: string }, { name: "scheduler" | "hourly_pipeline"; owner: string; expires_at: string }, []>;
      sources: Table<Source, NewSource, []>;
      articles: Table<Article, NewArticle, [Relationship<"articles_source_id_fkey", "source_id", "sources">], { analyzed_at?: string | null }>;
      article_analyses: Table<ArticleAnalysis, NewAnalysis & { article_id: string }, [Relationship<"article_analyses_article_id_fkey", "article_id", "articles", true>], Record<string, never>>;
      logs: Table<Log, NewLog, [Relationship<"logs_source_id_fkey", "source_id", "sources">, Relationship<"logs_article_id_fkey", "article_id", "articles">], Record<string, never>>;
      oxylabs_schedules: Table<Schedule, NewSchedule, [Relationship<"oxylabs_schedules_source_id_fkey", "source_id", "sources", true>], Partial<NewSchedule> & { last_attempted_at?: string }>;
      oxylabs_schedule_runs: Table<ScheduleRun, NewRun, [Relationship<"oxylabs_schedule_runs_schedule_id_fkey", "schedule_id", "oxylabs_schedules">], Partial<Pick<ScheduleRun, "status" | "started_at" | "completed_at" | "summary" | "error_code">>>;
    };
    Views: Record<string, never>;
    Functions: {
      get_analysis_candidates: { Args: { p_run_id: string; p_limit?: number; p_article_ids?: string[] }; Returns: PendingArticle[] };
      claim_article_analysis: { Args: { p_article_id: string; p_run_id: string }; Returns: string | null };
      finish_article_analysis: { Args: { p_article_id: string; p_token: string; p_success: boolean; p_error_code?: string }; Returns: boolean };
      acquire_pipeline_lease: { Args: { p_name: string; p_owner: string }; Returns: boolean };
      release_pipeline_lease: { Args: { p_name: string; p_owner: string }; Returns: undefined };
      valid_article_body: { Args: { body: string }; Returns: boolean };
      save_article_analysis: { Args: { p_article_id: string; p_analysis: Json; p_embedding: Embedding }; Returns: ArticleAnalysis[] };
      save_article_embedding: { Args: { p_article_id: string; p_embedding: Embedding }; Returns: ArticleAnalysis[] };
      get_pending_articles: {
        Args: { p_limit?: number; p_after_scraped_at?: string; p_after_id?: string; p_article_ids?: string[] };
        Returns: PendingArticle[];
      };
      match_related_articles: { Args: { p_article_id: string; p_query_embedding: StoredEmbedding; p_limit?: number }; Returns: RelatedArticle[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PublicSource = Pick<Source, "id" | "name" | "listing_url" | "logo_url">;
export type FeedAnalysis = Pick<ArticleAnalysis, "sentiment_label" | "bias_label" | "left_percentage" | "center_percentage" | "right_percentage" | "confidence" | "model">;
export type PublishedArticle = Pick<Article, "id" | "title" | "image_url" | "published_at" | "original_url" | "canonical_url"> & {
  source: PublicSource; analysis: FeedAnalysis;
};
export type ArticleDetails = Omit<PublishedArticle, "analysis"> & { raw_text: string; analysis: ArticleAnalysis };
export type PendingCursor = { scraped_at: string; id: string };
export type PendingArticle = Article & { needs_analysis: boolean; analysis_summary: string | null };
export type RelatedArticle = Pick<Article, "id" | "title" | "image_url" | "published_at"> & {
  source_name: string;
};
