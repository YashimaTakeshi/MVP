"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { ResultsTable } from "@/components/ResultsTable";
import type { Candidate, ResponseRecord } from "@/lib/types";

export function RealtimeResults({
  eventId,
  candidates,
  responses,
  confirmedCandidateId,
}: {
  eventId: string;
  candidates: Candidate[];
  responses: ResponseRecord[];
  confirmedCandidateId?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    // 差分マージはせず、変更を検知したらServer Componentに取り直させる
    const channel = supabase
      .channel(`responses-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "responses",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  return (
    <ResultsTable
      candidates={candidates}
      responses={responses}
      confirmedCandidateId={confirmedCandidateId}
    />
  );
}
