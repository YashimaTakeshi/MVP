"use server";

import { revalidatePath } from "next/cache";
import { getOrganizerById } from "@/lib/auth";
import { insertConfirmedCalendarEvent } from "@/lib/google/calendar";
import { sendReminderToOrganizer } from "@/lib/google/gmail";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Candidate, EventRecord, ResponseRecord } from "@/lib/types";
import { listPendingNames } from "./_components/pending";

export type ActionResult = { ok: true } | { ok: false; message: string };

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Server Actionは「そのページを開ける人なら誰でも叩けるPOSTエンドポイント」なので、
 * 画面を出し分けているだけでは権限チェックにならない。
 * 幹事操作の唯一の鍵は organizer_token（管理URLの秘密値）なので、毎回ここで引き直す。
 */
async function findEventByOrganizerToken(organizerToken: string): Promise<EventRecord | null> {
  if (!UUID_PATTERN.test(organizerToken)) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_token", organizerToken)
    .maybeSingle();
  if (error) {
    console.error("イベントの取得に失敗しました", error);
    return null;
  }
  return (data as EventRecord | null) ?? null;
}

/**
 * 未回答者へのリマインド。
 * 参加者のメールアドレスは1件も持っていないため、送信先は幹事自身のGmailアドレス。
 * 幹事は届いた文面を、普段の連絡手段で未回答者へ転送する。
 */
export async function sendReminder(organizerToken: string): Promise<ActionResult> {
  const event = await findEventByOrganizerToken(organizerToken);
  if (!event) {
    return { ok: false, message: "イベントが見つかりませんでした" };
  }
  if (!event.organizer_id) {
    return { ok: false, message: "先にGoogleカレンダーとつないでください" };
  }

  const supabase = createServiceRoleClient();
  const [candidatesResult, responsesResult] = await Promise.all([
    supabase.from("candidates").select("*").eq("event_id", event.id).order("sort_order", { ascending: true }),
    supabase.from("responses").select("*").eq("event_id", event.id).order("created_at", { ascending: true }),
  ]);
  if (candidatesResult.error || responsesResult.error) {
    console.error("集計データの取得に失敗しました", candidatesResult.error ?? responsesResult.error);
    return { ok: false, message: "うまく送れませんでした。時間をおいてもう一度お試しください" };
  }

  const candidates = (candidatesResult.data ?? []) as Candidate[];
  const responses = (responsesResult.data ?? []) as ResponseRecord[];
  const pendingNames = listPendingNames(candidates, responses);
  if (pendingNames.length === 0) {
    return { ok: false, message: "未回答の人はいません" };
  }

  const organizer = await getOrganizerById(event.organizer_id);
  if (!organizer) {
    return { ok: false, message: "Googleとの連携が切れています。つなぎ直してください" };
  }

  try {
    await sendReminderToOrganizer(organizer, {
      eventTitle: event.title,
      eventId: event.id,
      pendingNames,
    });
  } catch (error) {
    console.error("リマインドメールの送信に失敗しました", error);
    return { ok: false, message: "うまく送れませんでした。時間をおいてもう一度お試しください" };
  }

  return { ok: true };
}

/**
 * 日程の確定。Google連携の有無にかかわらず確定はできる（連携時だけカレンダー登録が追加される）。
 */
export async function confirmEvent(organizerToken: string, candidateId: string): Promise<ActionResult> {
  const event = await findEventByOrganizerToken(organizerToken);
  if (!event) {
    return { ok: false, message: "イベントが見つかりませんでした" };
  }
  if (event.confirmed_candidate_id) {
    // すでに確定済み。再表示すれば確定状態が出るので、エラーにはせず案内だけ返す。
    revalidatePath(`/manage/${organizerToken}`);
    return { ok: true };
  }

  const supabase = createServiceRoleClient();
  const { data: candidateData, error: candidateError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .eq("event_id", event.id) // 他イベントの候補日IDを渡されても通らないようにする
    .maybeSingle();
  if (candidateError || !candidateData) {
    return { ok: false, message: "その候補日は見つかりませんでした" };
  }
  const candidate = candidateData as Candidate;

  const { error: updateError } = await supabase
    .from("events")
    .update({
      confirmed_candidate_id: candidate.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", event.id);
  if (updateError) {
    console.error("確定の保存に失敗しました", updateError);
    return { ok: false, message: "うまく保存できませんでした。時間をおいてもう一度お試しください" };
  }

  // Google連携済みならカレンダーにも入れる。ここで失敗しても確定そのものは取り消さない。
  if (event.organizer_id) {
    const organizer = await getOrganizerById(event.organizer_id);
    if (organizer) {
      const htmlLink = await insertConfirmedCalendarEvent(organizer, {
        title: event.title,
        startsAt: candidate.starts_at,
      });
      if (htmlLink) {
        const { error: linkError } = await supabase
          .from("events")
          .update({ calendar_html_link: htmlLink })
          .eq("id", event.id);
        if (linkError) {
          console.error("カレンダーリンクの保存に失敗しました", linkError);
        }
      }
    }
  }

  revalidatePath(`/manage/${organizerToken}`);
  return { ok: true };
}
