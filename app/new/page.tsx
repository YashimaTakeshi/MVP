"use client";

import { useActionState, useRef, useState } from "react";
import { AppFooter } from "@/components/AppFooter";
import { createEvent, type CreateEventState } from "./actions";
import { CandidateDateField } from "./_components/CandidateDateField";

const TITLE_MAX = 50;
const MEMO_MAX = 200;
const CANDIDATE_MAX = 30;

// `<input type="datetime-local">` の値（例: 2026-09-18T19:00）
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// Googleカレンダー連携（OAuth本体は別担当が実装中のため、今は導線だけ置く）。
// つくったあとの管理ページでは `/api/auth/signin/google?callbackUrl=/manage/{organizerToken}` を使うが、
// このページではまだ organizer_token が発行されていないので、戻り先はこのページにしておく。
const GOOGLE_CONNECT_HREF = "/api/auth/signin/google?callbackUrl=/new";

type CandidateField = {
  id: string;
  value: string;
};

const INITIAL_CANDIDATES: CandidateField[] = [
  { id: "candidate-1", value: "" },
  { id: "candidate-2", value: "" },
];

// クライアント側の事前チェック。サーバー側（actions.ts）でも同じ内容を必ず検証している。
function validateOnClient(formData: FormData): string | null {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return "イベント名を入れてください。";
  if (title.length > TITLE_MAX) return `イベント名は${TITLE_MAX}文字までにしてください。`;

  const memo = String(formData.get("memo") ?? "").trim();
  if (memo.length > MEMO_MAX) return `メモは${MEMO_MAX}文字までにしてください。`;

  const candidates = formData
    .getAll("candidate")
    .map((value) => String(value).trim())
    .filter((value) => value !== "");

  if (candidates.length === 0) return "候補日を1つ以上入れてください。";
  if (candidates.length > CANDIDATE_MAX) return `候補日は${CANDIDATE_MAX}件までにしてください。`;
  if (candidates.some((value) => !DATETIME_LOCAL_PATTERN.test(value))) {
    return "候補日の日付と時刻を正しく入れてください。";
  }
  return null;
}

export default function NewEventPage() {
  // React 19は<form action>の完了後に未制御の入力欄を初期化するため、
  // エラーで戻ってきたときに入力が消えないよう、すべての欄を状態で持つ。
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [candidates, setCandidates] = useState<CandidateField[]>(INITIAL_CANDIDATES);
  const nextCandidateId = useRef(INITIAL_CANDIDATES.length + 1);

  const [state, formAction, isPending] = useActionState<CreateEventState, FormData>(
    async (_previousState, formData) => {
      const clientError = validateOnClient(formData);
      if (clientError) return { error: clientError };
      return createEvent(formData);
    },
    { error: null },
  );

  function addCandidate() {
    setCandidates((current) => [
      ...current,
      { id: `candidate-${nextCandidateId.current++}`, value: "" },
    ]);
  }

  function removeCandidate(id: string) {
    setCandidates((current) =>
      current.length <= 1 ? current : current.filter((candidate) => candidate.id !== id),
    );
  }

  function updateCandidate(id: string, value: string) {
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === id ? { ...candidate, value } : candidate)),
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[34rem] flex-1 px-4 py-10">
        <h1 className="font-heading text-2xl font-bold leading-snug">イベントをつくる</h1>
        <p className="mt-2 leading-relaxed text-ink-muted">
          イベント名と候補日を決めると、参加者に配るURLと、幹事だけが使う管理URLができます。
        </p>

        <form action={formAction} className="mt-10 space-y-10">
          {/* イベント名 */}
          <div className="space-y-2">
            <label htmlFor="title" className="block font-heading font-bold">
              イベント名
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={TITLE_MAX}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="歓迎会"
              aria-describedby="title-hint"
              className="h-11 w-full rounded-lg border border-rule bg-surface px-2 text-ink"
            />
            <p id="title-hint" className="text-sm text-ink-muted">
              {TITLE_MAX}文字までです。
            </p>
          </div>

          {/* 候補日程 */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-heading font-bold">候補日程</h2>
              <p className="text-sm text-ink-muted">
                日付と時刻を入れてください。空のままの欄は送りません。
              </p>
            </div>

            <div className="space-y-4">
              {candidates.map((candidate, index) => (
                <CandidateDateField
                  key={candidate.id}
                  index={index}
                  fieldId={candidate.id}
                  value={candidate.value}
                  onChange={(value) => updateCandidate(candidate.id, value)}
                  onRemove={() => removeCandidate(candidate.id)}
                  removable={candidates.length > 1}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addCandidate}
              disabled={candidates.length >= CANDIDATE_MAX}
              className="h-11 w-full rounded-lg border border-rule bg-surface px-4 text-ink"
            >
              候補日を足す
            </button>
          </div>

          {/* メモ */}
          <div className="space-y-2">
            <label htmlFor="memo" className="block font-heading font-bold">
              メモ
            </label>
            <textarea
              id="memo"
              name="memo"
              rows={3}
              maxLength={MEMO_MAX}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="集合場所や会費など、参加者に伝えたいこと"
              aria-describedby="memo-hint"
              className="w-full rounded-lg border border-rule bg-surface p-2 text-ink"
            />
            <p id="memo-hint" className="text-sm text-ink-muted">
              なくても大丈夫です。{MEMO_MAX}文字までです。
            </p>
          </div>

          {/* Googleカレンダー連携の導線 */}
          <section className="space-y-2 rounded-lg border border-rule bg-surface p-4">
            <h2 className="font-heading font-bold">Googleカレンダー</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              つなぐと、幹事の予定と候補日を照らし合わせられます。つくったあとの管理ページからでもつなげます。
            </p>
            <a
              href={GOOGLE_CONNECT_HREF}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-rule px-4 text-ink"
            >
              Googleカレンダーとつなぐ
            </a>
            <p className="text-sm text-ink-muted">つながなくても日程調整はできます。</p>
          </section>

          {state.error ? (
            <p role="alert" className="rounded-lg border border-rule bg-surface p-4 text-mustard">
              {state.error}
            </p>
          ) : null}

          <div className="space-y-2">
            <button
              type="submit"
              disabled={isPending}
              className="on-bamboo h-12 w-full rounded-lg bg-bamboo px-6 font-medium text-surface"
            >
              {isPending ? "つくっています" : "この内容でつくる"}
            </button>
            <p className="text-sm leading-relaxed text-ink-muted">
              つくると、参加者に配る公開URLと、幹事だけが使う管理URLの2つができます。管理URLは参加者に渡さないでください。
            </p>
          </div>
        </form>
      </main>
      <AppFooter />
    </div>
  );
}
