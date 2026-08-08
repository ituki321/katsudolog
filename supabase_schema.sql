-- 企業
create table companies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  industry text,
  priority int default 3,
  -- ★企業ごとの登録情報
  website text,           -- 企業サイトURL（ロゴ取得のドメイン源）
  mypage_url text,        -- マイページURL
  webtest_url text,       -- WebテストURL
  webtest_deadline date,  -- Webテスト締切
  webtest_done boolean default false, -- Webテスト完了フラグ
  memo text,              -- 自由メモ
  status text default 'active', -- active / offer / rejected / done
  -- ★選考区分：intern=インターン選考 / main=本選考
  selection_type text not null default 'intern',
  main_start_date date,   -- 本選考の開始日（エントリー受付開始）
  created_at timestamptz default now()
);

-- ★選考トラック（1社が「夏インターン」「冬インターン」「本選考」を同時に持てる）
create table tracks (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies on delete cascade not null,
  user_id uuid references auth.users not null,
  kind text not null,                    -- summer / winter / main
  status text not null default 'active', -- active / offer / rejected / done
  start_date date,                       -- 選考・エントリーの開始日
  created_at timestamptz default now()
);

-- ★選考ステップ（トラックごとに自由なフローを持てる）
create table steps (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies on delete cascade not null,
  track_id uuid references tracks on delete cascade,
  user_id uuid references auth.users not null,
  name text not null,         -- ステップ名（自由：ES, 一次面接, GD, 最終 など）
  order_index int not null,   -- 並び順
  status text default 'pending', -- pending / current / done / failed
  date timestamptz,           -- 予定日時
  deadline date,              -- 締切
  memo text,                  -- ステップ別メモ
  created_at timestamptz default now()
);

-- インターン
create table internships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  company_id uuid references companies on delete cascade, -- 企業登録時に紐づくインターン日程（null=単体登録）
  company_name text not null,
  start_date date,
  end_date date,
  content text,
  salary text,
  created_at timestamptz default now()
);

-- RLS
alter table companies enable row level security;
alter table tracks enable row level security;
alter table steps enable row level security;
alter table internships enable row level security;
create policy "own companies" on companies for all using (auth.uid() = user_id);
create policy "own tracks" on tracks for all using (auth.uid() = user_id);
create policy "own steps" on steps for all using (auth.uid() = user_id);
create policy "own internships" on internships for all using (auth.uid() = user_id);

-- ▼既存DB向けマイグレーション（一度だけ実行）：インターンを企業に紐づける
-- alter table internships add column if not exists company_id uuid references companies on delete cascade;

-- ▼既存DB向けマイグレーション（一度だけ実行）：本選考の登録に対応
-- 既存の企業はすべて intern 扱いになる。本選考の企業は画面から区分を切り替える。
-- alter table companies add column if not exists selection_type text not null default 'intern';
-- alter table companies add column if not exists main_start_date date;

-- ▼既存DB向けマイグレーション（一度だけ実行）：選考トラックの導入
-- 1社が夏インターン・冬インターン・本選考を並行して持てるようにする。
-- companies.selection_type / main_start_date はトラックへ移行するため以後は使わない（列は残す）。
--
-- create table if not exists tracks (
--   id uuid default gen_random_uuid() primary key,
--   company_id uuid references companies on delete cascade not null,
--   user_id uuid references auth.users not null,
--   kind text not null,
--   status text not null default 'active',
--   start_date date,
--   created_at timestamptz default now()
-- );
-- alter table tracks enable row level security;
-- create policy "own tracks" on tracks for all using (auth.uid() = user_id);
-- alter table steps add column if not exists track_id uuid references tracks on delete cascade;
--
-- 既存の企業から1本ずつトラックを作る。
-- selection_type='main' は本選考、それ以外は夏インターンとみなす（画面で変更可能）。
-- insert into tracks (company_id, user_id, kind, status, start_date)
-- select c.id, c.user_id,
--        case when c.selection_type = 'main' then 'main' else 'summer' end,
--        c.status, c.main_start_date
-- from companies c
-- where not exists (select 1 from tracks t where t.company_id = c.id);
--
-- 既存ステップを、その企業の唯一のトラックに紐づける。
-- update steps s set track_id = t.id
-- from tracks t
-- where t.company_id = s.company_id and s.track_id is null;

-- ▼既存DB向けマイグレーション（一度だけ実行）：企業ロゴの自動表示
-- ロゴ配信は企業名ではなくドメインで引くため、企業サイトの URL を持つ。
-- alter table companies add column if not exists website text;
