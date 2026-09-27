"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryChip } from "@/components/category-chip";

export function ButtonExamples() {
  const [feedback, setFeedback] = useState("Select a button to preview its interaction.");
  return (
    <div>
      <div className="grid grid-cols-[48px_repeat(4,minmax(0,1fr))] items-center gap-x-2 gap-y-3 text-[10px]">
        <span />{["Default", "Hover", "Outline", "Disabled"].map((label) => <span className="text-center text-muted-foreground" key={label}>{label}</span>)}
        {(["Primary", "Secondary", "Text"] as const).map((row) => <div className="contents" key={row}>
          <span>{row}</span>
          {(["Default", "Hover", "Outline", "Disabled"] as const).map((state) => <Button key={state} size="sm" variant={state === "Outline" ? "outline" : row === "Primary" ? "default" : row === "Secondary" ? "secondary" : "text"} disabled={state === "Disabled"} className={"w-full px-1 text-[10px] " + (state === "Hover" ? row === "Primary" ? "bg-primary/85" : row === "Secondary" ? "bg-secondary" : "underline" : "")} onClick={() => setFeedback(row + " button activated (" + state.toLowerCase() + " example).")}>Button</Button>)}
        </div>)}
      </div>
      <p role="status" className="mt-3 min-h-8 text-[10px] text-muted-foreground">{feedback}</p>
    </div>
  );
}

export function ChipExamples() {
  const [selected, setSelected] = useState<string[]>([]);
  return <div className="flex flex-wrap gap-2">{["World Cup", "IPL", "Business & Markets", "More"].map((name) => <CategoryChip key={name} selected={selected.includes(name)} onClick={() => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])}>{name}</CategoryChip>)}</div>;
}

export function BookmarkExample() {
  const [saved, setSaved] = useState(false);
  return <Button variant="text" size="icon" aria-label={saved ? "Remove example bookmark" : "Bookmark example article"} aria-pressed={saved} title={saved ? "Bookmarked for this preview" : "Bookmark example article"} onClick={() => setSaved(!saved)}><Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} /></Button>;
}
