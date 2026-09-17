"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatCandidate } from "@/lib/date";
import type { Answer, Candidate } from "@/lib/types";

// "use server" ファイルからは非同期関数以外をexportできないため、
// 同じ上限値はクライアント側（_components/ResponseForm.tsx）にも定義している。
const NAME_MAX_LENGTH = 30;
const COMMENT_MAX_LENGTH = 100;

const ANSWER_VALUES: Answer[] = ["yes", "maybe", "no"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubmitResponseResult =
  | { ok: true }
  | {
      ok: false;
      // フォーム全体に関わるエラー（イベントが無い・確定済み・保存失敗など）
      formError?: string;
      nameError?: string;
      // 候補日IDごとのエラー
      answerErrors?: Record<string, string>;
      commentErrors?: Record<string, string>;
    };

function isAnswer(value: unknown): value is Answer {
  return typeof value === "string" && (ANSWER_VALUES as string[]).includes(value);
}

/**
 * 参加者の回答を保存する。
 * クライアント側でも同じ検証をしているが、Server Actionは直接POSTできるため
 * ここでの検証を正とする（名前・候補日ID・回答値・文字数をすべてサーバーで確かめる）。
 */
export async function submitResponse(
  eventId: string,
  formData: FormData
): Promise<SubmitResponseResult> {
  if (!UUID_PATTERN.test(eventId)) {
    return { ok: false, formError: "このイベントは見つかりません。URLを確かめてください。" };
  }

  const supabase = createServiceRoleClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, confirmed_candidate_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return { ok: false, formError: "イベントを読み込めませんでした。少し待ってからもう一度送信してください。" };
  }
  if (!event) {
    return { ok: false, formError: "このイベントは見つかりません。URLを確かめてください。" };
  }
  if (event.confirmed_candidate_id) {
    return { ok: false, formError: "この日程はすでに確定しました。回答は受け付けていません。" };
  }

  const { data: candidateRows, error: candidateError } = await supabase
    .from("candidates")
    .select("id, event_id, starts_at, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (candidateError || !candidateRows) {
    return { ok: false, formError: "候補日を読み込めませんでした。少し待ってからもう一度送信してください。" };
  }

  const candidates = candidateRows as Candidate[];
  if (candidates.length === 0) {
    return { ok: false, formError: "候補日がまだ登録されていません。幹事に確かめてください。" };
  }

  // 名前
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  let nameError: string | undefined;
  if (name.length === 0) {
    nameError = "名前を入力してください。";
  } else if (name.length > NAME_MAX_LENGTH) {
    nameError = `名前は${NAME_MAX_LENGTH}文字までにしてください。`;
  }

  // 候補日ごとの回答とコメント
  const answers: Record<string, Answer> = {};
  const answerErrors: Record<string, string> = {};
  const commentErrors: Record<string, string> = {};
  const commentLines: string[] = [];

  for (const candidate of candidates) {
    const rawAnswer = formData.get(`answer_${candidate.id}`);
    if (!isAnswer(rawAnswer)) {
      answerErrors[candidate.id] = "○・△・×のどれかを選んでください。";
    } else {
      answers[candidate.id] = rawAnswer;
    }

    const rawComment = formData.get(`comment_${candidate.id}`);
    const comment = typeof rawComment === "string" ? rawComment.trim() : "";
    if (comment.length > COMMENT_MAX_LENGTH) {
      commentErrors[candidate.id] = `ひとことは${COMMENT_MAX_LENGTH}文字までにしてください。`;
    } else if (comment.length > 0) {
      // responsesテーブルのcommentは1件1カラムなので、候補日の見出しを付けて1つの本文にまとめる
      commentLines.push(`${formatCandidate(candidate.starts_at)}　${comment}`);
    }
  }

  // 知らない候補日IDが混ざっていないか（送信データの改ざん対策）
  const knownAnswerKeys = new Set(candidates.map((candidate) => `answer_${candidate.id}`));
  for (const key of formData.keys()) {
    if (key.startsWith("answer_") && !knownAnswerKeys.has(key)) {
      return { ok: false, formError: "候補日が変わったようです。ページを再読み込みしてから送信してください。" };
    }
  }

  if (nameError || Object.keys(answerErrors).length > 0 || Object.keys(commentErrors).length > 0) {
    return {
      ok: false,
      nameError,
      answerErrors: Object.keys(answerErrors).length > 0 ? answerErrors : undefined,
      commentErrors: Object.keys(commentErrors).length > 0 ? commentErrors : undefined,
    };
  }

  const { error: upsertError } = await supabase.from("responses").upsert(
    {
      event_id: eventId,
      respondent_name: name,
      answers,
      comment: commentLines.length > 0 ? commentLines.join("\n") : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,respondent_name" }
  );

  if (upsertError) {
    return { ok: false, formError: "回答を保存できませんでした。少し待ってからもう一度送信してください。" };
  }

  revalidatePath(`/e/${eventId}`);
  return { ok: true };
}
