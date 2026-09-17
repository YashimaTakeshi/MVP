"use client";

import { useState, useTransition } from "react";
import { sendReminder } from "../actions";

export function ReminderButton({
  organizerToken,
  pendingCount,
}: {
  organizerToken: string;
  pendingCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendReminder(organizerToken);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || sent}
        className="on-bamboo inline-flex h-12 w-full items-center justify-center rounded-lg border border-bamboo px-6 font-medium text-bamboo disabled:opacity-60"
      >
        {sent ? "知らせました" : isPending ? "送っています" : `未回答の${pendingCount}人に知らせる`}
      </button>
      <p className="text-sm text-ink-muted leading-relaxed" aria-live="polite">
        {sent
          ? "知らせました。あなたのGmailに文面を送ったので、未回答の人へ転送してください。"
          : "未回答の人の名前と回答用URLをまとめた文面を、あなた自身のGmailへ送ります。届いた文面をそのまま転送してください。"}
      </p>
      {error && (
        <p className="text-sm text-vermilion" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
