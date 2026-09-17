export type Answer = "yes" | "maybe" | "no";

export type Candidate = {
  id: string;
  event_id: string;
  starts_at: string; // ISO 8601 (UTC, Supabase timestamptz)
  sort_order: number;
};

export type EventRecord = {
  id: string;
  // 幹事の管理URL用の秘密値。参加者向けページ（app/e/[eventId]）ではAPIレスポンス・HTML双方から
  // 絶対に除外すること（select時に明示的にomitする）。
  organizer_token: string;
  title: string;
  memo: string | null;
  organizer_id: string | null;
  confirmed_candidate_id: string | null;
  confirmed_at: string | null;
  calendar_html_link: string | null;
  created_at: string;
};

// 参加者向けページで安全に使えるよう organizer_token を除いた型
export type PublicEventRecord = Omit<EventRecord, "organizer_token">;

export type ResponseRecord = {
  id: string;
  event_id: string;
  respondent_name: string;
  answers: Record<string, Answer>;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type EventWithDetails = EventRecord & {
  candidates: Candidate[];
  responses: ResponseRecord[];
};

// Googleカレンダーの予定と候補日が重なっている場合の要約（幹事がGoogle連携している時のみ算出）
export type CollisionInfo = { summary: string };
/** candidate.id -> 被っている予定の要約 */
export type CollisionMap = Record<string, CollisionInfo>;
