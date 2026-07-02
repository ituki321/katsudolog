export type CompanyStatus = "active" | "offer" | "rejected" | "done";
export type StepStatus = "pending" | "current" | "waiting" | "done" | "failed";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  industry: string | null;
  priority: number;
  mypage_url: string | null;
  webtest_url: string | null;
  webtest_deadline: string | null;
  webtest_done: boolean;
  memo: string | null;
  status: CompanyStatus;
  created_at: string;
}

export interface Step {
  id: string;
  company_id: string;
  user_id: string;
  name: string;
  order_index: number;
  status: StepStatus;
  date: string | null;
  deadline: string | null;
  memo: string | null;
  created_at: string;
}

export interface Internship {
  id: string;
  user_id: string;
  company_id: string | null; // 企業登録から作られたインターンは企業に紐づく（不通過で自動非表示にするため）
  company_name: string;
  start_date: string | null;
  end_date: string | null;
  content: string | null;
  salary: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  active: "選考中",
  offer: "内定",
  rejected: "不通過",
  done: "終了",
};

// 企業ステータスのバッジ色（一覧・ダッシュボード共通）
export const STATUS_BADGE_CLASSES: Record<CompanyStatus, string> = {
  active: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  done: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: "未着手",
  current: "進行中",
  waiting: "結果待ち",
  done: "通過",
  failed: "不通過",
};
