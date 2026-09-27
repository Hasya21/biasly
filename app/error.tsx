"use client";

import Link from "next/link";

export default function NewsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-2xl px-6 py-24">
    <h1 className="text-2xl font-semibold">News is temporarily unavailable</h1>
    <p className="mt-4">We couldn&apos;t load the articles. Please try again shortly.</p>
    <div className="mt-6 flex gap-6"><button className="underline underline-offset-4" onClick={reset}>Try again</button><Link className="underline underline-offset-4" href="/">Back to latest news</Link></div>
  </main>;
}
