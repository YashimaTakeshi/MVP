"use client";

import { useState, useTransition } from "react";
import { sendReminder } from "../actions";

export function ReminderButton({
  organizerToken,
  pendingCount,
  totalResponseCount,
}: {
  organizerToken: string;
  pendingCount: number;
  totalResponseCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 参加者名簿が無いため、1人も回答が無いときは未回答者の名前を出せない。
  // その場合はURLの再共有を促す文面に切り替える。
  const noResponsesYet = totalResponseCount === 0;

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

  const label = noResponsesYet ? "回答を呼びかける" : `未回答の${pendingCount}人に知らせる`;
  const description = noResponsesYet
    ? "まだ誰も回答していません。参加者に日程調整のURLを送って呼びかける文面を、あなたのGmailへ送ります。"
    : "未回答の人の名前と回答用URLをまとめた文面を、あなた自身のGmailへ送ります。届いた文面をそのまま転送してください。";
  const sentDescription = noResponsesYet
    ? "呼びかけました。あなたのGmailに文面を送ったので、参加者へ転送してください。"
    : "知らせました。あなたのGmailに文面を送ったので、未回答の人へ転送してください。";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || sent}
        className="on-bamboo inline-flex h-12 w-full items-center justify-center rounded-lg border border-bamboo px-6 font-medium text-bamboo disabled:opacity-60"
      >
        {sent
          ? noResponsesYet
            ? "呼びかけました"
            : "知らせました"
          : isPending
            ? "送っています"
            : label}
      </button>
      <p className="text-sm text-ink-muted leading-relaxed" aria-live="polite">
        {sent ? sentDescription : description}
      </p>
      {error && (
        <p className="text-sm text-mustard" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
