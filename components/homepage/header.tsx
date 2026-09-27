"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Globe2, Menu } from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountControls } from "@/components/auth/account-controls";
import posthog from "posthog-js";
import styles from "./homepage.module.css";

type Theme = "light" | "dark" | "auto";
const themeEvent = "biasly-theme-change";

function readTheme(): Theme {
  try {
    const value = localStorage.getItem("biasly-theme");
    return value === "dark" || value === "auto" ? value : "light";
  } catch { return "light"; }
}

function subscribe(listener: () => void) {
  window.addEventListener(themeEvent, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(themeEvent, listener); window.removeEventListener("storage", listener); };
}

function ThemeControls() {
  const savedTheme = useSyncExternalStore(subscribe, readTheme, () => "light");
  const [sessionTheme, setSessionTheme] = useState<Theme>();
  const theme = sessionTheme ?? savedTheme;
  function selectTheme(value: Theme) {
    setSessionTheme(value);
    try { localStorage.setItem("biasly-theme", value); } catch { /* Session controls still work when storage is unavailable. */ }
    window.dispatchEvent(new Event(themeEvent));
    posthog.capture("theme_changed", { theme: value });
  }
  return <div className={styles.theme} data-home-theme={theme} role="group" aria-label="Color theme"><span>Theme:</span>{(["light", "dark", "auto"] as const).map((value) => <button key={value} aria-pressed={theme === value} onClick={() => selectTheme(value)}>{value}</button>)}</div>;
}

function Unavailable({ children, className }: { children: string; className?: string }) {
  return <span className={className} aria-disabled="true" title={`${children} is not available yet`}>{children}</span>;
}

export function Header({ skipTarget = "top-news", isHome = true }: { skipTarget?: string; isHome?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <header>
      <a className={styles.skipLink} href={`#${skipTarget}`}>Skip to news</a>
      <div className={styles.utility}><div className={styles.utilityInner}>
        <div className={styles.utilityLeft}><Unavailable className={styles.extension}>Browser Extension</Unavailable><ThemeControls /></div>
        <div className={styles.utilityRight}><span className={styles.editionDate}>News &amp; analysis</span><Unavailable className={styles.location}>Set Location</Unavailable><span className={styles.edition}><Globe2 size={12} /> International Edition <ChevronDown size={11} /></span></div>
      </div></div>
      <div className={styles.navBorder}><div className={styles.navigation}>
        <details ref={menu} className={styles.menu} onKeyDown={(event) => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
          <summary aria-label="Navigation menu"><Menu size={20} aria-hidden="true" /></summary>
          <nav aria-label="Menu"><Link href="/" onClick={() => { if (menu.current) menu.current.open = false; }}>Home</Link><Link href="/design-system">Design system</Link><p>More features will be available in a future edition.</p></nav>
        </details>
        <Link href="/" aria-label="biasly News home" className={styles.brand}><Brand compact /></Link>
        <nav className={styles.desktopNav} aria-label="Main navigation"><Link href="/" aria-current={isHome ? "page" : undefined}>Home</Link><Unavailable className={styles.forYou}>For You</Unavailable><Unavailable>Local</Unavailable><Unavailable>Blindspot</Unavailable></nav>
        <div className={styles.account}><Unavailable className={styles.subscribe}>Subscribe</Unavailable><AccountControls /></div>
      </div></div>
    </header>
  );
}
