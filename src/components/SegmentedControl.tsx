"use client";

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
 * - 選択中を示す「つまみ」は 1 枚だけ置いて transform で動かす。合成のみで済むので描画が軽く、
 *   タブを連打しても現在位置から次の位置へ滑らかに繋がる（left/width を animate すると毎フレーム再レイアウトになる）。
 * - イージングは減衰しきったバネ相当（オーバーシュートなし・response ≈ 0.34s）。
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
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 -z-10 rounded-full bg-white shadow-sm transition-transform duration-[340ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-slate-900"
        style={{
          // p-1（左右 0.25rem）を差し引いた残りを等分する
          width: `calc((100% - 0.5rem) / ${count})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />

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
          </button>
        );
      })}
    </div>
  );
}
