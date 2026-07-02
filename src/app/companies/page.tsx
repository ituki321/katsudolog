"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Star,
  Trash2,
  ChevronRight,
  Building2,
  Search,
  Pencil,
  X,
  CalendarRange,
  AlarmClock,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, CompanyStatus, Step } from "@/lib/types";
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from "@/lib/types";
import { FLOW_TEMPLATES } from "@/lib/flowTemplates";
import { countdownLabel, daysUntil, deadlineTone, TONE_CLASSES } from "@/lib/dates";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/ui";
import ConfigBanner from "@/components/ConfigBanner";
import FlowProgress from "@/components/FlowProgress";

// ステータス絞り込み用（"all" は全件）
const STATUS_FILTERS: { value: "all" | CompanyStatus; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "offer", label: STATUS_LABELS.offer },
  { value: "rejected", label: STATUS_LABELS.rejected },
  { value: "done", label: STATUS_LABELS.done },
];

const SORTS = [
  { value: "newest", label: "登録が新しい順" },
  { value: "priority", label: "志望度が高い順" },
  { value: "deadline", label: "締切が近い順" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

function isCompanyStatus(v: string | null): v is CompanyStatus {
  return v === "active" || v === "offer" || v === "rejected" || v === "done";
}

// 企業カードに出す「一番近い締切」（未完了ステップの締切＋未完了Webテスト締切の最小値）
function nearestDeadline(c: Company, steps: Step[]): number | null {
  const candidates: number[] = [];
  for (const s of steps) {
    if (s.deadline && s.status !== "done" && s.status !== "failed" && s.status !== "waiting") {
      const d = daysUntil(s.deadline);
      if (d !== null) candidates.push(d);
    }
  }
  if (c.webtest_deadline && !c.webtest_done) {
    const d = daysUntil(c.webtest_deadline);
    if (d !== null) candidates.push(d);
  }
  return candidates.length === 0 ? null : Math.min(...candidates);
}

function CompaniesPageInner({ statusParam }: { statusParam: string | null }) {
  const { userId, ready, configured } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);

  // 検索・フィルタ・並び替え
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>(
    isCompanyStatus(statusParam) ? statusParam : "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  // 追加 / 編集フォーム（editingId が null なら新規作成）
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [priority, setPriority] = useState(3);
  const [status, setStatus] = useState<CompanyStatus>("active");
  const [templateId, setTemplateId] = useState("shinsotsu");
  const [saving, setSaving] = useState(false);

  // 企業登録時に同時に登録するインターン日程（複数可）
  const [internDates, setInternDates] = useState<
    { start: string; end: string; content: string }[]
  >([]);

  function addInternRow() {
    setInternDates((rows) => [...rows, { start: "", end: "", content: "" }]);
  }
  function updateInternRow(
    idx: number,
    patch: Partial<{ start: string; end: string; content: string }>
  ) {
    setInternDates((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeInternRow(idx: number) {
    setInternDates((rows) => rows.filter((_, i) => i !== idx));
  }

  const load = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const [c, s] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
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

  // フィルタチップに件数を出す（絞り込む前に全体の内訳が見えるように）
  const statusCounts = useMemo(() => {
    const map = { all: companies.length } as Record<"all" | CompanyStatus, number>;
    for (const f of STATUS_FILTERS) if (f.value !== "all") map[f.value] = 0;
    for (const c of companies) map[c.status] += 1;
    return map;
  }, [companies]);

  // 検索＋ステータスで絞り込み → 並び替え
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = companies.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q)
      );
    });
    if (sortKey === "priority") {
      list.sort((a, b) => b.priority - a.priority);
    } else if (sortKey === "deadline") {
      // 締切なしは最後へ
      list.sort((a, b) => {
        const da = nearestDeadline(a, stepsByCompany[a.id] ?? []);
        const db = nearestDeadline(b, stepsByCompany[b.id] ?? []);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }
    // "newest" は取得時の created_at 降順のまま
    return list;
  }, [companies, query, statusFilter, sortKey, stepsByCompany]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setIndustry("");
    setPriority(3);
    setStatus("active");
    setTemplateId("shinsotsu");
    setInternDates([]);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(c: Company) {
    setEditingId(c.id);
    setName(c.name);
    setIndustry(c.industry ?? "");
    setPriority(c.priority);
    setStatus(c.status);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    resetForm();
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name.trim()) return;
    setSaving(true);
    const supabase = getSupabase();

    if (editingId) {
      // ---- 更新 ----
      await supabase
        .from("companies")
        .update({
          name: name.trim(),
          industry: industry.trim() || null,
          priority,
          status,
        })
        .eq("id", editingId);
    } else {
      // ---- 新規作成 ----
      const { data, error } = await supabase
        .from("companies")
        .insert({
          user_id: userId,
          name: name.trim(),
          industry: industry.trim() || null,
          priority,
        })
        .select()
        .single();
      if (!error && data) {
        const tpl = FLOW_TEMPLATES.find((t) => t.id === templateId);
        if (tpl && tpl.steps.length > 0) {
          const rows = tpl.steps.map((sname, i) => ({
            company_id: data.id,
            user_id: userId,
            name: sname,
            order_index: i,
            status: i === 0 ? "current" : "pending",
          }));
          await supabase.from("steps").insert(rows);
        }
        // インターン日程（開始日が入っている行だけ）を企業に紐づけて登録
        const internRows = internDates
          .filter((r) => r.start)
          .map((r) => ({
            user_id: userId,
            company_id: data.id,
            company_name: name.trim(),
            start_date: r.start,
            end_date: r.end || null,
            content: r.content.trim() || null,
          }));
        if (internRows.length > 0) {
          await supabase.from("internships").insert(internRows);
        }
      }
    }

    setSaving(false);
    closeModal();
    load();
  }

  async function remove(id: string) {
    if (!confirm("この企業と関連ステップを削除しますか？")) return;
    await getSupabase().from("companies").delete().eq("id", id);
    load();
  }

  if (!ready || (configured && loading)) return <Spinner />;

  const hasCompanies = companies.length > 0;

  return (
    <div>
      <PageHeader
        title="企業一覧"
        subtitle={`${companies.length} 社を管理中`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} /> 企業を追加
          </Button>
        }
      />

      {!configured && <ConfigBanner />}

      {/* 検索 ＆ フィルタ ツールバー（企業0件・シークレットモード等でも常に表示） */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pl-9 pr-9`}
            placeholder="企業名・業界で検索"
            aria-label="企業を検索"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="検索をクリア"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === f.value
                  ? "brand-gradient text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {f.label}
              <span className={statusFilter === f.value ? "ml-1 opacity-80" : "ml-1 opacity-60"}>
                {statusCounts[f.value]}
              </span>
            </button>
          ))}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="並び替え"
            className="ml-1 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 outline-none transition focus:border-brand-sky dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasCompanies ? (
        <EmptyState
          title="まだ企業が登録されていません"
          hint="「企業を追加」から選考フローのテンプレを選んで始めましょう"
          action={
            <Button onClick={openCreate}>
              <Plus size={16} /> 企業を追加
            </Button>
          }
        />
      ) : (
        <>
          {filtered.length === 0 ? (
            <EmptyState
              title="該当する企業が見つかりません"
              hint="検索キーワードやフィルタを変更してみてください"
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-400">{filtered.length} 件を表示中</p>
              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((c) => {
                  const nearest =
                    c.status === "active" ? nearestDeadline(c, stepsByCompany[c.id] ?? []) : null;
                  return (
                  <Card key={c.id} className="flex flex-col transition hover:scale-[1.01]">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/companies/${c.id}`} className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl brand-gradient text-white">
                            <Building2 size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-bold">{c.name}</div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {c.industry || "業界未設定"}
                            </div>
                          </div>
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center">
                        <button
                          onClick={() => openEdit(c)}
                          aria-label="編集"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-sky dark:hover:bg-slate-700"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          aria-label="削除"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[c.status]}`}
                        >
                          {STATUS_LABELS[c.status]}
                        </span>
                        {nearest !== null && (
                          <span
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[deadlineTone(nearest)]}`}
                          >
                            <AlarmClock size={11} /> {countdownLabel(nearest)}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={
                              i < c.priority
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 dark:text-slate-600"
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <FlowProgress steps={stepsByCompany[c.id] ?? []} />
                    </div>

                    <Link
                      href={`/companies/${c.id}`}
                      className="mt-4 flex items-center justify-end gap-1 text-xs font-medium text-brand-sky hover:underline"
                    >
                      詳細・フロー編集 <ChevronRight size={14} />
                    </Link>
                  </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={open} onClose={closeModal} title={editingId ? "企業を編集" : "企業を追加"}>
        <form onSubmit={submitForm} className="space-y-4">
          <Field label="企業名 *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="株式会社サンプル"
            />
          </Field>
          <Field label="業界">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={inputClass}
              placeholder="IT / メーカー / 金融 など"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="志望度">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setPriority(i + 1)}
                    className="p-1"
                    aria-label={`志望度${i + 1}`}
                  >
                    <Star
                      size={24}
                      className={
                        i < priority
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300 dark:text-slate-600"
                      }
                    />
                  </button>
                ))}
              </div>
            </Field>
            {editingId && (
              <Field label="ステータス">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CompanyStatus)}
                  className={inputClass}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {!editingId && (
            <Field label="選考フローのテンプレート">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputClass}
              >
                {FLOW_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.steps.length > 0 ? `（${t.steps.join(" → ")}）` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!editingId && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <CalendarRange size={14} className="text-brand-sky" /> インターン！日程（複数可）
                </span>
                <button
                  type="button"
                  onClick={addInternRow}
                  className="flex items-center gap-1 text-xs font-medium text-brand-sky hover:underline"
                >
                  <Plus size={13} /> 日程を追加
                </button>
              </div>
              {internDates.length === 0 ? (
                <p className="text-xs text-slate-400">
                  「日程を追加」でインターンの予定を登録できます（カレンダーに表示されます）。
                </p>
              ) : (
                <div className="space-y-2">
                  {internDates.map((r, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700"
                    >
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                            開始日
                            <input
                              type="date"
                              value={r.start}
                              onChange={(e) => updateInternRow(i, { start: e.target.value })}
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                            終了日
                            <input
                              type="date"
                              value={r.end}
                              onChange={(e) => updateInternRow(i, { end: e.target.value })}
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeInternRow(i)}
                          aria-label="この日程を削除"
                          className="mt-4 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <input
                        value={r.content}
                        onChange={(e) => updateInternRow(i, { content: e.target.value })}
                        className={`${inputClass} mt-2`}
                        placeholder="内容・メモ（任意）"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal}>
              キャンセル
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "保存中…" : editingId ? "更新" : "作成"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ダッシュボードのサマリーカード（/companies?status=active など）から絞り込み済みで開ける。
// searchParams prop は Promise なので React の use() で読む
export default function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status } = use(searchParams);
  return <CompaniesPageInner statusParam={typeof status === "string" ? status : null} />;
}
