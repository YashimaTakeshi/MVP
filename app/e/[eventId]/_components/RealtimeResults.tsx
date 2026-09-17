"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ResultsTable } from "@/components/ResultsTable";
import type { Candidate, ResponseRecord } from "@/lib/types";

/**
 * 回答一覧を定期的に取り直す。
 *
 * 以前はSupabaseのRealtime購読（postgres_changes）で更新を検知していたが、
 * それにはanon keyで responses テーブルをSELECTできるRLSポリシーが必要で、
 * event_idで絞り込めないためイベント横断で回答者名やコメントが読めてしまう。
 * 情報漏洩のリスクの方が大きいので購読はやめ、Server Componentへのポーリングに切り替えた。
 */
const REFRESH_INTERVAL_MS = 5000;

export function RealtimeResults({
  candidates,
  responses,
  confirmedCandidateId,
}: {
  candidates: Candidate[];
  responses: ResponseRecord[];
  confirmedCandidateId?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        router.refresh();
      }, REFRESH_INTERVAL_MS);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    // タブが見えていない間は取りに行かない。戻ってきたらすぐ1回取り直す。
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
        return;
      }
      router.refresh();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return (
    <ResultsTable
      candidates={candidates}
      responses={responses}
      confirmedCandidateId={confirmedCandidateId}
    />
  );
}
