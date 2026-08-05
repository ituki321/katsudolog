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
  Rocket,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, SelectionType, Step } from "@/lib/types";
import { SELECTION_LABELS } from "@/lib/types";
import {
  countdownLabel,
  daysUntil,
  deadlineTone,
  mainStartLabel,
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
      if (s.deadline && s.status !== "done" && s.status !== "failed" && s.status !== "waiting") {
        const d = daysUntil(s.deadline);
        if (d !== null && d >= 0) {
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
        if (d !== null && d >= 0) {
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
    const list: { key: string; label: string; companyId: string }[] = [];
    for (const s of steps) {
      // 結果待ちは「自分がやること」ではないので今日やることには出さない
      if (s.status === "waiting") continue;
      if (s.status === "current") {
        const c = companies.find((x) => x.id === s.company_id);
        list.push({ key: `cur-${s.id}`, label: `${c?.name ?? "企業"}：${s.name}（進行中）`, companyId: s.company_id });
      }
      const d = daysUntil(s.deadline);
      if (d !== null && d >= 0 && d <= 2 && s.status !== "done" && s.status !== "failed") {
        const c = companies.find((x) => x.id === s.company_id);
        list.push({ key: `due-${s.id}`, label: `${c?.name ?? "企業"}：${s.name} が${countdownLabel(d)}`, companyId: s.company_id });
      }
    }
    return list.slice(0, 8);
  }, [steps, companies]);

  // 選考フロー一覧を区分で束ねる。本選考を先に出す（動いている選考から目に入るように）。
  const flowGroups = useMemo(() => {
    const groups: { type: SelectionType; items: Company[] }[] = [
      { type: "main", items: companies.filter((c) => c.selection_type === "main") },
      { type: "intern", items: companies.filter((c) => c.selection_type !== "main") },
    ];
    return groups.filter((g) => g.items.length > 0);
  }, [companies]);

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

  if (!ready || (configured && loading)) return <Spinner />;

  const summary = [
    { label: "選考中", value: activeCount, icon: Briefcase },
    { label: "内定", value: offerCount, icon: Trophy },
    { label: "通過率", value: passRate === null ? "—" : `${passRate}%`, icon: Percent },
    { label: "今週の予定", value: thisWeekCount, icon: CalendarClock },
  ];

  return (
    <div>
      <PageHeader title="ダッシュボード" subtitle="就活の全体像をひと目で。" />

      {!configured && <ConfigBanner />}

      {/* サマリーカード */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon size={20} />
              </div>
              <div>
                {/* 数字は等幅字形にして、更新のたびに桁がずれないようにする */}
                <div className="text-2xl font-bold tabular-nums tracking-tight">{value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
              </div>
            </div>
          </Card>
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
              <p className="py-6 text-center text-sm text-slate-400">差し迫ったタスクはありません</p>
            ) : (
              <ul className="space-y-2">
                {todos.map((t) => (
                  <li key={t.key}>
                    <Link
                      href={`/companies/${t.companyId}`}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brand-sky" />
                      <span className="min-w-0 truncate text-sm">{t.label}</span>
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

          {/* 各企業のフロー進捗（区分ごとにまとめる） */}
          <Card className="lg:col-span-3">
            <div className="mb-4 font-bold">各社の選考フロー</div>
            <div className="space-y-7">
              {flowGroups.map((g) => (
                <section key={g.type}>
                  <div className="mb-3 flex items-center gap-2">
                    {g.type === "main" ? (
                      <Rocket size={15} className="shrink-0 text-brand-sky" />
                    ) : (
                      <Briefcase size={15} className="shrink-0 text-slate-400" />
                    )}
                    <h3 className="text-sm font-semibold tracking-tight">
                      {SELECTION_LABELS[g.type]}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                      {g.items.length}
                    </span>
                    <div className="h-px flex-1 bg-slate-200/70 dark:bg-slate-700/60" />
                  </div>

                  <div className="space-y-5">
                    {g.items.map((c) => (
                      <div key={c.id}>
                        <Link
                          href={`/companies/${c.id}`}
                          className="mb-2 flex items-center justify-between gap-2 text-sm font-medium hover:text-brand-sky"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {g.type === "main" && mainStartLabel(c.main_start_date) && (
                              <span className="rounded-full bg-brand-sky/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand-navy dark:bg-brand-sky/15 dark:text-brand-sky">
                                {mainStartLabel(c.main_start_date)}
                              </span>
                            )}
                            <ChevronRight size={15} />
                          </span>
                        </Link>
                        <FlowProgress steps={stepsByCompany[c.id] ?? []} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
