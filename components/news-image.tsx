"use client";
import Image from "next/image";
import { useState } from "react";

/** Browser-loaded images keep publisher URLs out of the server image proxy. */
export function NewsImage({ src, alt = "", sizes, eager = false, className }: { src?: string; alt?: string; sizes: string; eager?: boolean; className?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  if (!src || failedSource === src) return <span role="img" aria-label="Article image unavailable" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm">Image unavailable</span>;
  return <Image src={src} alt={alt} fill unoptimized sizes={sizes} loading={eager ? "eager" : "lazy"} className={className} style={{ objectFit: "cover" }} onError={() => setFailedSource(src)} />;
}
