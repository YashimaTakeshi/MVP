# 日程調整

「調整さん」の代替となる日程調整サービス。参加者はログイン不要でURLを開いて名前と○△×を送るだけ、幹事だけ任意でGoogleアカウントと連携してカレンダー突合・リマインド・確定日程の自動登録が使えるようになる、非対称設計のMVPです。

## 主な機能

- イベント作成（イベント名・候補日程の複数登録・任意メモ）
- ログイン不要の参加者向け回答ページ（名前＋候補日ごとの○/△/×＋コメント）
- 回答一覧のリアルタイム（数秒おきの自動更新）集計表示
- 幹事向けGoogle OAuthログイン（任意）
- Google連携時：候補日とプライマリカレンダーの予定の突合・警告表示
- Google連携時：未回答者への呼びかけメール（幹事自身のGmailへ送信し、転送してもらう方式。詳細は下記「既知の制限」参照）
- 日程の確定と、Google連携時はワンクリックでのカレンダー登録

## 技術スタック

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Supabase（Postgres、Row Level Security）
- NextAuth.js（v4）+ Google OAuth
- Google Calendar API / Gmail API（`googleapis`）
- Vercelでのデプロイを想定

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseプロジェクトの用意

1. [Supabase](https://supabase.com/dashboard)で新規プロジェクトを作成する
2. プロジェクトの SQL Editor で `supabase/schema.sql` の内容をそのまま実行する（テーブル・RLSポリシーが作成されます）
3. **Project Settings → API** から以下を控える
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（**絶対にクライアントに公開しないこと**。サーバー専用の強力な鍵です）

> 参加者の回答一覧はSupabaseのRealtimeではなく、ブラウザが数秒おきに再取得するポーリング方式です（anon keyでのRLS越しの全イベント横断読み出しを防ぐため、意図的にこの設計にしています）。追加設定は不要です。

### 3. Google Cloud Consoleの設定

1. [Google Cloud Console](https://console.cloud.google.com/)で新規プロジェクトを作成する
2. **APIとサービス → ライブラリ** から以下を有効化する
   - Google Calendar API
   - Gmail API
3. **APIとサービス → OAuth同意画面** を設定する
   - User Type: 「外部」でよい（社内・少人数のβテスト運用のため）
   - スコープに以下を追加する
     - `.../auth/calendar.freebusy`
     - `.../auth/calendar.events`
     - `.../auth/gmail.send`
   - 「テストユーザー」に、実際にGoogle連携をテストする幹事のGoogleアカウントを追加する（**重要**：未検証アプリはテストユーザー以外だと連携できず、テストユーザーでもrefresh_tokenが7日で失効する制限があります。βテスト期間中はこの制約を前提に運用してください）
4. **APIとサービス → 認証情報 → 認証情報を作成 → OAuthクライアントID** を作成する
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みのリダイレクトURI に以下を追加する
     - ローカル開発用: `http://localhost:3000/api/auth/callback/google`
     - 本番用: `https://<デプロイ先ドメイン>/api/auth/callback/google`
   - 発行された「クライアントID」「クライアントシークレット」を控える

### 4. 環境変数の設定

`.env.example` を `.env.local` にコピーし、値を埋める。

```bash
cp .env.example .env.local
```

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon public キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice_roleキー（サーバー専用） |
| `NEXTAUTH_URL` | アプリの公開URL（ローカルは`http://localhost:3000`） |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` で生成したランダム文字列 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google CloudのOAuthクライアント |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` で生成した64桁hex文字列（幹事のrefresh_tokenの暗号化に使用） |

### 5. ローカルで起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

### 6. Vercelへのデプロイ

1. このリポジトリをVercelにインポートする
2. 上記の環境変数をすべてVercelのProject Settings → Environment Variablesに設定する（`NEXTAUTH_URL`は本番ドメインに変更）
3. Google CloudのOAuthクライアントに、本番ドメインのリダイレクトURI（`https://<本番ドメイン>/api/auth/callback/google`）を追加する
4. デプロイ後、mainブランチへのpushで自動的に再デプロイされる

## 既知の制限（βテスト運用にあたって）

- **未回答者リマインドの検出範囲**：このアプリは参加者名簿（招待リスト）を持たないため、「一度も回答していない人」は原理的に検出できません。リマインド機能が検出できるのは「回答したが一部の候補日が未記入の人」のみです。誰も回答していない場合は、その旨をまとめて幹事のGmailに送る呼びかけ文面になります
- **リマインドメールの送信先**：参加者のメールアドレスを収集しない設計のため、リマインドは幹事自身のGmailアドレスへ送信され、幹事がそれを転送する運用です
- **Googleカレンダー連携**：プライマリカレンダーのみ対応。テストユーザーのrefresh_tokenは7日で失効するため、定期的な再連携が必要になる場合があります
- **一般公開する場合**：Google OAuth同意画面の本番審査（プライバシーポリシーURL等が必要）と、Supabaseの想定アクセス規模に応じたプラン見直しが必要です

## バージョン

アプリ右下（フッター）にバージョン番号とビルド日を表示しています。
