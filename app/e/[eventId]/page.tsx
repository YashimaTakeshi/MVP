import { notFound } from "next/navigation";
import { AppFooter } from "@/components/AppFooter";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Candidate, PublicEventRecord, ResponseRecord } from "@/lib/types";
import { ConfirmedView } from "./_components/ConfirmedView";
import { RealtimeResults } from "./_components/RealtimeResults";
import { ResponseForm } from "./_components/ResponseForm";

// 回答は随時増えるため、毎回サーバーで最新を取得する
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!UUID_PATTERN.test(eventId)) {
    notFound();
  }

  const supabase = createServiceRoleClient();

  // organizer_token（幹事だけが知る秘密値）は絶対に取得しない
  const { data: eventRow } = await supabase
    .from("events")
    .select("id, title, memo, organizer_id, confirmed_candidate_id, confirmed_at, calendar_html_link, created_at")
    .eq("id", eventId)
    .maybeSingle();

  if (!eventRow) {
    notFound();
  }
  const event = eventRow as PublicEventRecord;

  const [{ data: candidateRows }, { data: responseRows }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, event_id, starts_at, sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("responses")
      .select("id, event_id, respondent_name, answers, comment, created_at, updated_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);

  const candidates = (candidateRows ?? []) as Candidate[];
  const responses = (responseRows ?? []) as ResponseRecord[];
  const confirmedCandidate =
    candidates.find((candidate) => candidate.id === event.confirmed_candidate_id) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[34rem] flex-1 space-y-10 px-4 py-10">
        <header className="space-y-2">
          <h1 className="font-heading text-2xl font-bold leading-snug">{event.title}</h1>
          {event.memo && <p className="leading-loose text-ink-muted">{event.memo}</p>}
        </header>

        {event.confirmed_candidate_id ? (
          <ConfirmedView event={event} candidate={confirmedCandidate} responses={responses} />
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="font-heading text-lg font-bold">回答する</h2>
              {candidates.length > 0 ? (
                <ResponseForm eventId={event.id} candidates={candidates} />
              ) : (
                <p className="text-ink-muted">候補日がまだ登録されていません。幹事に確かめてください。</p>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="font-heading text-lg font-bold">みんなの回答</h2>
              <RealtimeResults
                eventId={event.id}
                candidates={candidates}
                responses={responses}
              />
            </section>
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
