import "server-only";
import { google } from "googleapis";
import { createOrganizerOAuthClient, type OrganizerRecord } from "@/lib/auth";
import { toJstRfc3339 } from "@/lib/date";
import type { Candidate } from "@/lib/types";

const JST = "Asia/Tokyo";
const TIME_ZONE = JST;

// 候補日は「開始時刻から1時間の予定」として扱う（MVPでは所要時間を持たないため）。
export const CANDIDATE_DURATION_MINUTES = 60;
const CANDIDATE_DURATION_MS = CANDIDATE_DURATION_MINUTES * 60 * 1000;

export type CollisionInfo = { summary: string };
/** candidate.id -> 被っている予定の要約 */
export type CollisionMap = Record<string, CollisionInfo>;

function jstTime(ms: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function jstDate(ms: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    month: "numeric",
    day: "numeric",
  }).format(new Date(ms));
}

/** 「19:00〜20:30」形式。候補日と日付がまたぐ場合だけ「9/18 23:00〜」のように日付を添える。 */
function formatBusyRange(busyStart: number, busyEnd: number, candidateStart: number): string {
  const sameDay = jstDate(busyStart) === jstDate(candidateStart);
  const head = sameDay ? jstTime(busyStart) : `${jstDate(busyStart)} ${jstTime(busyStart)}`;
  const tailSameDay = jstDate(busyEnd) === jstDate(busyStart);
  const tail = tailSameDay ? jstTime(busyEnd) : `${jstDate(busyEnd)} ${jstTime(busyEnd)}`;
  return `${head}〜${tail}`;
}

/**
 * 候補日と幹事のプライマリカレンダーの予定を突合する。
 * freebusy.query は候補日全体をカバーする期間で1回だけ呼び、結果の busy 配列と
 * 各候補日（開始〜+1時間）の重なりをアプリ側で判定する。
 * 失敗しても管理ページ自体は表示できるべきなので、例外は握りつぶして空のマップを返す。
 */
export async function findCalendarCollisions(
  organizer: OrganizerRecord,
  candidates: Candidate[],
): Promise<CollisionMap> {
  if (candidates.length === 0) return {};

  const starts = candidates.map((candidate) => new Date(candidate.starts_at).getTime());
  const rangeStart = Math.min(...starts);
  const rangeEnd = Math.max(...starts) + CANDIDATE_DURATION_MS;

  try {
    const auth = createOrganizerOAuthClient(organizer);
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: toJstRfc3339(new Date(rangeStart).toISOString()),
        timeMax: toJstRfc3339(new Date(rangeEnd).toISOString()),
        timeZone: TIME_ZONE,
        items: [{ id: "primary" }],
      },
    });

    const busy = response.data.calendars?.primary?.busy ?? [];
    if (busy.length === 0) return {};

    const collisions: CollisionMap = {};
    for (const candidate of candidates) {
      const candidateStart = new Date(candidate.starts_at).getTime();
      const candidateEnd = candidateStart + CANDIDATE_DURATION_MS;

      const overlaps: string[] = [];
      for (const period of busy) {
        if (!period.start || !period.end) continue;
        const busyStart = new Date(period.start).getTime();
        const busyEnd = new Date(period.end).getTime();
        if (Number.isNaN(busyStart) || Number.isNaN(busyEnd)) continue;
        // 半開区間で判定（終了時刻ちょうどに始まる予定は重なりとみなさない）
        if (busyStart < candidateEnd && busyEnd > candidateStart) {
          overlaps.push(formatBusyRange(busyStart, busyEnd, candidateStart));
        }
      }
      if (overlaps.length > 0) {
        collisions[candidate.id] = { summary: overlaps.join("、") };
      }
    }
    return collisions;
  } catch (error) {
    console.error("freebusyの取得に失敗しました", error);
    return {};
  }
}

/**
 * 確定した日程を幹事のプライマリカレンダーへ登録し、htmlLink を返す。
 * 確定処理そのものはカレンダー登録の成否に依存させないので、失敗時はnullを返すだけにする。
 */
export async function insertConfirmedCalendarEvent(
  organizer: OrganizerRecord,
  params: { title: string; startsAt: string },
): Promise<string | null> {
  try {
    const auth = createOrganizerOAuthClient(organizer);
    const calendar = google.calendar({ version: "v3", auth });

    const startMs = new Date(params.startsAt).getTime();
    const endMs = startMs + CANDIDATE_DURATION_MS;

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.title,
        start: { dateTime: toJstRfc3339(new Date(startMs).toISOString()), timeZone: TIME_ZONE },
        end: { dateTime: toJstRfc3339(new Date(endMs).toISOString()), timeZone: TIME_ZONE },
      },
    });

    return response.data.htmlLink ?? null;
  } catch (error) {
    console.error("カレンダーへの登録に失敗しました", error);
    return null;
  }
}
