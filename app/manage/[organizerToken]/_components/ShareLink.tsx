"use client";

import { useState } from "react";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードAPIが使えない環境向けのフォールバック（手動選択を促す）
      setCopied(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-rule bg-surface p-4">
      <p className="text-sm font-medium">参加者に配るURL</p>
      <p className="break-all text-sm text-ink-muted">{url}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-11 items-center justify-center rounded-lg border border-bamboo px-5 font-medium text-bamboo"
      >
        {copied ? "コピーしました" : "コピーする"}
      </button>
    </section>
  );
}
