"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Star,
  Trash2,
  ChevronRight,
  Search,
  Pencil,
  X,
  CalendarRange,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, CompanyStatus, Step, Track, TrackKind } from "@/lib/types";
import { STATUS_LABELS, TRACK_LABELS, TRACK_ORDER } from "@/lib/types";
import { mainStartLabel } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { FLOW_TEMPLATES } from "@/lib/flowTemplates";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Select,
  Spinner,
  inputClass,
} from "@/components/ui";
import ConfigBanner from "@/components/ConfigBanner";
import FlowProgress from "@/components/FlowProgress";
import SegmentedControl from "@/components/SegmentedControl";
import CompanyLogo from "@/components/CompanyLogo";

const statusBadge: Record<string, string> = {
  active: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  offer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  done: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

// ステータス絞り込み用（"all" は全件）
const STATUS_FILTERS: { value: "all" | CompanyStatus; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: STATUS_LABELS.active },
  { value: "offer", label: STATUS_LABELS.offer },
  { value: "rejected", label: STATUS_LABELS.rejected },
  { value: "done", label: STATUS_LABELS.done },
];

// トラック種別ごとの既定テンプレ。インターンは早期選考まで、本選考は新卒テンプレ。
const DEFAULT_TEMPLATE: Record<TrackKind, string> = {
  summer: "intern",
  winter: "intern",
  main: "shinsotsu",
};

