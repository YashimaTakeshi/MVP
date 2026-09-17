import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { AppFooter } from "@/components/AppFooter";
import { ResultsTable } from "@/components/ResultsTable";
import { authOptions, getOrganizerById } from "@/lib/auth";
import { formatCandidate, formatConfirmedDate } from "@/lib/date";
import { findCalendarCollisions } from "@/lib/google/calendar";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Candidate, CollisionMap, EventRecord, ResponseRecord } from "@/lib/types";
import { ConfirmForm, type ConfirmChoice } from "./_components/ConfirmForm";
import { ReminderButton } from "./_components/ReminderButton";
import { listPendingNames } from "./_components/pending";

// 管理URLは秘密値なので、検索エンジンには絶対に載せない。
export const metadata: Metadata = {
  title: "幹事ページ",
  robots: { index: false, follow: false },
};

// 回答は随時増えるため、毎回サーバーで最新を取得する（参加者ページと同じ扱い）。
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function ManagePage({ params }: { params: Promise<{ organizerToken: string }> }) {
  const { organizerToken } = await params;
  if (!UUID_PATTERN.test(organizerToken)) notFound();

  const supabase = createServiceRoleClient();
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_token", organizerToken)
    .maybeSingle();
  if (eventError || !eventData) notFound();
  const event = eventData as EventRecord;

  const [candidatesResult, responsesResult] = await Promise.all([
    supabase.from("candidates").select("*").eq("event_id", event.id).order("sort_order", { ascending: true }),
    supabase.from("responses").select("*").eq("event_id", event.id).order("created_at", { ascending: true }),
  ]);
  // 一時的なDB障害を「候補日なし・回答0人」と取り違えないよう、必ずログに残して注記も出す。
  if (candidatesResult.error) {
    console.error("候補日の取得に失敗しました", candidatesResult.error.message);
  }
  if (responsesResult.error) {
    console.error("回答の取得に失敗しました", responsesResult.error.message);
  }
  const aggregateFailed = Boolean(candidatesResult.error || responsesResult.error);
  const candidates = (candidatesResult.data ?? []) as Candidate[];
  const responses = (responsesResult.data ?? []) as ResponseRecord[];

  // Googleサインインから callbackUrl でこのページに戻ってきた直後は、まだイベントと幹事が
  // 結び付いていない。organizer_id が空のときだけ埋める（`is("organizer_id", null)` を付けて
  // 何度描画されても最初の1回しか効かないようにする）。
  const session = await getServerSession(authOptions);
  let organizerId = event.organizer_id;
  if (!organizerId && session?.organizerId) {
    const { data: linked, error: linkError } = await supabase
      .from("events")
      .update({ organizer_id: session.organizerId })
      .eq("id", event.id)
      .is("organizer_id", null)
      .select("organizer_id")
      .maybeSingle();
    if (linkError) {
      console.error("イベントと幹事の紐付けに失敗しました", linkError);
    } else if (linked) {
      organizerId = session.organizerId;
    }
  }

  const isConnected = Boolean(organizerId);
  const confirmedCandidate = event.confirmed_candidate_id
    ? (candidates.find((candidate) => candidate.id === event.confirmed_candidate_id) ?? null)
    : null;
  const isConfirmed = Boolean(confirmedCandidate);

  // 確定前かつGoogle連携済みのときだけ、候補日と幹事の予定を突合する。
  let collisions: CollisionMap | undefined;
  // 突合に失敗したときは「重なりなし」と区別が付かないので、画面に注記を出す。
  let collisionCheckFailed = false;
  if (isConnected && !isConfirmed && candidates.length > 0) {
    const organizer = await getOrganizerById(organizerId as string);
    if (organizer) {
      const result = await findCalendarCollisions(organizer, candidates);
      collisions = result.collisions;
      collisionCheckFailed = result.failed;
    }
  }

  const pendingNames = listPendingNames(candidates, responses);
  // リマインドは3状態に分かれる。
  // - 誰も回答していない（responses.length === 0）：名前が1人も分からないので呼びかけ文面を送る
  // - 一部が未記入（pendingNames.length > 0）：その人の名前を載せた文面を送る
  // - それ以外：全員が全候補日に回答済みなので、送るものがない
  const hasNoResponses = responses.length === 0;
  const canRemind = hasNoResponses || pendingNames.length > 0;

  const choices: ConfirmChoice[] = candidates.map((candidate) => ({
    id: candidate.id,
    label: formatCandidate(candidate.starts_at),
    yesCount: responses.filter((response) => response.answers?.[candidate.id] === "yes").length,
    hasCollision: Boolean(collisions?.[candidate.id]),
  }));

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-[34rem] flex-1 space-y-10 px-4 py-10">
        <header className="space-y-2">
          <p className="text-sm text-ink-muted">幹事ページ</p>
          <h1 className="font-heading text-2xl font-bold leading-snug">{event.title}</h1>
          {event.memo && <p className="text-ink-muted leading-relaxed">{event.memo}</p>}
          {hasNoResponses ? (
            <p className="text-sm text-ink-muted">まだ誰も回答していません</p>
          ) : (
            <p className="text-sm text-ink-muted">
              <span className="font-numeric">{responses.length}</span>人が回答、
              未回答は<span className="font-numeric">{pendingNames.length}</span>人
            </p>
          )}
        </header>

        {isConfirmed && confirmedCandidate && (
          <section className="space-y-4 rounded-2xl border border-rule bg-surface p-6">
            <p className="text-sm text-ink-muted">この日にきまりました</p>
            <ConfirmedDate startsAt={confirmedCandidate.starts_at} />
            {event.calendar_html_link ? (
              <a
                href={event.calendar_html_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-bamboo underline underline-offset-4"
              >
                Googleカレンダーで開く
              </a>
            ) : (
              <p className="text-sm text-ink-muted">
                {isConnected
                  ? "カレンダーへの登録はできませんでした。手でカレンダーに入れてください。"
                  : "Googleとつないでいないので、カレンダーへの登録はしていません。"}
              </p>
            )}
          </section>
        )}

        <section className="space-y-4">
          <h2 className="font-heading font-medium">みんなの回答</h2>
          <ResultsTable
            candidates={candidates}
            responses={responses}
            collisions={collisions}
            confirmedCandidateId={event.confirmed_candidate_id}
          />
          {aggregateFailed && (
            <p className="text-sm text-ink-muted">
              集計データの取得に失敗しました。時間をおいてもう一度お試しください。
            </p>
          )}
          {collisionCheckFailed && (
            <p className="text-sm text-ink-muted">
              予定の重複チェックに失敗しました。時間をおいてもう一度お試しください。
            </p>
          )}
        </section>

        {!isConfirmed && (
          <section className="space-y-6">
            {isConnected ? (
              canRemind ? (
                <ReminderButton
                  organizerToken={organizerToken}
                  pendingCount={pendingNames.length}
                  totalResponseCount={responses.length}
                />
              ) : (
                <p className="text-sm text-ink-muted leading-relaxed">
                  全員が全ての候補日に回答済みです。
                </p>
              )
            ) : (
              <div className="space-y-2">
                <a
                  href={`/api/auth/signin/google?callbackUrl=${encodeURIComponent(`/manage/${organizerToken}`)}`}
                  className="on-bamboo inline-flex h-12 w-full items-center justify-center rounded-lg border border-bamboo px-6 font-medium text-bamboo"
                >
                  Googleカレンダーとつなぐ
                </a>
                <p className="text-sm text-ink-muted leading-relaxed">
                  つなぐと、あなたの予定と重なる候補日の警告、未回答の人への連絡、
                  確定した日程のカレンダー登録が使えます。つながなくても日程はきめられます。
                </p>
              </div>
            )}

            <ConfirmForm organizerToken={organizerToken} choices={choices} />
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

function ConfirmedDate({ startsAt }: { startsAt: string }) {
  const { month, day, weekday, time } = formatConfirmedDate(startsAt);
  return (
    <p className="font-numeric text-3xl font-semibold leading-snug">
      {month}月{day}日({weekday}) {time}
    </p>
  );
}
