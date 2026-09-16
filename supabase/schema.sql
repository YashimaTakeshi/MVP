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
  id uuid primary key default gen_random_uuid(), -- そのままURLに使用（推測困難なUUIDv4）
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
  updated_at timestamptz not null default now()
);
create index responses_event_id_idx on responses(event_id);

-- Row Level Security: 全テーブルで有効化。
-- 読み取りはURLを知っていれば誰でも可能（IDの推測困難性がアクセス制御の実質）。
-- 書き込みポリシーは意図的に定義しない（= anon/authenticatedからの直接書き込みはデフォルト拒否）。
-- 参加者の回答・イベント作成・確定操作は、すべてサーバー側のServer Action経由でservice_role keyを使って行う。

alter table organizers enable row level security;
-- organizersにはanon/authenticated向けのポリシーを一切定義しない（service_role専用・完全遮断）。

alter table events enable row level security;
create policy events_select_public on events for select using (true);

alter table candidates enable row level security;
create policy candidates_select_public on candidates for select using (true);

alter table responses enable row level security;
create policy responses_select_public on responses for select using (true);
