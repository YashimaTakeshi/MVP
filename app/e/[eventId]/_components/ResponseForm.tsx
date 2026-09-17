"use client";

import { useEffect, useState, useTransition } from "react";
import type { Answer, Candidate } from "@/lib/types";
import { formatCandidate } from "@/lib/date";
import { submitResponse, type SubmitResponseResult } from "../actions";

// actions.ts（"use server"）は非同期関数しかexportできないため、上限値はここにも持つ
const NAME_MAX_LENGTH = 30;
const COMMENT_MAX_LENGTH = 100;

const OPTIONS: { value: Answer; glyph: string; label: string }[] = [
  { value: "yes", glyph: "○", label: "参加" },
  { value: "maybe", glyph: "△", label: "未定" },
  { value: "no", glyph: "×", label: "不参加" },
];

// Tailwindのクラス名は静的な文字列で持つ（動的生成するとビルド時に検出されないため）
const SELECTED_CLASS: Record<Answer, string> = {
  yes: "border-bamboo bg-bamboo text-surface",
  maybe: "border-mustard bg-mustard text-surface",
  no: "border-ink-muted bg-ink-muted text-surface",
};
const UNSELECTED_CLASS = "border-rule bg-surface text-ink";

type Errors = {
  formError?: string;
  nameError?: string;
  answerErrors?: Record<string, string>;
  commentErrors?: Record<string, string>;
};

export function ResponseForm({
  eventId,
  candidates,
}: {
  eventId: string;
  candidates: Candidate[];
}) {
  const sorted = [...candidates].sort((a, b) => a.sort_order - b.sort_order);

  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [doneAt, setDoneAt] = useState(0);
  const [isPending, startTransition] = useTransition();

  // 「送信しました」は一定時間で消す
  useEffect(() => {
    if (doneAt === 0) return;
    const timer = window.setTimeout(() => setDoneAt(0), 5000);
    return () => window.clearTimeout(timer);
  }, [doneAt]);

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      next.nameError = "名前を入力してください。";
    } else if (trimmed.length > NAME_MAX_LENGTH) {
      next.nameError = `名前は${NAME_MAX_LENGTH}文字までにしてください。`;
    }

    const answerErrors: Record<string, string> = {};
    const commentErrors: Record<string, string> = {};
    for (const candidate of sorted) {
      if (!answers[candidate.id]) {
        answerErrors[candidate.id] = "○・△・×のどれかを選んでください。";
      }
      if ((comments[candidate.id] ?? "").trim().length > COMMENT_MAX_LENGTH) {
        commentErrors[candidate.id] = `ひとことは${COMMENT_MAX_LENGTH}文字までにしてください。`;
      }
    }
    if (Object.keys(answerErrors).length > 0) next.answerErrors = answerErrors;
    if (Object.keys(commentErrors).length > 0) next.commentErrors = commentErrors;
    return next;
  }

  function handleAction(formData: FormData) {
    const clientErrors = validate();
    if (
      clientErrors.nameError ||
      clientErrors.answerErrors ||
      clientErrors.commentErrors
    ) {
      setDoneAt(0);
      setErrors({
        ...clientErrors,
        formError: "入力を見直してから送信してください。",
      });
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result: SubmitResponseResult = await submitResponse(eventId, formData);
      if (result.ok) {
        setErrors({});
        setDoneAt(Date.now());
      } else {
        setDoneAt(0);
        setErrors({
          formError: result.formError,
          nameError: result.nameError,
          answerErrors: result.answerErrors,
          commentErrors: result.commentErrors,
        });
      }
    });
  }

  const answeredCount = sorted.filter((candidate) => answers[candidate.id]).length;

  return (
    <form action={handleAction} noValidate className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="respondent-name" className="block font-medium">
          名前
        </label>
        <input
          id="respondent-name"
          name="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="name"
          placeholder="山田はなこ"
          aria-invalid={errors.nameError ? true : undefined}
          aria-describedby={errors.nameError ? "respondent-name-error" : undefined}
          className={`h-14 w-full rounded-lg border-2 bg-surface px-4 font-handwritten text-lg text-ink placeholder:font-body placeholder:text-base placeholder:text-ink-muted ${
            errors.nameError ? "border-mustard" : "border-rule"
          }`}
        />
        {errors.nameError && (
          <p id="respondent-name-error" className="text-sm text-mustard">
            {errors.nameError}
          </p>
        )}
        <p className="text-sm text-ink-muted">
          同じ名前でもう一度送ると、前の回答を上書きします。
        </p>
      </div>

      <div className="space-y-4">
        {sorted.map((candidate) => {
          const answerError = errors.answerErrors?.[candidate.id];
          const commentError = errors.commentErrors?.[candidate.id];
          const describedBy =
            [
              answerError ? `answer-${candidate.id}-error` : null,
              commentError ? `comment-${candidate.id}-error` : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined;

          return (
            <fieldset
              key={candidate.id}
              className={`space-y-2 border-t-2 pt-4 ${answerError ? "border-t-mustard" : "border-t-rule"}`}
              aria-describedby={describedBy}
            >
              <legend className="font-numeric text-lg font-semibold tabular-nums">
                {formatCandidate(candidate.starts_at)}
              </legend>

              <div className="flex gap-2">
                {OPTIONS.map((option) => {
                  const checked = answers[candidate.id] === option.value;
                  return (
                    <label key={option.value} className="flex-1">
                      <input
                        type="radio"
                        name={`answer_${candidate.id}`}
                        value={option.value}
                        checked={checked}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [candidate.id]: option.value }))
                        }
                        className="peer sr-only"
                      />
                      <span
                        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bamboo ${
                          checked ? SELECTED_CLASS[option.value] : UNSELECTED_CLASS
                        }`}
                      >
                        <span aria-hidden="true" className="text-xl font-bold leading-none">
                          {option.glyph}
                        </span>
                        <span className="text-xs">{option.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {answerError && (
                <p id={`answer-${candidate.id}-error`} className="text-sm text-mustard">
                  {answerError}
                </p>
              )}

              <label htmlFor={`comment-${candidate.id}`} className="sr-only">
                {formatCandidate(candidate.starts_at)}へのひとこと
              </label>
              <input
                id={`comment-${candidate.id}`}
                name={`comment_${candidate.id}`}
                type="text"
                value={comments[candidate.id] ?? ""}
                onChange={(event) =>
                  setComments((prev) => ({ ...prev, [candidate.id]: event.target.value }))
                }
                maxLength={COMMENT_MAX_LENGTH}
                placeholder="ひとこと（任意）"
                aria-invalid={commentError ? true : undefined}
                className={`h-14 w-full rounded-lg border-2 bg-surface px-4 font-handwritten text-base text-ink placeholder:font-body placeholder:text-sm placeholder:text-ink-muted ${
                  commentError ? "border-mustard" : "border-rule"
                }`}
              />
              {commentError && (
                <p id={`comment-${candidate.id}-error`} className="text-sm text-mustard">
                  {commentError}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className="space-y-2">
        {errors.formError && (
          <p role="alert" className="text-sm text-mustard">
            {errors.formError}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="on-bamboo h-14 w-full rounded-lg bg-bamboo font-medium text-surface disabled:opacity-60"
        >
          {isPending ? "送信中" : "送信する"}
        </button>
        <p aria-live="polite" className="min-h-6 text-sm">
          {doneAt > 0 ? (
            <span className="text-bamboo">送信しました</span>
          ) : (
            <span className="text-ink-muted">
              {answeredCount}／{sorted.length}件に回答しました
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
