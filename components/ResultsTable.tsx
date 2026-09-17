import { Fragment } from "react";
import type { Answer, Candidate, CollisionInfo, ResponseRecord } from "@/lib/types";
import { formatCandidate } from "@/lib/date";

const ANSWER_LABEL: Record<Answer, string> = {
  yes: "参加",
  maybe: "未定",
  no: "不参加",
};

function AnswerGlyph({ answer }: { answer: Answer | undefined }) {
  if (!answer) {
    return (
      <span className="text-ink-muted" aria-label="未回答">
        －
      </span>
    );
  }
  const glyph = answer === "yes" ? "○" : answer === "maybe" ? "△" : "×";
  const colorClass =
    answer === "yes" ? "text-bamboo" : answer === "maybe" ? "text-mustard" : "text-ink-muted";
  return (
    <span className={`text-lg font-bold ${colorClass}`} aria-label={ANSWER_LABEL[answer]}>
      {glyph}
    </span>
  );
}

export function ResultsTable({
  candidates,
  responses,
  collisions,
  confirmedCandidateId,
}: {
  candidates: Candidate[];
  responses: ResponseRecord[];
  collisions?: Record<string, CollisionInfo>;
  confirmedCandidateId?: string | null;
}) {
  const sorted = [...candidates].sort((a, b) => a.sort_order - b.sort_order);

  const yesCounts = new Map<string, number>();
  for (const candidate of sorted) {
    const count = responses.filter((r) => r.answers[candidate.id] === "yes").length;
    yesCounts.set(candidate.id, count);
  }
  const maxYes = Math.max(0, ...yesCounts.values());
  // 同数トップが複数ある場合は全員をハイライトする（1件だけに絞ると「唯一の最多」に見えてしまうため）
  const highlightedIds = confirmedCandidateId
    ? new Set([confirmedCandidateId])
    : new Set(maxYes > 0 ? sorted.filter((c) => yesCounts.get(c.id) === maxYes).map((c) => c.id) : []);

  if (sorted.length === 0) {
    return <p className="text-ink-muted">候補日がまだありません。</p>;
  }

  return (
    <div className="space-y-2">
      <div
        className="overflow-x-auto rounded-lg border border-rule"
        tabIndex={0}
        aria-label="回答の集計表。横にスクロールできます"
      >
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[104px] min-w-[104px] bg-surface px-2 py-2 text-left font-medium text-ink-muted">
                候補日
              </th>
              {responses.map((r) => (
                <th
                  key={r.id}
                  className="w-11 min-w-11 px-1 py-2 align-bottom font-medium text-ink"
                  style={{ writingMode: "vertical-rl" }}
                >
                  <span className="font-handwritten">{r.respondent_name}</span>
                </th>
              ))}
              <th className="sticky right-0 z-10 w-16 min-w-16 bg-surface px-2 py-2 text-center font-medium text-ink-muted">
                ○の数
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((candidate, index) => {
              const isHighlighted = highlightedIds.has(candidate.id);
              const collision = collisions?.[candidate.id];
              const rowDivider = index > 0 && index % 4 === 0;
              return (
                <Fragment key={candidate.id}>
                  <tr
                    className={rowDivider ? "border-t-2 border-t-ink-muted/40" : "border-t border-t-rule"}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 whitespace-nowrap px-2 py-2 text-left font-numeric font-medium ${
                        collision ? "border-l-2 border-l-vermilion bg-vermilion/5" : "bg-surface"
                      }`}
                    >
                      {formatCandidate(candidate.starts_at)}
                    </th>
                    {responses.map((r) => (
                      <td key={r.id} className="px-1 py-2 text-center">
                        <AnswerGlyph answer={r.answers[candidate.id]} />
                      </td>
                    ))}
                    <td
                      className={`sticky right-0 z-10 px-2 py-2 text-center font-numeric text-2xl font-semibold ${
                        isHighlighted ? "bg-bamboo text-surface" : "bg-surface text-ink"
                      }`}
                    >
                      {yesCounts.get(candidate.id) ?? 0}
                    </td>
                  </tr>
                  {collision && (
                    <tr className="border-t-0">
                      <td
                        colSpan={responses.length + 2}
                        className="border-l-2 border-l-vermilion bg-vermilion/5 px-2 py-1 text-xs text-vermilion"
                      >
                        あなたの予定と重なります　{collision.summary}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {responses.length === 0 && <p className="text-ink-muted text-sm">まだ誰も回答していません。</p>}
    </div>
  );
}
