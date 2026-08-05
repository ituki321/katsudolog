-- 企業
create table companies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  industry text,
  priority int default 3,
  -- ★企業ごとの登録情報
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

-- ★選考ステップ（企業ごとに自由なフローを持てる）
create table steps (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies on delete cascade not null,
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
alter table steps enable row level security;
alter table internships enable row level security;
create policy "own companies" on companies for all using (auth.uid() = user_id);
create policy "own steps" on steps for all using (auth.uid() = user_id);
create policy "own internships" on internships for all using (auth.uid() = user_id);

-- ▼既存DB向けマイグレーション（一度だけ実行）：インターンを企業に紐づける
-- alter table internships add column if not exists company_id uuid references companies on delete cascade;

-- ▼既存DB向けマイグレーション（一度だけ実行）：本選考の登録に対応
-- 既存の企業はすべて intern 扱いになる。本選考の企業は画面から区分を切り替える。
-- alter table companies add column if not exists selection_type text not null default 'intern';
-- alter table companies add column if not exists main_start_date date;
