import type { NewsCardArticle } from "@/components/news-card";

export type HomepageArticle = NewsCardArticle & {
  id: string;
  category: string;
  region: string;
  sourceCount: number;
  topics: string[];
  imagePosition?: string;
};

export const topics = [
  "World Cup", "IPL", "Social Media", "Business & Markets", "Health & Medicine",
  "Soccer", "Artificial Intelligence", "Arsenal FC", "Extreme Weather and Disasters",
  "Politics", "Science", "World", "Technology",
];

// Illustrative UI fixtures only. These headlines, publishers, counts, and scores
// are not verified news or the output of an analysis pipeline.
const stories = [
  { id: "peace", category: "Politics", region: "United States", title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report", sourceCount: 12, percentages: { left: 20, center: 31, right: 49 }, framingLabel: "right", sentiment: "neutral", topics: ["Politics", "World"], imageAlt: "Illustrative portrait of Donald Trump", imagePosition: "50% 20%" },
  { id: "grapes", category: "Health", region: "United States", title: "Researchers Make Case for Grapes as a ‘Superfood’ After Review of Health Evidence", sourceCount: 7, percentages: { left: 18, center: 42, right: 40 }, framingLabel: "mixed", sentiment: "positive", topics: ["Health & Medicine", "Science"], imageAlt: "Illustrative photograph of grapes growing in a vineyard" },
  { id: "cern", category: "Science", region: "Switzerland", title: "CERN Finds High-Significance Hint of Physics Beyond Standard Model", sourceCount: 8, percentages: { left: 16, center: 62, right: 22 }, framingLabel: "center", sentiment: "positive", topics: ["Science", "Technology"], imageAlt: "Illustrative photograph of scientific equipment" },
  { id: "nicaragua", category: "World", region: "Nicaragua", title: "Indigenous Leader Brooklyn Rivera Dies in Nicaragua After Nearly 3 Years of Detention", sourceCount: 63, percentages: { left: 54, center: 28, right: 18 }, framingLabel: "left", sentiment: "negative", topics: ["World", "Politics"], imageAlt: "Illustrative landscape of Nicaragua" },
  { id: "lebanon", category: "World", region: "Middle East", title: "UN Security Council to Hold Emergency Meeting as Israel Pushes Deeper into Lebanon", sourceCount: 15, percentages: { left: 22, center: 35, right: 43 }, framingLabel: "right", sentiment: "negative", topics: ["World", "Politics"], imageAlt: "Illustrative photograph of a damaged building, not the reported event" },
  { id: "oil", category: "Business", region: "Global", title: "Oil Prices Dip as OPEC+ Considers Output Increase Amid Weak Demand", sourceCount: 11, percentages: { left: 25, center: 50, right: 25 }, framingLabel: "center", sentiment: "negative", topics: ["Business & Markets"], imageAlt: "Illustrative photograph of a fuel pump" },
  { id: "space", category: "Technology", region: "United States", title: "SpaceX Launches Starship Test Flight in Milestone for Mars Program", sourceCount: 9, percentages: { left: 12, center: 45, right: 43 }, framingLabel: "mixed", sentiment: "positive", topics: ["Technology", "Science"], imageAlt: "Illustrative rocket launch, not the reported flight", imagePosition: "50% 80%" },
  { id: "apple", category: "Business", region: "United States", title: "Apple Unveils AI-Powered Features Across iPhone, iPad and Mac", sourceCount: 10, percentages: { left: 15, center: 40, right: 45 }, framingLabel: "mixed", sentiment: "positive", topics: ["Artificial Intelligence", "Technology", "Business & Markets", "Social Media"], imageAlt: "Illustrative photograph of an Apple store" },
  { id: "climate", category: "Climate", region: "Global", title: "2025 on Track to Be Among Top 3 Hottest Years, EU Climate Service Says", sourceCount: 14, percentages: { left: 33, center: 34, right: 33 }, framingLabel: "mixed", sentiment: "negative", topics: ["Extreme Weather and Disasters", "Science"], imageAlt: "Illustrative photograph of intense sunlight" },
  { id: "fed", category: "Economy", region: "United States", title: "Fed Holds Rates Steady, Signals Caution on Inflation and Growth Outlook", sourceCount: 13, percentages: { left: 30, center: 45, right: 25 }, framingLabel: "center", sentiment: "neutral", topics: ["Business & Markets", "Politics"], imageAlt: "Illustrative photograph of a government building" },
  { id: "soccer", category: "Soccer", region: "Europe", title: "Real Madrid Win Champions League After Comeback Victory in Final", sourceCount: 26, percentages: { left: 10, center: 20, right: 70 }, framingLabel: "right", sentiment: "positive", topics: ["Soccer", "World Cup"], imageAlt: "Illustrative photograph of Real Madrid’s stadium" },
  { id: "fire", category: "Environment", region: "Canada", title: "Wildfires Force Thousands to Evacuate Across Western Canada", sourceCount: 17, percentages: { left: 27, center: 33, right: 40 }, framingLabel: "right", sentiment: "negative", topics: ["Extreme Weather and Disasters", "World"], imageAlt: "Illustrative wildfire photograph, not the reported event" },
] satisfies Array<Omit<HomepageArticle, "source" | "publishedAt" | "publishedLabel" | "summary" | "imageUrl" | "confidence">>;

export const sampleArticles: HomepageArticle[] = stories.map((story) => ({
  ...story,
  source: "Sample publication",
  publishedAt: "2026-06-01",
  publishedLabel: "Jun 1, 2026",
  summary: "An illustrative story from the homepage design reference. Reporting and analysis have not been verified.",
  confidence: story.framingLabel === "mixed" ? 0.54 : 0.78,
  imageUrl: `/images/homepage/${story.id}.jpg`,
}));
