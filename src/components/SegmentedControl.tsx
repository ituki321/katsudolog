"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { haptic } from "@/lib/haptics";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** 右肩に出す件数（省略可） */
  count?: number;
}

/**
 * iOS 風セグメンテッドコントロール。
 *
 * 設計メモ：
 * - つまみは選択中のボタンの中に置き、layoutId で位置を繋ぐ。Motion が移動前後の矩形を測って
 *   transform に変換するので（FLIP）、連打しても「今表示されている位置」から次へ繋がる。
 *   自前で translateX を計算していた頃と違い、幅がボタンごとに違っても破綻しない。
 * - バネは減衰しきった設定（オーバーシュートなし・response ≈ 0.34s）。
 *   タブ切替は「投げる」操作ではないので跳ねさせない。
 * - 押した瞬間の手応えは :active の縮小で即返し、確定はクリック（指を離したとき）。
 * - prefers-reduced-motion では つまみを瞬間移動させる。
 * - タブパネルを切り替えるのではなく一覧を絞り込む用途なので、ロールは radiogroup/radio。
 *   選択中だけを Tab 順に載せ（roving tabindex）、左右キーで移動できるようにしている。
 */
export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  className = "",
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const count = segments.length;
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value)
  );
  // layoutId はページ内で一意である必要がある（同じ画面に複数置くため）
  const thumbId = useId();
  const reduceMotion = useReducedMotion();

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (index + delta + count) % count;
    haptic("selection");
    onChange(segments[next].value);
    // 選択が移ったボタンへフォーカスも連れていく（roving tabindex）
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`relative isolate grid select-none rounded-full bg-slate-200/70 p-1 dark:bg-slate-700/50 ${className}`}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) haptic("selection");
              onChange(s.value);
            }}
            className={`relative flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[color,transform] duration-150 active:scale-[0.97] ${
              active
                ? "text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={`segmented-thumb-${thumbId}`}
                className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-slate-900"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", bounce: 0, duration: 0.34 }
                }
              />
            )}
            {/* つまみを負の z-index で沈めると、押下時の scale が作る
                スタッキングコンテキストで重なり順が変わる。ラベル側を持ち上げる */}
            <span className="relative z-10 flex items-center gap-1.5">
              {s.label}
              {typeof s.count === "number" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    active
                      ? "bg-slate-900/10 text-slate-600 dark:bg-white/15 dark:text-slate-200"
                      : "bg-slate-900/5 text-slate-400 dark:bg-white/5 dark:text-slate-500"
                  }`}
                >
                  {s.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
