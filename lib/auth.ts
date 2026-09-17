import "server-only";
import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { google } from "googleapis";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/crypto";

// 幹事が同意するスコープ。
// - calendar.freebusy : 候補日と幹事の予定の突合（予定の中身は読まない）
// - calendar.events   : 確定した日程をプライマリカレンダーへ登録する
// - gmail.send        : 未回答者リマインドの文面を幹事自身へ送る
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

function googleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

/** organizers テーブルの1行。access_token / refresh_token は暗号化された状態で入っている。 */
export type OrganizerRecord = {
  id: string;
  google_sub: string;
  email: string | null;
  access_token: string | null;
  refresh_token: string;
  token_expires_at: string | null;
};

/**
 * サインイン時に organizers を google_sub でupsertする。
 * refresh_token は初回同意時にしか返らないため、取得できなかった場合は
 * NOT NULL 制約のある refresh_token 列を壊さないようUPDATEだけに切り替える。
 */
async function persistOrganizer(params: {
  googleSub: string;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}): Promise<string | undefined> {
  const supabase = createServiceRoleClient();
  const tokenExpiresAt = params.expiresAt ? new Date(params.expiresAt * 1000).toISOString() : null;
  const accessToken = params.accessToken ? encrypt(params.accessToken) : null;

  if (params.refreshToken) {
    const { data, error } = await supabase
      .from("organizers")
      .upsert(
        {
          google_sub: params.googleSub,
          email: params.email,
          access_token: accessToken,
          // 平文では保存しない。鍵は環境変数（TOKEN_ENCRYPTION_KEY）だけが持つ。
          refresh_token: encrypt(params.refreshToken),
          token_expires_at: tokenExpiresAt,
        },
        { onConflict: "google_sub" },
      )
      .select("id")
      .single();
    if (error) {
      console.error("organizersのupsertに失敗しました", error);
      return undefined;
    }
    return data?.id as string | undefined;
  }

  const { data, error } = await supabase
    .from("organizers")
    .update({
      email: params.email,
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
    })
    .eq("google_sub", params.googleSub)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("organizersの更新に失敗しました", error);
    return undefined;
  }
  return data?.id as string | undefined;
}

/** アクセストークンだけを更新する（リフレッシュ後の保存用）。 */
async function persistRefreshedTokens(params: {
  organizerId?: string;
  googleSub?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): Promise<void> {
  if (!params.organizerId && !params.googleSub) return;
  const supabase = createServiceRoleClient();
  const query = supabase.from("organizers").update({
    access_token: encrypt(params.accessToken),
    refresh_token: encrypt(params.refreshToken),
    token_expires_at: new Date(params.expiresAt * 1000).toISOString(),
  });
  const { error } = params.organizerId
    ? await query.eq("id", params.organizerId)
    : await query.eq("google_sub", params.googleSub as string);
  if (error) {
    console.error("トークンの保存に失敗しました", error);
  }
}

/**
 * 【削除済み】JWT上のアクセストークンを期限切れ時にリフレッシュする処理。
 *
 * Google APIの呼び出しはすべて getOrganizerById → createOrganizerOAuthClient という
 * DB経由の独立経路を通り、そちらは googleapis 側が自動でリフレッシュして
 * `tokens` イベントでDBへ書き戻す。JWT上のアクセストークンは誰も読まないため、
 * ここでのリフレッシュはデッドコードだった。session からも accessToken は返さない。
 */

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId(),
      clientSecret: googleClientSecret(),
      authorization: {
        params: {
          // offline + consent でrefresh_tokenを確実に受け取る（2回目以降も同意画面を出す）
          access_type: "offline",
          prompt: "consent",
          scope: GOOGLE_SCOPES,
          response_type: "code",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // account が非nullなのはサインイン直後だけ。ここでorganizersへ保存する。
      if (account) {
        const googleSub = profile?.sub ?? account.providerAccountId ?? token.sub;
        const accessToken = typeof account.access_token === "string" ? account.access_token : null;
        // 2回目以降の同意でrefresh_tokenが返らないケースに備えて既存値をフォールバックに使う
        const refreshToken =
          typeof account.refresh_token === "string" ? account.refresh_token : (token.refreshToken ?? null);
        const expiresAt =
          typeof account.expires_at === "number" ? account.expires_at : nowInSeconds() + 3600;
        const email = profile?.email ?? token.email ?? null;

        if (googleSub) {
          const organizerId = await persistOrganizer({
            googleSub,
            email,
            accessToken,
            refreshToken,
            expiresAt,
          });
          token.googleSub = googleSub;
          if (organizerId) token.organizerId = organizerId;
        }

        return {
          ...token,
          refreshToken: refreshToken ?? undefined,
          expiresAt,
          error: undefined,
        };
      }

      return token;
    },
    async session({ session, token }) {
      // accessToken は返さない。/api/auth/session は公開エンドポイントであり、
      // Google Calendar / Gmail のスコープ付きトークンをそこから取れてはいけない。
      session.organizerId = token.organizerId;
      session.googleSub = token.googleSub;
      session.error = token.error;
      return session;
    },
  },
};

/** organizers を id で1件取得する（service_role経由。呼び出し元はサーバー限定）。 */
export async function getOrganizerById(organizerId: string): Promise<OrganizerRecord | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("organizers")
    .select("id, google_sub, email, access_token, refresh_token, token_expires_at")
    .eq("id", organizerId)
    .maybeSingle();
  if (error) {
    console.error("organizersの取得に失敗しました", error);
    return null;
  }
  return (data as OrganizerRecord | null) ?? null;
}

/**
 * 保存済みトークンを復号して、その幹事として Google API を叩けるOAuth2クライアントを作る。
 * googleapis側がアクセストークンの期限切れを検知して自動リフレッシュするので、
 * `tokens` イベントで新しいトークンをDBへ書き戻しておく。
 */
export function createOrganizerOAuthClient(organizer: OrganizerRecord) {
  const client = new google.auth.OAuth2({
    clientId: googleClientId(),
    clientSecret: googleClientSecret(),
  });

  const refreshToken = decrypt(organizer.refresh_token);
  const accessToken = organizer.access_token ? decrypt(organizer.access_token) : undefined;
  const expiryDate = organizer.token_expires_at ? new Date(organizer.token_expires_at).getTime() : undefined;

  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: expiryDate,
  });

  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    // fire-and-forgetなので、rejectがunhandledにならないよう必ずcatchする。
    void persistRefreshedTokens({
      organizerId: organizer.id,
      googleSub: organizer.google_sub,
      accessToken: tokens.access_token,
      // ここでもrefresh_tokenが返らないことがあるため既存値を保持する
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresAt: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : nowInSeconds() + 3600,
    }).catch((error) => {
      console.error("トークンの再保存に失敗しました", error instanceof Error ? error.message : error);
    });
  });

  return client;
}
