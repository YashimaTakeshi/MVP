// NextAuth v4 のJWT / Session にGoogle連携で必要な独自フィールドを足す型拡張。
// このファイルは tsconfig の "**/*.ts" に含まれるため、明示的なimportは不要。
import type { DefaultSession } from "next-auth";

export type GoogleAuthError = "RefreshAccessTokenError" | "NoRefreshToken";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"];
    /** Google APIを叩くためのアクセストークン（期限切れ時はjwtコールバックで更新済み） */
    accessToken?: string;
    /** organizers.id。/manage/[organizerToken] でイベントと幹事を紐付けるのに使う */
    organizerId?: string;
    /** Googleのユーザー識別子（profile.sub）。organizers.google_sub と一致する */
    googleSub?: string;
    /** リフレッシュに失敗した場合のみ入る。UI側で再連携を促すのに使える */
    error?: GoogleAuthError;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    /** 平文のrefresh_token。NextAuthのJWTはJWEで暗号化されるためCookie上は平文にならない */
    refreshToken?: string;
    /** 秒単位のUNIXタイムスタンプ（Googleのexpires_atと同じ単位） */
    expiresAt?: number;
    organizerId?: string;
    googleSub?: string;
    error?: GoogleAuthError;
  }
}
