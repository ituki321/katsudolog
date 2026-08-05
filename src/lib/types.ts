export type CompanyStatus = "active" | "offer" | "rejected" | "done";
export type StepStatus = "pending" | "current" | "waiting" | "done" | "failed";
/** 選考の区分。intern=インターン選考 / main=本選考 */
export type SelectionType = "intern" | "main";

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
  selection_type: SelectionType;
  /** 本選考の開始日（エントリー受付開始）。intern の企業では通常 null */
  main_start_date: string | null;
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

export const SELECTION_LABELS: Record<SelectionType, string> = {
  intern: "インターン",
  main: "本選考",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: "未着手",
  current: "進行中",
  waiting: "結果待ち",
  done: "通過",
  failed: "不通過",
};
