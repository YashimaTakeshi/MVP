"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";

const TITLE_MAX = 50;
const MEMO_MAX = 200;
const CANDIDATE_MAX = 30;

// `<input type="datetime-local">` の値（例: 2026-09-18T19:00 / 2026-09-18T19:00:00）
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export type CreateEventState = {
  error: string | null;
};

// datetime-localは「壁掛け時計の時刻」でタイムゾーンを持たない。
// サーバーのローカルタイムゾーン（多くの場合UTC）で解釈すると9時間ずれるため、
// このアプリの基準であるJST（+09:00）として解釈してISO文字列（UTC）に変換する。
function toIsoFromJstLocal(value: string): string | null {
  if (!DATETIME_LOCAL_PATTERN.test(value)) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${withSeconds}+09:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * 幹事がイベントを作成するServer Action。
 * 成功時は幹事だけが使う管理URL `/manage/{organizer_token}` へリダイレクトする（この関数は値を返さない）。
 * 失敗時のみ `{ error }` を返し、呼び出し側（/new）でそのまま表示する。
 */
export async function createEvent(formData: FormData): Promise<CreateEventState> {
  // --- サーバー側バリデーション（クライアント側の検証は迂回できるため、ここでも必ず検証する） ---
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "イベント名を入れてください。" };
  }
  if (title.length > TITLE_MAX) {
    return { error: `イベント名は${TITLE_MAX}文字までにしてください。` };
  }

  const memoRaw = String(formData.get("memo") ?? "").trim();
  if (memoRaw.length > MEMO_MAX) {
    return { error: `メモは${MEMO_MAX}文字までにしてください。` };
  }
  const memo = memoRaw === "" ? null : memoRaw;

  const rawCandidates = formData
    .getAll("candidate")
    .map((value) => String(value).trim())
    .filter((value) => value !== "");

  if (rawCandidates.length === 0) {
    return { error: "候補日を1つ以上入れてください。" };
  }
  if (rawCandidates.length > CANDIDATE_MAX) {
    return { error: `候補日は${CANDIDATE_MAX}件までにしてください。` };
  }

  const startsAtList: string[] = [];
  for (const raw of rawCandidates) {
    const iso = toIsoFromJstLocal(raw);
    if (!iso) {
      return { error: "候補日の日付と時刻を正しく入れてください。" };
    }
    startsAtList.push(iso);
  }

  // --- 保存 ---
  const supabase = createServiceRoleClient();

  // organizer_token はDBのデフォルト（gen_random_uuid()）に任せ、INSERT後に受け取る。
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({ title, memo, organizer_id: null })
    .select("id, organizer_token")
    .single();

  if (eventError || !event) {
    console.error("events insert failed", eventError);
    return { error: "イベントをつくれませんでした。少し待ってからもう一度ためしてください。" };
  }

  const { error: candidatesError } = await supabase.from("candidates").insert(
    startsAtList.map((startsAt, index) => ({
      event_id: event.id,
      starts_at: startsAt,
      sort_order: index,
    })),
  );

  if (candidatesError) {
    console.error("candidates insert failed", candidatesError);
    // 候補日のないイベントは使えないため、作りかけのイベントを消してから知らせる。
    await supabase.from("events").delete().eq("id", event.id);
    return { error: "候補日を保存できませんでした。少し待ってからもう一度ためしてください。" };
  }

  // redirect() は例外を投げて制御を移すため、必ずtry/catchの外で呼ぶ。
  redirect(`/manage/${event.organizer_token}`);
}
