"use client";

import { Check, X, Hourglass } from "lucide-react";
import type { Step } from "@/lib/types";

const dotStyle: Record<string, string> = {
  done: "bg-emerald-500 text-white",
  current: "bg-orange-500 text-white pulse-current",
  waiting: "bg-violet-500 text-white",
  failed: "bg-red-500 text-white",
  pending: "bg-slate-300 text-slate-500 dark:bg-slate-600 dark:text-slate-300",
};

const lineStyle: Record<string, string> = {
  done: "bg-emerald-500",
  current: "bg-orange-400",
  waiting: "bg-violet-400",
  failed: "bg-red-400",
  pending: "bg-slate-300 dark:bg-slate-600",
};

/**
 * 選考フローの進捗バー。done=緑チェック / current=オレンジ点滅 / waiting=紫（結果待ち） / pending=グレー / failed=赤
 */
export default function FlowProgress({
  steps,
  compact = false,
}: {
  steps: Step[];
  compact?: boolean;
}) {
  const ordered = [...steps].sort((a, b) => a.order_index - b.order_index);
  if (ordered.length === 0) {
    return (
      <p className="text-xs text-slate-400">ステップ未設定</p>
    );
  }
  return (
    // ステップ名を出す版は、数が増えるとラベルぶんの最低幅で画面からはみ出す。
    // ラベルを捨てると手がかりが無くなるので、はみ出しはこの枠の中の横スクロールに閉じ込める
    // （ページ本体は絶対に横に広がらない）。ドットだけの compact 版は幅を食わないので対象外。
    <div
      className={
        compact ? "flex min-w-0 items-center" : "-mx-1 flex min-w-0 overflow-x-auto px-1 pb-1"
      }
    >
      <div className={compact ? "flex min-w-0 flex-1 items-center" : "flex min-w-max flex-1 items-center"}>
      {ordered.map((s, i) => (
        <div key={s.id} className="flex min-w-0 flex-1 items-center last:flex-none">
          <div className="flex shrink-0 flex-col items-center">
            <div
              className={`flex items-center justify-center rounded-full ${
                compact ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs"
              } font-bold ${dotStyle[s.status]}`}
              title={s.name}
            >
              {s.status === "done" ? (
                <Check size={compact ? 12 : 16} />
              ) : s.status === "failed" ? (
                <X size={compact ? 12 : 16} />
              ) : s.status === "waiting" ? (
                <Hourglass size={compact ? 11 : 14} />
              ) : (
                i + 1
              )}
            </div>
            {!compact && (
              <span className="mt-1 max-w-[64px] truncate text-[10px] text-slate-500 dark:text-slate-400">
                {s.name}
              </span>
            )}
          </div>
          {i < ordered.length - 1 && (
            <div
              className={`mx-1 h-1 flex-1 rounded-full ${compact ? "" : "min-w-6"} ${lineStyle[s.status]}`}
            />
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
