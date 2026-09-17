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
  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("id, title, memo, organizer_id, confirmed_candidate_id, confirmed_at, calendar_html_link, created_at")
    .eq("id", eventId)
    .maybeSingle();

  // DBが一時的に応答しないだけの場合に「存在しない」と言い切ってしまわないよう、
  // notFound() は本当に行が無いときだけに限る。
  if (eventError) {
    console.error("イベントの取得に失敗しました", eventError.message);
    return <LoadError />;
  }
  if (!eventRow) {
    notFound();
  }
  const event = eventRow as PublicEventRecord;

  const [candidatesResult, responsesResult] = await Promise.all([
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

  if (candidatesResult.error) {
    console.error("候補日の取得に失敗しました", candidatesResult.error.message);
  }
  if (responsesResult.error) {
    console.error("回答の取得に失敗しました", responsesResult.error.message);
  }

  const candidates = (candidatesResult.data ?? []) as Candidate[];
  const responses = (responsesResult.data ?? []) as ResponseRecord[];
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
              <RealtimeResults candidates={candidates} responses={responses} />
            </section>
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

/** DBが一時的に読めなかったときの表示。「見つからない」とは別の意味であることを伝える。 */
function LoadError() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[34rem] flex-1 space-y-4 px-4 py-10">
        <h1 className="font-heading text-2xl font-bold leading-snug">いま読み込めませんでした</h1>
        <p className="leading-relaxed text-ink-muted">
          一時的に読み込めませんでした。時間をおいて再度お試しください。
        </p>
      </main>
      <AppFooter />
    </div>
  );
}
