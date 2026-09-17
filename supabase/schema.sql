-- 日程調整アプリ スキーマ定義
-- 工程4のデザイン審査で確定した3テーブル構成＋幹事のOAuthトークンを隔離する organizers テーブル。
-- 参加者はログイン不要（anon）で SELECT のみ許可し、書き込みは全て service_role 経由のサーバー処理に一本化する。

create extension if not exists "pgcrypto";

-- 幹事のGoogleアカウント連携情報。anon/authenticatedからは一切参照・書き込みできない。
create table organizers (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  email text,
  access_token text,
  refresh_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(), -- 参加者向けURLに使用（推測困難なUUIDv4）
  organizer_token uuid not null default gen_random_uuid() unique, -- 幹事向け管理URLに使用。idとは別の秘密値で、参加者には絶対に渡さない
  title text not null,
  memo text,
  organizer_id uuid references organizers(id) on delete set null, -- Google連携なしのイベントはnull
  confirmed_candidate_id uuid, -- candidates作成後にFKを付与（下記ALTER TABLE）
  confirmed_at timestamptz,
  calendar_html_link text, -- 確定時にGoogleカレンダーへ登録した場合のイベントURL
  created_at timestamptz not null default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  starts_at timestamptz not null,
  sort_order int not null default 0
);
create index candidates_event_id_idx on candidates(event_id);

alter table events
  add constraint events_confirmed_candidate_fkey
  foreign key (confirmed_candidate_id) references candidates(id) on delete set null;

create table responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  respondent_name text not null,
  answers jsonb not null default '{}', -- { "<candidate_id>": "yes" | "maybe" | "no" }
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, respondent_name) -- 同じ名前で再送信した場合は上書き（調整さんと同様の挙動）
);
create index responses_event_id_idx on responses(event_id);

-- Row Level Security: 全テーブルで有効化。
-- events.organizer_token（幹事だけが知る秘密値）が anon key で直接SELECTされないよう、
-- events / candidates は anon 向けポリシーを一切定義しない（service_role専用）。
-- Server Component（Next.jsサーバー側）は service_role client で読み書きするため、これで支障はない。
-- 読み書きは全テーブルとも、サーバー側のServer Component / Server Action経由で
-- service_role keyを使って行う。anon 向けのポリシーはどのテーブルにも存在しない。

alter table organizers enable row level security;
-- organizersにはanon/authenticated向けのポリシーを一切定義しない（service_role専用・完全遮断）。

alter table events enable row level security;
-- anon/authenticated向けポリシーなし（service_role専用）。organizer_tokenの漏洩を防ぐため。

alter table candidates enable row level security;
-- anon/authenticated向けポリシーなし（service_role専用）。events同様、直接公開する必要がないため。

alter table responses enable row level security;
-- anon/authenticated向けポリシーなし（service_role専用）。
-- かつては Realtime 購読（postgres_changes）のために
-- `create policy responses_select_public on responses for select using (true);` と
-- `alter publication supabase_realtime add table responses;` を置いていたが、
-- このポリシーは event_id で絞り込めないため、ブラウザに公開される anon key があれば
-- 全イベントの回答者名やコメントを横断的に読み出せてしまう（cross-eventの情報漏洩）。
-- anon への直接公開は廃止し、回答一覧の更新はクライアントからのポーリング
-- （app/e/[eventId]/_components/RealtimeResults.tsx）でサーバー側から取り直す方式に切り替えた。
