export type CompanyStatus = "active" | "offer" | "rejected" | "done";
export type StepStatus = "pending" | "current" | "waiting" | "done" | "failed";
/** 選考の区分。intern=インターン選考 / main=本選考
 *  @deprecated 1社が複数の選考を持てるようになったため TrackKind に移行。列は当面残す */
export type SelectionType = "intern" | "main";

/** 選考トラックの種類。1社がこれらを同時に持てる */
export type TrackKind = "summer" | "winter" | "main";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  industry: string | null;
  priority: number;
  /** 企業サイトのURL。ロゴ取得のドメイン源。マイページURLは就活サイトを指すので使えない */
  website: string | null;
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

/**
 * 選考トラック。「夏インターン」「冬インターン」「本選考」をそれぞれ1本として扱う。
 * ステータスと開始日はトラックごとに持つ（夏は通過、本選考は選考中、が普通に起きるため）。
 */
export interface Track {
  id: string;
  company_id: string;
  user_id: string;
  kind: TrackKind;
  status: CompanyStatus;
  start_date: string | null;
  created_at: string;
}

export interface Step {
  id: string;
  company_id: string;
  /** 所属する選考トラック。移行前の古い行では null になりうる */
  track_id: string | null;
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

export const TRACK_LABELS: Record<TrackKind, string> = {
  summer: "夏インターン",
  winter: "冬インターン",
  main: "本選考",
};

/** 表示順。時系列（夏 → 冬 → 本選考）に並べる */
export const TRACK_ORDER: TrackKind[] = ["summer", "winter", "main"];

/**
 * start_date が何の日付なのかは種別で呼び名が変わるので、画面ではこの文言を出す。
 * どれも「その選考の受付・選考が始まる日」を指し、インターンの実施日程ではない
 * （実施日程は internships 側で管理する）。
 */
export const TRACK_START_LABELS: Record<TrackKind, string> = {
  summer: "エントリー開始日",
  winter: "エントリー開始日",
  main: "本選考の開始日",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: "未着手",
  current: "進行中",
  waiting: "結果待ち",
  done: "通過",
  failed: "不通過",
};
