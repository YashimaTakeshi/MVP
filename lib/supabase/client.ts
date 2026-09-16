import { createClient } from "@supabase/supabase-js";

// anon key はSELECTのみ許可されたRLSポリシーの範囲でしか使えない（書き込みはserver.tsのservice_role経由）。
// 回答一覧のリアルタイム購読（postgres_changes）に使用する。
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey);
}
