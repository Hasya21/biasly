import Link from "next/link";
import { Brand } from "@/components/brand";
import styles from "./auth.module.css";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <Link href="/" aria-label="biasly News home" className={styles.brand}>
        <Brand />
      </Link>
      <div className={styles.form}>{children}</div>
      <Link href="/" className={styles.back}>Back to news</Link>
    </main>
  );
}
