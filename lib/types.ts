export type Answer = "yes" | "maybe" | "no";

export type Candidate = {
  id: string;
  event_id: string;
  starts_at: string; // ISO 8601 (UTC, Supabase timestamptz)
  sort_order: number;
};

export type EventRecord = {
  id: string;
  title: string;
  memo: string | null;
  organizer_id: string | null;
  confirmed_candidate_id: string | null;
  confirmed_at: string | null;
  calendar_html_link: string | null;
  created_at: string;
};

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
