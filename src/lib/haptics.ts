/**
 * 触覚フィードバック。
 *
 * 3つの原則で使う：
 *  - 因果  … 何が起こしたのか分かる瞬間にだけ鳴らす（決定した瞬間、嵌まった瞬間）
 *  - 調和  … 見た目の変化と同じフレームで発火させる。遅れると別々の出来事に感じる
 *  - 効用  … 意味のある瞬間だけに絞る。鳴らしすぎると全部無視されるようになる
 *
 * iOS Safari は Vibration API 非対応なので、多くの場合これは無音で終わる。
 * それでも Android では効くうえ、呼び出し箇所が「ここは意味のある瞬間だ」という
 * 設計上の記録として残る。
 */

export type HapticKind =
  /** 選択が切り替わった（セグメント、タブ） */
  | "selection"
  /** 操作が確定した（保存、送信） */
  | "commit"
  /** 掴んでいたものが所定の位置に嵌まった／閉じた */
  | "snap";

const PATTERN: Record<HapticKind, number | number[]> = {
  selection: 8,
  commit: [12, 40, 12],
  snap: 14,
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  // 動きを減らす設定の人は、揺れそのものを避けたい可能性が高い
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERN[kind]);
  } catch {
    // 権限やユーザー操作の文脈がない場合は黙って諦める
  }
}
