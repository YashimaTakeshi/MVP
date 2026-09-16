import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role key はRLSを完全にバイパスするため、サーバー専用コード（Server Action / Route Handler）でのみ使用する。
// クライアント（ブラウザ）側には絶対に露出させない。
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabaseの環境変数が設定されていません（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
