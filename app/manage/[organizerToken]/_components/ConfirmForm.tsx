"use client";

import { useState, useTransition } from "react";
import { confirmEvent } from "../actions";

export type ConfirmChoice = {
  id: string;
  label: string;
  yesCount: number;
  hasCollision: boolean;
};

export function ConfirmForm({
  organizerToken,
  choices,
}: {
  organizerToken: string;
  choices: ConfirmChoice[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (choices.length === 0) return null;

  const handleSubmit = () => {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmEvent(organizerToken, selectedId);
      if (!result.ok) setError(result.message);
      // 成功時はrevalidatePathでページが確定状態に切り替わる
    });
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-heading font-medium">この日にきめる</legend>
        {choices.map((choice) => (
          <label
            key={choice.id}
            className={`flex min-h-11 cursor-pointer items-center gap-4 rounded-lg border px-4 py-2 ${
              selectedId === choice.id ? "border-bamboo bg-bamboo/5" : "border-rule bg-surface"
            }`}
          >
            <input
              type="radio"
              name="candidate"
              value={choice.id}
              checked={selectedId === choice.id}
              onChange={() => setSelectedId(choice.id)}
              className="h-5 w-5 accent-[var(--color-bamboo)]"
            />
            <span className="font-numeric">{choice.label}</span>
            <span className="ml-auto flex items-center gap-2">
              {choice.hasCollision && (
                <span className="text-xs text-vermilion">予定あり</span>
              )}
              <span className="font-numeric text-ink-muted">○ {choice.yesCount}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedId || isPending}
        className="on-bamboo inline-flex h-12 w-full items-center justify-center rounded-lg bg-bamboo px-6 font-medium text-surface disabled:opacity-60"
      >
        {isPending ? "きめています" : "この日にきめる"}
      </button>

      {error && (
        <p className="text-sm text-mustard" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
