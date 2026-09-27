import { sampleArticles, type HomepageArticle } from "@/components/homepage/sample-articles";

export type SampleDetails = {
  article: HomepageArticle;
  originalUrl?: string;
  paragraphs: string[];
  summary: string[];
  framingNotes: string;
  loadedTerms: string[];
  readTime: number;
};

const peaceParagraphs = [
  "The Trump administration has sent Iran a revised nuclear deal proposal that includes tougher terms on uranium enrichment and stronger verification measures, according to the illustrative report presented in this design.",
  "In this sample account, the new proposal is delivered through intermediaries in Oman. It calls for a halt to uranium enrichment on Iranian soil and the removal of enriched uranium stockpiles from the country. It also seeks access for international inspectors to Iranian nuclear facilities, including military sites.",
  "The proposal is framed as a firm negotiating position. Describing the terms as tougher puts the emphasis on pressure and enforcement, while leaving questions about how the agreement would be implemented and monitored.",
  "Iran has not responded to the proposal in this example. Its position is described in terms of access to peaceful nuclear energy and relief from economic sanctions. Those priorities suggest that significant differences would remain between the two sides.",
  "The revised proposal follows several rounds of indirect discussions between American and Iranian officials. The sample narrative contrasts the possibility of a diplomatic breakthrough with the risk of further confrontation if negotiations fail.",
  "European allies are presented as supporting continued negotiations. Their emphasis on diplomacy offers a different perspective from the pressure-focused language used elsewhere in the story, and highlights the importance of keeping a channel for talks open.",
  "Israel is described as supporting a stronger negotiating stance. In this example, that response places preventing a nuclear weapon at the center of the discussion, while the wider regional consequences remain an important part of the story.",
  "The outcome remains unresolved in this illustrative account. The next phase would depend on the response to the proposal, the details of verification, and whether the parties could agree on the relationship between nuclear restrictions and sanctions relief.",
];

const topicContext: Record<string, [string, string, string]> = {
  grapes: ["The sample story examines a review of research into grapes and nutrition.", "Calling a food a superfood can suggest benefits beyond what individual studies establish. Study design, serving sizes, and the wider diet would matter when evaluating the findings.", "superfood"],
  cern: ["The sample story describes a possible signal in particle-physics research at CERN.", "A statistical hint and a confirmed discovery are different stages of evidence. Independent checks and additional measurements would be essential context for interpreting the result.", "high-significance hint"],
  nicaragua: ["This sample account concerns the reported death of an Indigenous leader following detention in Nicaragua.", "A complete account would distinguish confirmed information from claims by authorities, relatives, and rights organizations, and explain what is known about the conditions of detention.", "nearly 3 years of detention"],
  lebanon: ["The sample story concerns an emergency Security Council meeting and military activity in Lebanon.", "Reporting on a conflict requires careful attribution, a distinction between claims and verified events, and attention to the people affected by the fighting.", "pushes deeper"],
  oil: ["The sample story links an oil-price movement with discussion of production levels and demand.", "Prices can respond to several factors at once. Production decisions, forecasts, and actual consumption should be distinguished when explaining a short-term market change.", "weak demand"],
  space: ["The sample story describes a Starship test flight and its place in a longer spaceflight program.", "A test flight can meet some objectives while leaving others unresolved. The engineering results and remaining milestones would help readers assess claims about future missions.", "milestone"],
  apple: ["The sample story covers proposed AI features across Apple's devices.", "An announcement does not establish availability or performance. Supported devices, rollout timing, privacy choices, and independent evaluation would be useful context.", "AI-powered"],
  climate: ["The sample story describes a temperature ranking attributed to a climate-monitoring service.", "Readers would need the measurement period, baseline, and uncertainty to interpret the comparison. A projection for a year should be distinguished from a completed annual record.", "hottest years"],
  fed: ["The sample story describes a decision to hold interest rates and a cautious economic outlook.", "The policy decision, policymakers' forecasts, and market expectations are separate pieces of information. Inflation and growth data would provide context for the decision.", "signals caution"],
  soccer: ["The sample story presents a comeback victory by Real Madrid in a football final.", "A sports result alone does not establish political framing. The illustrative scores demonstrate the interface and should not be treated as a conclusion about the team or its supporters.", "comeback victory"],
  fire: ["The sample story concerns evacuations during wildfires in western Canada.", "An actual emergency report would need current local notices, precise locations, and attribution. This preview is not a source of evacuation guidance or live conditions.", "force thousands to evacuate"],
};

export function getSampleDetails(id: string): SampleDetails | undefined {
  const article = sampleArticles.find((item) => item.id === id);
  if (!article) return undefined;
  const context = topicContext[id];
  const paragraphs = id === "peace" ? peaceParagraphs : [
    context[0], context[1],
    `The headline, “${article.title},” provides the subject for this editorial preview. The accompanying photograph is an illustrative image and does not verify the event described.`,
    "The analysis panel demonstrates how a neutral summary, framing notes, and language cues can be presented alongside an article. Its numbers are sample values, not findings from an AI model or an assessment of a real publisher.",
    "Readers should compare original reporting and attributed evidence before drawing conclusions. No original reporting or live source verification has been performed for this preview.",
  ];
  return {
    article, paragraphs,
    summary: id === "peace" ? [
      "The sample proposal calls for a halt to uranium enrichment and removal of enriched stockpiles.",
      "Expanded international inspection access is a central condition in the illustrative account.",
      "Iran's stated priorities in the example include peaceful nuclear energy and sanctions relief.",
      "European allies favor continued diplomacy, while Israel supports a tougher stance.",
      "The example leaves the negotiations unresolved; it does not report a verified outcome.",
    ] : [context[0], context[1], "This summary and the accompanying scores are illustrative; no AI analysis was performed."],
    framingNotes: id === "peace" ? "The headline emphasizes tougher terms and the administration's negotiating position. The sample body also includes Iranian priorities and European support for diplomacy. These are textual cues, not evidence of a publisher's political affiliation." : `${context[1]} The displayed framing values are illustrative and are not inferred from the publication or subject.`,
    loadedTerms: id === "peace" ? ["tougher terms", "firm negotiating position", "pressure"] : [context[2]],
    readTime: Math.max(1, Math.ceil(paragraphs.join(" ").split(/\s+/).length / 220)),
  };
}

export function getRelatedSamples(article: HomepageArticle) {
  return sampleArticles.filter((item) => item.id !== article.id)
    .sort((a, b) => Number(b.topics.some((topic) => article.topics.includes(topic))) - Number(a.topics.some((topic) => article.topics.includes(topic))))
    .slice(0, 5);
}
