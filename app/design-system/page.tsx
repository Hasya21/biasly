import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Menu, Search, Bookmark, Clock, Info, Share, ExternalLink, CalendarDays, ChartNoAxesCombined, Tag, UserRound, Bell, SlidersHorizontal, CircleCheck, Ellipsis } from "lucide-react";
import { Brand } from "@/components/brand";
import { BiasMeter } from "@/components/bias-meter";
import { NewsCard, type NewsCardArticle } from "@/components/news-card";
import { BookmarkExample, ButtonExamples, ChipExamples } from "@/components/design-system/interactive-examples";
import styles from "@/components/design-system/preview.module.css";

export const metadata: Metadata = {
  title: "biasly — Design System",
  description: "The visual foundations of biasly. Balanced news coverage, powered by AI.",
};

function Panel({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return <section aria-labelledby={`${name}-title`} className={`${styles.panel} ${styles[name]}`}><h2 id={`${name}-title`} className={styles.heading}>{title}</h2>{children}</section>;
}

const colorGroups = [
  { title: "Primary", colors: [["Text primary", "#0D0D0F", "var(--foreground)"], ["Text secondary", "#6B7280", "var(--muted-foreground)"], ["Surface", "#F6F6F6", "var(--surface)"]] },
  { title: "Semantic", colors: [["Left bias", "#B42318", "var(--framing-left)"], ["Center", "#E5E7EB", "var(--framing-center)"], ["Right bias", "#1D4ED8", "var(--framing-right)"]] },
  { title: "Neutrals", colors: [["BG primary", "#FFFFFF", "var(--background)"], ["BG secondary", "#F0F0F0", "var(--secondary)"], ["Border", "#E5E7EB", "var(--border)"], ["Divider", "#E5E7EB", "var(--border)"]] },
];
const typeRows = [
  ["H1", "Page / Screen title", "32px", "Bold", "1.2", "text-h1"],
  ["H2", "Section title", "24px", "SemiBold", "1.3", "text-h2"],
  ["H3", "Card / Module title", "20px", "SemiBold", "1.3", "text-h3"],
  ["H4", "Subheading", "16px", "Medium", "1.4", "text-h4"],
  ["Body Large", "Important content", "16px", "Regular", "1.6", "text-body-lg"],
  ["Body Medium", "Body text", "14px", "Regular", "1.6", "text-body-md"],
  ["Body Small", "Supporting text", "13px", "Regular", "1.6", "text-body-sm"],
  ["Caption", "Labels, meta text", "11px", "Regular", "1.4", "text-caption"],
];
const icons = [[Menu, "Menu"], [Search, "Search"], [Bookmark, "Bookmark"], [Clock, "Clock"], [Info, "Information"], [Share, "Share"], [ExternalLink, "External link"], [CalendarDays, "Calendar"], [ChartNoAxesCombined, "Chart"], [Tag, "Tag"], [UserRound, "User"], [Bell, "Notifications"], [SlidersHorizontal, "Filters"], [CircleCheck, "Success"], [Ellipsis, "More"]] as const;
const sampleArticle: NewsCardArticle = {
  title: "A clearer view of the stories shaping our world",
  source: "Sample publication",
  publishedAt: "2026-06-01",
  publishedLabel: "Jun 1, 2026",
  summary: "An example of how a news story pairs with a concise summary and transparent framing insights.",
  sentiment: "neutral", framingLabel: "center", percentages: { left: 25, center: 50, right: 25 }, confidence: 0.82, readTimeMinutes: 12,
};

export default function Home() {
  return (
    <main className={styles.preview}>
      <h1 className="sr-only">biasly News design system</h1>
      <div className={styles.board}>
        <Panel title="Brand" name="brand"><div className={styles.brandContent}><Brand /><p>Balanced news coverage,<br />powered by AI.</p></div></Panel>
        <Panel title="Colors" name="colors">{colorGroups.map((group) => <div key={group.title} className={styles.colorGroup}><h3 className={styles.label}>{group.title}</h3><div className={styles.swatches}>{group.colors.map(([label, hex, color]) => <div key={label}><div className={styles.swatch} style={{ background: color }} /><p>{label}</p><span>{hex}</span></div>)}</div></div>)}</Panel>
        <Panel title="Typography" name="typography"><div className={styles.typeLayout}><div><h3 className={styles.label}>Font family</h3><p className="mt-3 text-h1 tracking-tight">Poppins</p><p className="mt-3 text-body-sm text-muted-foreground">Poppins is a modern geometric sans-serif typeface that ensures clarity and excellent readability.</p></div><div className={styles.tableScroll}><table className={styles.typeTable}><thead><tr><th colSpan={2}>Style</th><th>Size</th><th>Weight</th><th>Line height</th></tr></thead><tbody>{typeRows.map(([label, description, size, weight, lineHeight, className]) => <tr key={label}><th scope="row" className={className}>{label}</th><td>{description}</td><td>{size}</td><td>{weight}</td><td>{lineHeight}</td></tr>)}</tbody></table></div></div></Panel>
        <Panel title="UI elements" name="elements"><h3 className={styles.label}>Buttons</h3><ButtonExamples /><h3 className={`${styles.label} mt-4 mb-3`}>Chip / Category</h3><ChipExamples /><h3 className={`${styles.label} mt-6 mb-3`}>Bias meter <span className="normal-case text-muted-foreground">· AI-estimated</span></h3><BiasMeter percentages={{ left: 25, center: 50, right: 25 }} showAxis /></Panel>
        <Panel title="Icons" name="icons"><div className={styles.iconGrid}>{icons.map(([Icon, label]) => <span key={label} role="img" aria-label={label} title={label}><Icon size={24} strokeWidth={2} aria-hidden="true" /></span>)}</div><p className="text-body-sm text-muted-foreground">Line style · 2px stroke · Rounded caps</p></Panel>
        <Panel title="Card example" name="card"><NewsCard article={sampleArticle} illustrative action={<BookmarkExample />} /></Panel>
        <Panel title="Spacing system" name="spacing"><p className="text-caption text-muted-foreground">4px base unit</p><div className={styles.spacingBars}>{[4, 8, 16, 24, 32, 40, 64].map((size) => <div key={size}><span style={{ width: `var(--space-${size / 4})`, height: `var(--space-${size / 4})` }} /><p>{size}px</p></div>)}</div><p className="text-body-sm text-muted-foreground">Consistent spacing scale based on a 4px base unit</p></Panel>
        <Panel title="Grid system" name="grid"><div className={styles.gridDemo}><div className={styles.columns} aria-label="12 column grid">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div><dl>{[["Container", "1280px"], ["Columns", "12"], ["Gutter", "24px"], ["Margin", "24px"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></Panel>
        <Panel title="Shadows" name="shadows"><div className={styles.samples}>{[["Small", "shadow-sm", "0px 1px 2px rgba(0,0,0,0.05)"], ["Medium", "shadow-md", "0px 4px 12px rgba(0,0,0,0.08)"], ["Large", "shadow-lg", "0px 12px 24px rgba(0,0,0,0.12)"]].map(([label, className, value]) => <div key={label}><span className={`rounded-sm ${className}`} /><p><strong>{label}</strong><br />{value}</p></div>)}</div></Panel>
        <Panel title="Border radius" name="radii"><div className={styles.samples}>{[["Small", "rounded-sm", "4px"], ["Medium", "rounded-md", "8px"], ["Large", "rounded-lg", "12px"], ["Full", "rounded-full", "9999px"]].map(([label, className, value]) => <div key={label}><span className={className} /><p className={styles.radiusLabel}><strong>{label}</strong><span>{value}</span></p></div>)}</div></Panel>
      </div>
      <footer className={styles.footer}><Brand compact /><p>Balanced news coverage,<br />powered by AI.</p><p className={styles.version}>Design System v1.0 <span>June 1, 2026</span></p><p>Stay consistent. Stay unbiased.</p></footer>
    </main>
  );
}
