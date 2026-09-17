import type { Candidate, ResponseRecord } from "@/lib/types";

/**
 * 「未回答の人」の名前一覧を返す。
 *
 * このアプリのスキーマには参加者名簿（招待した人の一覧）が無く、名前が分かるのは
 * responses に行がある人だけ。そのため「1人も回答していない人」は原理的に特定できない。
 * ここでは実務上いちばん意味のある定義として、
 * 「回答はくれたが、まだ○△×が入っていない候補日が残っている人」を未回答者として扱う。
 * ResultsTable で「－」が残っている行の人と一致する。
 */
export function listPendingNames(candidates: Candidate[], responses: ResponseRecord[]): string[] {
  if (candidates.length === 0) return [];
  return responses
    .filter((response) => candidates.some((candidate) => !response.answers?.[candidate.id]))
    .map((response) => response.respondent_name);
}
