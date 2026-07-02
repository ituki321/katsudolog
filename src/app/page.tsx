"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Trophy,
  Percent,
  CalendarClock,
  AlarmClock,
  ListChecks,
  ChevronRight,
  Check,
  Hourglass,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, Step } from "@/lib/types";
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from "@/lib/types";
import {
  countdownLabel,
  daysUntil,
  deadlineTone,
  TONE_CLASSES,
} from "@/lib/dates";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import ConfigBanner from "@/components/ConfigBanner";
import FlowProgress from "@/components/FlowProgress";
import { isSameWeek } from "date-fns";

interface DeadlineItem {
  key: string;
  label: string;
  companyId: string;
  days: number;
  // ワンタップ完了の対象（step ならステップ、webtest なら企業の Webテスト）
  kind: "step" | "webtest";
  targetId: string;
}

export default function DashboardPage() {
  const { ready, configured } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  // 各社の選考フロー：不通過・終了はデフォルトで畳んでおく
  const [showFinished, setShowFinished] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const [c, s] = await Promise.all([
      supabase.from("companies").select("*"),
      supabase.from("steps").select("*"),
    ]);
    setCompanies((c.data as Company[]) ?? []);
    setSteps((s.data as Step[]) ?? []);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    // データ取得（外部システム＝Supabase との同期）。fetch 後の setState は本ルールの対象外運用とする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  const stepsByCompany = useMemo(() => {
    const map: Record<string, Step[]> = {};
    for (const s of steps) (map[s.company_id] ??= []).push(s);
    return map;
  }, [steps]);

  const activeCount = companies.filter((c) => c.status === "active").length;
  const offerCount = companies.filter((c) => c.status === "offer").length;

  const passRate = useMemo(() => {
    const done = steps.filter((s) => s.status === "done").length;
    const failed = steps.filter((s) => s.status === "failed").length;
    const total = done + failed;
    return total === 0 ? null : Math.round((done / total) * 100);
  }, [steps]);

  const thisWeekCount = useMemo(
    () =>
      steps.filter(
        (s) => s.date && isSameWeek(new Date(s.date), new Date(), { weekStartsOn: 1 })
      ).length,
    [steps]
  );

  const deadlines = useMemo<DeadlineItem[]>(() => {
    const items: DeadlineItem[] = [];
    for (const s of steps) {
      // 期限切れも消さずに「N日経過」で出す（黙って消えると見落とす）
      if (s.deadline && s.status !== "done" && s.status !== "failed" && s.status !== "waiting") {
        const d = daysUntil(s.deadline);
        if (d !== null) {
          const c = companies.find((x) => x.id === s.company_id);
          items.push({
            key: `s-${s.id}`,
            label: `${c?.name ?? "企業"}：${s.name} 締切`,
            companyId: s.company_id,
            days: d,
            kind: "step",
            targetId: s.id,
          });
        }
      }
    }
    for (const c of companies) {
      if (c.webtest_deadline && !c.webtest_done) {
        const d = daysUntil(c.webtest_deadline);
        if (d !== null) {
          items.push({
            key: `wt-${c.id}`,
            label: `${c.name}：Webテスト締切`,
            companyId: c.id,
            days: d,
            kind: "webtest",
            targetId: c.id,
          });
        }
      }
    }
    return items.sort((a, b) => a.days - b.days);
  }, [steps, companies]);

  // 締切カウントダウンからワンタップで「結果待ち」へ → リストから即時に消える（楽観的更新）
  const completeDeadline = useCallback(
    async (item: DeadlineItem) => {
      if (item.kind === "step") {
        setSteps((prev) =>
          prev.map((s) => (s.id === item.targetId ? { ...s, status: "waiting" as const } : s))
        );
        if (configured) {
          await getSupabase().from("steps").update({ status: "waiting" }).eq("id", item.targetId);
        }
      } else {
        setCompanies((prev) =>
          prev.map((c) => (c.id === item.targetId ? { ...c, webtest_done: true } : c))
        );
        if (configured) {
          await getSupabase()
            .from("companies")
            .update({ webtest_done: true })
            .eq("id", item.targetId);
        }
      }
    },
    [configured]
  );

  const todos = useMemo(() => {
    const list: {
      key: string;
      label: string;
      companyId: string;
      badge: string;
      badgeClass: string;
    }[] = [];
    for (const s of steps) {
      // 結果待ちは「自分がやること」ではないので今日やることには出さない
      if (s.status === "waiting") continue;
      const c = companies.find((x) => x.id === s.company_id);
      if (s.status === "current") {
        list.push({
          key: `cur-${s.id}`,
          label: `${c?.name ?? "企業"}：${s.name}`,
          companyId: s.company_id,
          badge: "進行中",
          badgeClass:
            "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
        });
      }
      const d = daysUntil(s.deadline);
      // 期限切れ（d < 0）も今日やることに残す
      if (d !== null && d <= 2 && s.status !== "done" && s.status !== "failed") {
        list.push({
          key: `due-${s.id}`,
          label: `${c?.name ?? "企業"}：${s.name}`,
          companyId: s.company_id,
          badge: countdownLabel(d),
          badgeClass: TONE_CLASSES[deadlineTone(d)],
        });
      }
    }
    return list.slice(0, 8);
  }, [steps, companies]);

  // 結果待ち（選考の結果を待っているステップ）。今日やることとは分けて表示する。
  const waitings = useMemo(() => {
    const list: { key: string; label: string; companyId: string }[] = [];
    for (const s of steps) {
      if (s.status !== "waiting") continue;
      const c = companies.find((x) => x.id === s.company_id);
      list.push({ key: `wait-${s.id}`, label: `${c?.name ?? "企業"}：${s.name}`, companyId: s.company_id });
    }
    return list;
  }, [steps, companies]);

  // 各社の選考フロー：志望度が高い順。不通過・終了はトグルを開いたときだけ表示
  const finishedCount = useMemo(
    () => companies.filter((c) => c.status === "rejected" || c.status === "done").length,
    [companies]
  );
  const flowCompanies = useMemo(() => {
    const list = showFinished
      ? companies
      : companies.filter((c) => c.status === "active" || c.status === "offer");
    return [...list].sort((a, b) => b.priority - a.priority);
  }, [companies, showFinished]);

  if (!ready || (configured && loading)) return <Spinner />;

  // 各カードはタップでそのまま該当画面へ飛べる
  const summary = [
    {
      label: "選考中",
      value: activeCount,
      icon: Briefcase,
      color: "from-sky-500 to-blue-600",
      href: "/companies?status=active",
    },
    {
      label: "内定",
      value: offerCount,
      icon: Trophy,
      color: "from-emerald-500 to-teal-600",
      href: "/companies?status=offer",
    },
    {
      label: "通過率",
      value: passRate === null ? "—" : `${passRate}%`,
      icon: Percent,
      color: "from-violet-500 to-purple-600",
      href: "/stats",
    },
    {
      label: "今週の予定",
      value: thisWeekCount,
      icon: CalendarClock,
      color: "from-amber-500 to-orange-600",
      href: "/calendar",
    },
  ];

  return (
    <div>
      <PageHeader title="ダッシュボード" subtitle="就活の全体像をひと目で。" />

      {!configured && <ConfigBanner />}

      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href} className="group">
            <Card className="relative h-full overflow-hidden transition group-hover:scale-[1.02]">
              <div className={`absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br ${color} opacity-20`} />
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white`}>
                  <Icon size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                </div>
              </div>
              <ChevronRight
                size={14}
                className="absolute bottom-2 right-2 text-slate-300 transition group-hover:text-brand-sky dark:text-slate-600"
              />
            </Card>
          </Link>
        ))}
      </div>

      {companies.length === 0 ? (
        <EmptyState
          title="まだデータがありません"
          hint="まずは企業を登録して選考フローを作りましょう"
          action={
            <Link href="/companies" className="text-sm font-medium text-brand-sky hover:underline">
              企業一覧へ →
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 締切カウントダウン */}
          <Card className="lg:col-span-1">
            <div className="mb-3 flex items-center gap-2 font-bold">
              <AlarmClock size={18} className="text-red-500" /> 締切カウントダウン
            </div>
            {deadlines.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">直近の締切はありません</p>
            ) : (
              <ul className="-mr-1 max-h-80 space-y-2 overflow-y-auto pr-1">
                {deadlines.map((d) => (
                  <li key={d.key} className="flex items-center gap-1">
                    <Link
                      href={`/companies/${d.companyId}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      <span className="min-w-0 truncate text-sm">{d.label}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[deadlineTone(d.days)]}`}>
                        {countdownLabel(d.days)}
                      </span>
                    </Link>
                    <button
                      onClick={() => completeDeadline(d)}
                      aria-label="結果待ちにする"
                      title={d.kind === "webtest" ? "完了にする" : "結果待ちにする"}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-400"
                    >
                      {d.kind === "webtest" ? <Check size={16} /> : <Hourglass size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 今日やること */}
          <Card className="lg:col-span-1">
            <div className="mb-3 flex items-center gap-2 font-bold">
              <ListChecks size={18} className="text-brand-sky" /> 今日やること
            </div>
            {todos.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">差し迫ったタスクはありません 🎉</p>
            ) : (
              <ul className="space-y-2">
                {todos.map((t) => (
                  <li key={t.key}>
                    <Link
                      href={`/companies/${t.companyId}`}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brand-sky" />
                      <span className="min-w-0 flex-1 truncate text-sm">{t.label}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.badgeClass}`}
                      >
                        {t.badge}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 結果待ち */}
          <Card className="lg:col-span-1">
            <div className="mb-3 flex items-center gap-2 font-bold">
              <Hourglass size={18} className="text-violet-500" /> 結果待ち
            </div>
            {waitings.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">結果待ちの選考はありません</p>
            ) : (
              <ul className="-mr-1 max-h-80 space-y-2 overflow-y-auto pr-1">
                {waitings.map((w) => (
                  <li key={w.key}>
                    <Link
                      href={`/companies/${w.companyId}`}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                      <span className="min-w-0 truncate text-sm">{w.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 各企業のフロー進捗 */}
          <Card className="lg:col-span-3">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="font-bold">各社の選考フロー</span>
              {finishedCount > 0 && (
                <button
                  onClick={() => setShowFinished((v) => !v)}
                  className="text-xs font-medium text-slate-400 transition hover:text-brand-sky"
                >
                  {showFinished
                    ? "不通過・終了を隠す"
                    : `不通過・終了も表示（${finishedCount}）`}
                </button>
              )}
            </div>
            {flowCompanies.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                選考中の企業はありません
              </p>
            ) : (
              <div className="space-y-5">
                {flowCompanies.map((c) => (
                  <div key={c.id}>
                    <Link
                      href={`/companies/${c.id}`}
                      className="mb-2 flex items-center justify-between gap-2 text-sm font-medium hover:text-brand-sky"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASSES[c.status]}`}
                        >
                          {STATUS_LABELS[c.status]}
                        </span>
                      </span>
                      <ChevronRight size={15} className="shrink-0" />
                    </Link>
                    <FlowProgress steps={stepsByCompany[c.id] ?? []} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
