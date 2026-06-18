"use client";

import { useState } from "react";

export default function ShareButton({ title, text, url, className = "", children }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const targetUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
    const shareData = { title, text, url: targetUrl };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or share failed — fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // last resort : nothing we can do silently
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      aria-label={copied ? "Lien copié" : "Partager"}
    >
      {copied ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>Lien copié</span>
        </>
      ) : children ? children : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Partager</span>
        </>
      )}
    </button>
  );
}
