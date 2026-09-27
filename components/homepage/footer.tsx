import { Camera, Play } from "lucide-react";
import { Brand } from "@/components/brand";
import styles from "./homepage.module.css";

export function Footer({ previewLabel = "AI-estimated article framing" }: { previewLabel?: string }) {
  return <footer className={styles.footer}>
    <div className={styles.footerInner}>
      <div className={styles.footerBrand}><Brand compact /><p>Balanced news coverage,<br />powered by AI.</p></div>
      {[{ title: "Company", links: ["About", "Careers", "Press", "Contact"] }, { title: "Help", links: ["Help Center", "Guides", "Privacy Policy", "Terms of Service"] }].map((group) => <section key={group.title}><h2>{group.title}</h2><ul>{group.links.map((label) => <li key={label}><span aria-disabled="true" title="Not available yet">{label}</span></li>)}</ul></section>)}
      <section><h2>Connect</h2><div className={styles.socials}><span aria-label="X, coming soon" role="img">𝕏</span><span role="img" aria-label="LinkedIn, coming soon" className="font-bold">in</span><Camera size={15} role="img" aria-label="Instagram, coming soon" /><Play size={15} role="img" aria-label="YouTube, coming soon" /></div><p className={styles.footerNote}>Links and accounts coming soon.</p></section>
    </div>
    <div className={styles.copyright}><div>© 2026 Biasly News. All rights reserved.<span>{previewLabel}</span></div></div>
  </footer>;
}
