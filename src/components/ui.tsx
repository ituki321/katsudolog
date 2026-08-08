"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { haptic } from "@/lib/haptics";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "motion/react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`surface p-4 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {/* 大きい字は字間が空いて見えるので詰め、行間も締める。本文側は既定のまま */}
        <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  // 押した瞬間に縮む手応えを返す。指を離すまで何も起きないと「死んでいる」と読まれる。
  // hover の拡大は装飾なので reduced-motion では止めるが、押下の反応は残す（前庭系に障らないため）。
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition duration-150 disabled:opacity-50 disabled:pointer-events-none hover:scale-[1.03] active:scale-[0.97] motion-reduce:hover:scale-100";
  const styles: Record<string, string> = {
    primary: "bg-accent text-white shadow-sm",
    ghost:
      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
    outline:
      "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700",
    danger: "bg-red-500 text-white shadow-md hover:bg-red-600",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** モバイル（sm 未満）ではボトムシート、それ以上では中央ダイアログとして振る舞う */
const SHEET_QUERY = "(max-width: 639.98px)";
/** 掴んで下ろしたとき、この割合を越えて滑る見込みなら閉じる */
const DISMISS_RATIO = 0.35;
/** 位置に関係なく閉じると判断する下向き速度（px/秒） */
const DISMISS_VELOCITY = 700;

/**
 * 指を離した勢いから「そのまま滑らせたら止まる位置」までの移動量。
 * スクロールの減速と同じ指数減衰で、教科書の v²/(2a) ではなくこちらが実機の挙動に一致する。
 * 離した“位置”ではなく“行き先”で閉じるか戻すかを決めるので、軽く弾くだけで閉じられる。
 */
function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** メディアクエリの購読。effect で setState しないので描画が1往復ぶん短い */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const isSheet = useMediaQuery(SHEET_QUERY);
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();
  // ドラッグはヘッダーでだけ受ける。本文はスクロールさせたいので、掴む場所と取り合わせない
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);

  // 出る道と戻る道を同じ variants で書く。別々に書くと必ずどちらかがズレる
  const variants = reduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : isSheet
      ? { hidden: { y: "100%" }, visible: { y: 0 } }
      : { hidden: { opacity: 0, scale: 0.96 }, visible: { opacity: 1, scale: 1 } };

  // 減衰しきったバネ（bounce 0 = damping 1.0 相当、response 0.35s）。
  // シートは「投げる」操作を受けるが、跳ねると閉じ際が落ち着かないので行き過ぎはさせない。
  const transition = reduceMotion
    ? { duration: 0.15 }
    : ({ type: "spring", bounce: 0, duration: 0.35 } as const);

  useEffect(() => {
    if (open) controls.start("visible");
  }, [open, controls]);

  // onClose は呼び出し側でレンダリングのたびに作り直されることが多い。
  // これを下の effect の依存に入れると、1文字入力するたびに effect が張り直され、
  // クリーンアップの focus 復帰と再実行時の初期フォーカスで入力欄からフォーカスが奪われる。
  // 依存に載せず、常に最新の関数を ref 経由で呼ぶ。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 背面のスクロールを止める＋Escape で閉じる＋フォーカスを閉じ込め、閉じたら呼び出し元へ返す
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = bodyOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const height = panelRef.current?.offsetHeight ?? 1;
    const velocity = info.velocity.y;
    const projected = info.offset.y + projectMomentum(velocity);

    if (projected > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY) {
      // 閉じる。exit は今いる位置から続くので、指の動きと閉じる動きの間に切れ目ができない。
      // 触覚は「閉じると決まった」この瞬間に鳴らす。閉じ終わってからでは因果が繋がらない
      haptic("snap");
      onClose();
      return;
    }
    // 戻す。指の速度を初速として渡すぶん、離した瞬間の勢いがそのまま繋がる
    haptic("snap");
    controls.start("visible", {
      type: "spring",
      bounce: 0,
      duration: 0.35,
      velocity,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
            variants={variants}
            initial="hidden"
            animate={controls}
            exit="hidden"
            transition={transition}
            drag={isSheet && !reduceMotion ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            // 上端より上へは開かないので、越えた分は抵抗を効かせて「この先は無い」と伝える
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0.2, bottom: 0 }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onPointerDown={(e) => isSheet && dragControls.start(e)}
              className="shrink-0 touch-none px-5 pb-3 pt-3 sm:touch-auto"
            >
              <div
                aria-hidden
                className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden"
              />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="閉じる"
                  className="rounded-lg p-1.5 text-slate-500 transition-transform duration-150 hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full min-w-0 box-border max-w-full rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm outline-none transition focus:border-brand-sky focus:ring-2 focus:ring-brand-sky/30 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-100";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * 選択メニュー。素の <select> は OS が描くのでアプリの素材感から浮き、
 * ダークモードの見え方も端末任せになる。振る舞いと a11y は Radix、動きは Motion に任せる。
 *
 * ポップオーバーは半透明にしない。ガラスカードの上に開くことがあり、
 * 半透明の上に半透明を重ねると可読性が崩れるため。
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => {
        haptic("selection");
        onValueChange(v);
      }}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={`${inputClass} flex items-center justify-between gap-2 text-left transition-transform duration-150 active:scale-[0.99]`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <AnimatePresence>
        {open && (
          <SelectPrimitive.Portal forceMount>
            <SelectPrimitive.Content asChild position="popper" sideOffset={6}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                // 引き金の位置から開く。中心から拡大すると、どこから出たのか読み取れない
                style={{
                  transformOrigin: "var(--radix-select-content-transform-origin)",
                  minWidth: "var(--radix-select-trigger-width)",
                }}
                className="z-[60] overflow-hidden rounded-xl border border-separator bg-surface shadow-xl"
              >
                <SelectPrimitive.Viewport className="max-h-64 p-1">
                  {options.map((o) => (
                    <SelectPrimitive.Item
                      key={o.value}
                      value={o.value}
                      className="relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:font-semibold dark:data-[highlighted]:bg-slate-700"
                    >
                      <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator>
                        <Check size={15} className="text-brand-sky" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Viewport>
              </motion.div>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        )}
      </AnimatePresence>
    </SelectPrimitive.Root>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-brand-sky" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
      {action}
    </div>
  );
}
