import { differenceInCalendarDays, startOfDay } from "date-fns";

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const target = typeof date === "string" ? new Date(date) : date;
  if (isNaN(target.getTime())) return null;
  return differenceInCalendarDays(startOfDay(target), startOfDay(new Date()));
}

/** 残り日数に応じた緊急度の色。 */
export function deadlineTone(days: number | null): "red" | "yellow" | "green" | "gray" {
  if (days === null) return "gray";
  if (days < 0) return "gray";
  if (days <= 2) return "red";
  if (days <= 6) return "yellow";
  return "green";
}

export const TONE_CLASSES: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  yellow: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  gray: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
};

/**
 * 本選考の開始日を短いバッジ文言にする。
 * 未来=「あとN日」/ 当日=「今日から」/ 過去=「開始済み」。日付未設定なら null。
 */
export function mainStartLabel(date: string | null | undefined): string | null {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d > 0) return `あと${d}日`;
  if (d === 0) return "今日から";
  return "開始済み";
}

export function countdownLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}日経過`;
  if (days === 0) return "今日まで";
  if (days === 1) return "明日まで";
  return `あと${days}日`;
}