export default function CompaniesPage() {
  const { userId, ready, configured } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  // 検索・フィルタ
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TrackKind>("all");

  // 追加 / 編集フォーム（editingId が null なら新規作成）
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [priority, setPriority] = useState(3);
  const [status, setStatus] = useState<CompanyStatus>("active");
  // 新規作成時に同時に作るトラック（複数可）。1社で夏・冬・本選考を並行管理するため。
  const [newTracks, setNewTracks] = useState<TrackKind[]>(["summer"]);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.summer);
  const [saving, setSaving] = useState(false);

  function toggleNewTrack(kind: TrackKind) {
    haptic("selection");
    setNewTracks((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }

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
    const [c, s, t] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("steps").select("*"),
      supabase.from("tracks").select("*"),
    ]);
    setCompanies((c.data as Company[]) ?? []);
    setSteps((s.data as Step[]) ?? []);
    setTracks((t.data as Track[]) ?? []);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    // データ取得（外部システム＝Supabase との同期）。fetch 後の setState は本ルールの対象外運用とする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  // トラックは表示順（夏→冬→本選考）に並べ替えて企業ごとに束ねる
  const tracksByCompany = useMemo(() => {
    const map: Record<string, Track[]> = {};
    for (const t of tracks) (map[t.company_id] ??= []).push(t);
    for (const list of Object.values(map)) {
      list.sort((a, b) => TRACK_ORDER.indexOf(a.kind) - TRACK_ORDER.indexOf(b.kind));
    }
    return map;
  }, [tracks]);

  const stepsByTrack = useMemo(() => {
    const map: Record<string, Step[]> = {};
    for (const s of steps) if (s.track_id) (map[s.track_id] ??= []).push(s);
    return map;
  }, [steps]);

  // 種別ごとの企業数（その種別のトラックを持つ企業の数）
  const typeCounts = useMemo(() => {
    const has = (kind: TrackKind) =>
      companies.filter((c) => (tracksByCompany[c.id] ?? []).some((t) => t.kind === kind))
        .length;
    return {
      all: companies.length,
      summer: has("summer"),
      winter: has("winter"),
      main: has("main"),
    };
  }, [companies, tracksByCompany]);

  // 検索＋区分＋ステータスで絞り込み
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      const list = tracksByCompany[c.id] ?? [];
      if (typeFilter !== "all" && !list.some((t) => t.kind === typeFilter)) return false;
      // ステータスは、いずれかのトラックが該当すれば残す
      if (statusFilter !== "all" && !list.some((t) => t.status === statusFilter)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q)
      );
    });
  }, [companies, query, statusFilter, typeFilter, tracksByCompany]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setIndustry("");
    setWebsite("");
    setPriority(3);
    setStatus("active");
    setNewTracks(["summer"]);
    setTemplateId(DEFAULT_TEMPLATE.summer);
    setInternDates([]);
  }

  function openCreate() {
    resetForm();
    // 特定の種別を見ているときは、その種別で追加したいはずなので初期値を合わせる
    if (typeFilter !== "all") {
      setNewTracks([typeFilter]);
      setTemplateId(DEFAULT_TEMPLATE[typeFilter]);
    }
    setOpen(true);
  }

  function openEdit(c: Company) {
    setEditingId(c.id);
    setName(c.name);
    setIndustry(c.industry ?? "");
    setWebsite(c.website ?? "");
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
          website: website.trim() || null,
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
          website: website.trim() || null,
          priority,
        })
        .select()
        .single();
      if (!error && data) {
        // 選んだ種別ぶんトラックを作る。1社で夏・冬・本選考を並行して持てる
        const kinds = newTracks.length > 0 ? newTracks : (["summer"] as TrackKind[]);
        const { data: created } = await supabase
          .from("tracks")
          .insert(
            kinds.map((kind) => ({ company_id: data.id, user_id: userId, kind }))
          )
          .select();

        const tpl = FLOW_TEMPLATES.find((t) => t.id === templateId);
        if (tpl && tpl.steps.length > 0 && created) {
          // 同じフローを各トラックに複製する。以後はトラックごとに独立して編集できる
          const rows = (created as Track[]).flatMap((tr) =>
            tpl.steps.map((sname, i) => ({
              company_id: data.id,
              track_id: tr.id,
              user_id: userId,
              name: sname,
              order_index: i,
              status: i === 0 ? "current" : "pending",
            }))
          );
          await supabase.from("steps").insert(rows);
        }
        // インターン日程（開始日が入っている行だけ）を企業に紐づけて登録。
        // 区分を本選考に切り替えた場合は、入力途中の日程が残っていても登録しない。
        const hasInternTrack = kinds.some((k) => k === "summer" || k === "winter");
        const internRows = (hasInternTrack ? internDates : [])
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
    // 保存が通った瞬間に確定の合図を返す
    haptic("commit");
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

      {/* 区分の切り替え。インターンと本選考は見たい場面がはっきり分かれるので最上位に置く */}
      <div className="mb-4">
        <SegmentedControl
          label="選考区分で絞り込み"
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-full sm:w-auto sm:inline-grid"
          segments={[
            { value: "all", label: "すべて", count: typeCounts.all },
            { value: "summer", label: "夏", count: typeCounts.summer },
            { value: "winter", label: "冬", count: typeCounts.winter },
            { value: "main", label: "本選考", count: typeCounts.main },
          ]}
        />
      </div>

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

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                statusFilter === f.value
                  ? "bg-accent text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {f.label}
            </button>
          ))}
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
                {filtered.map((c) => (
                  <Card key={c.id} className="flex flex-col transition hover:scale-[1.01]">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/companies/${c.id}`} className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CompanyLogo website={c.website} size={36} />
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

                    {/* 志望度は企業に属する情報なので、トラックより上に置く */}
                    <div className="mt-3 flex justify-end">
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

                    {/* 選考トラック。夏・冬・本選考をこの1枚で並べて見る */}
                    <div className="mt-3 space-y-3">
                      {(tracksByCompany[c.id] ?? []).length === 0 ? (
                        <p className="text-xs text-slate-400">選考が未登録です</p>
                      ) : (
                        (tracksByCompany[c.id] ?? []).map((t) => (
                          <div
                            key={t.id}
                            className="rounded-xl border border-separator p-2.5"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  t.kind === "main"
                                    ? "bg-accent text-white"
                                    : "bg-accent/10 text-accent"
                                }`}
                              >
                                {TRACK_LABELS[t.kind]}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[t.status]}`}
                              >
                                {STATUS_LABELS[t.status]}
                              </span>
                              {mainStartLabel(t.start_date) && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                  {mainStartLabel(t.start_date)}
                                </span>
                              )}
                            </div>
                            <FlowProgress steps={stepsByTrack[t.id] ?? []} compact />
                          </div>
                        ))
                      )}
                    </div>

                    <Link
                      href={`/companies/${c.id}`}
                      className="mt-4 flex items-center justify-end gap-1 text-xs font-medium text-brand-sky hover:underline"
                    >
                      詳細・フロー編集 <ChevronRight size={14} />
                    </Link>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={open} onClose={closeModal} title={editingId ? "企業を編集" : "企業を追加"}>
        <form onSubmit={submitForm} className="space-y-4">
          {!editingId && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                登録する選考（複数可）
              </span>
              <div className="grid grid-cols-3 gap-2">
                {TRACK_ORDER.map((kind) => {
                  const on = newTracks.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleNewTrack(kind)}
                      className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-medium transition-transform duration-150 active:scale-[0.97] ${
                        on
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-separator text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {TRACK_LABELS[kind]}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1.5 block text-[11px] text-slate-400">
                あとから企業の詳細ページで追加・削除できます。開始日もそこで設定します。
              </span>
            </div>
          )}

          <Field label="企業名 *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="株式会社サンプル"
            />
          </Field>
          <Field label="企業サイトURL（任意）">
            <div className="flex items-center gap-2">
              {/* 入力した瞬間にロゴが出るので、取れたかどうかがその場で分かる */}
              <CompanyLogo website={website} size={40} />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={inputClass}
                placeholder="example.co.jp"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <span className="mt-1 block text-[11px] text-slate-400">
              企業の公式サイト。ここからロゴを取得します（マイページURLでは取得できません）
            </span>
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
                <Select
                  ariaLabel="ステータス"
                  value={status}
                  onValueChange={(v) => setStatus(v as CompanyStatus)}
                  options={Object.entries(STATUS_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  }))}
                />
              </Field>
            )}
          </div>
          {!editingId && (
            <Field label="選考フローのテンプレート">
              <Select
                ariaLabel="選考フローのテンプレート"
                value={templateId}
                onValueChange={setTemplateId}
                options={FLOW_TEMPLATES.map((t) => ({
                  value: t.id,
                  label:
                    t.steps.length > 0 ? `${t.label}（${t.steps.join(" → ")}）` : t.label,
                }))}
              />
            </Field>
          )}
          {!editingId && newTracks.some((k) => k === "summer" || k === "winter") && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <CalendarRange size={14} className="text-brand-sky" /> インターン日程（複数可）
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
