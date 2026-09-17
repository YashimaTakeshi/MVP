import { formatConfirmedDate } from "@/lib/date";
import type { Candidate, PublicEventRecord, ResponseRecord } from "@/lib/types";

export function ConfirmedView({
  event,
  candidate,
  responses,
}: {
  event: PublicEventRecord;
  candidate: Candidate | null;
  responses: ResponseRecord[];
}) {
  const attendees = candidate
    ? responses.filter((response) => response.answers?.[candidate.id] === "yes")
    : [];
  const confirmed = candidate ? formatConfirmedDate(candidate.starts_at) : null;

  return (
    <div className="space-y-6">
      <p className="text-ink-muted">日程が決まりました</p>

      <div className="rounded-2xl border border-rule bg-surface p-6">
        {confirmed ? (
          <p className="font-numeric tabular-nums">
            <span className="text-5xl font-semibold leading-tight">
              {confirmed.month}/{confirmed.day}
            </span>
            <span className="ml-2 text-2xl">({confirmed.weekday})</span>
            <br />
            <span className="text-3xl font-semibold">{confirmed.time}</span>
          </p>
        ) : (
          <p className="text-ink-muted">確定した候補日を読み込めませんでした。</p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">参加する人（{attendees.length}人）</h2>
        {attendees.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {attendees.map((attendee) => (
              <li
                key={attendee.id}
                className="rounded-lg border border-rule bg-surface px-4 py-2 font-handwritten text-lg"
              >
                {attendee.respondent_name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">○で回答した人はいません。</p>
        )}
      </div>

      {event.calendar_html_link && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">幹事がGoogleカレンダーに登録しました。</p>
          <a
            href={event.calendar_html_link}
            target="_blank"
            rel="noreferrer"
            className="flex h-14 w-full items-center justify-center rounded-lg border-2 border-bamboo font-medium text-bamboo"
          >
            カレンダーで見る
          </a>
        </div>
      )}
    </div>
  );
}
