"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Banknote, CalendarRange } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Internship } from "@/lib/types";
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
import {
  differenceInCalendarDays,
  format,
  isWithinInterval,
  max,
  min,
} from "date-fns";

export default function InternshipsPage() {
  const { ready, configured, userId } = useAuth();
  const [items, setItems] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [content, setContent] = useState("");
  const [salary, setSalary] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return;
    const { data } = await getSupabase()
      .from("internships")
      .select("*")
      .order("start_date", { ascending: true });
    setItems((data as Internship[]) ?? []);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    // データ取得（外部システム＝Supabase との同期）。fetch 後の setState は本ルールの対象外運用とする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !companyName.trim()) return;
    setSaving(true);
    await getSupabase().from("internships").insert({
      user_id: userId,
      company_name: companyName.trim(),
      start_date: start || null,
      end_date: end || null,
      content: content.trim() || null,
      salary: salary.trim() || null,
    });
    setSaving(false);
    setOpen(false);
    setCompanyName("");
    setStart("");
    setEnd("");
    setContent("");
    setSalary("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("このインターンを削除しますか？")) return;
    await getSupabase().from("internships").delete().eq("id", id);
    load();
  }

  // ガントの範囲
  const range = useMemo(() => {
    const dated = items.filter((i) => i.start_date && i.end_date);
    if (dated.length === 0) return null;
    const starts = dated.map((i) => new Date(i.start_date!));
    const ends = dated.map((i) => new Date(i.end_date!));
    const lo = min(starts);
    const hi = max(ends);
    const span = Math.max(differenceInCalendarDays(hi, lo), 1);
    return { lo, hi, span };
  }, [items]);

  function isOngoing(i: Internship): boolean {
    if (!i.start_date || !i.end_date) return false;
    return isWithinInterval(new Date(), {
      start: new Date(i.start_date),
      end: new Date(i.end_date),
    });
  }

  if (!ready || (configured && loading)) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="インターン"
        subtitle={`${items.length} 件のインターンを管理中`}
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> 追加
          </Button>
        }
      />

      {!configured && <ConfigBanner />}

      {items.length === 0 ? (
        <EmptyState
          title="まだインターンが登録されていません"
          hint="参加予定・参加済みのインターンを記録しましょう"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> 追加
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* ガントチャート風 */}
          {range && (
            <Card>
              <div className="mb-4 flex items-center gap-2 font-bold">
                <CalendarRange size={18} className="text-brand-sky" /> 期間タイムライン
              </div>
              <div className="space-y-3">
                {items
                  .filter((i) => i.start_date && i.end_date)
                  .map((i) => {
                    const s = new Date(i.start_date!);
                    const e = new Date(i.end_date!);
                    const left = (differenceInCalendarDays(s, range.lo) / range.span) * 100;
                    const width = Math.max(
                      (differenceInCalendarDays(e, s) / range.span) * 100,
                      3
                    );
                    const ongoing = isOngoing(i);
                    return (
                      <div key={i.id} className="flex items-center gap-3">
                        <div className="w-28 shrink-0 truncate text-xs font-medium">
                          {i.company_name}
                        </div>
                        <div className="relative h-6 flex-1 rounded-full bg-slate-100 dark:bg-slate-700/50">
                          <div
                            className={`absolute top-0 h-6 rounded-full ${
                              ongoing ? "bg-accent pulse-current" : "bg-accent/60"
                            }`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${format(s, "M/d")} - ${format(e, "M/d")}`}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                <span>{format(range.lo, "yyyy/M/d")}</span>
                <span>{format(range.hi, "yyyy/M/d")}</span>
              </div>
            </Card>
          )}

          {/* カード一覧 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <Card key={i.id} className="transition hover:scale-[1.01]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{i.company_name}</div>
                    {(i.start_date || i.end_date) && (
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {i.start_date ? format(new Date(i.start_date), "yyyy/M/d") : "?"} 〜{" "}
                        {i.end_date ? format(new Date(i.end_date), "yyyy/M/d") : "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isOngoing(i) && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        進行中
                      </span>
                    )}
                    <button
                      onClick={() => remove(i.id)}
                      aria-label="削除"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {i.content && (
                  <p className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
                    {i.content}
                  </p>
                )}
                {i.salary && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Banknote size={14} /> {i.salary}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="インターンを追加">
        <form onSubmit={create} className="space-y-4">
          <Field label="企業名 *">
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={inputClass}
              placeholder="株式会社サンプル"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="開始日">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </Field>
            <Field label="終了日">
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="内容">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="業務内容・学んだことなど"
            />
          </Field>
          <Field label="給与・待遇">
            <input
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className={inputClass}
              placeholder="日給1万円 / 時給1500円 など"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={saving || !companyName.trim()}>
              {saving ? "保存中…" : "追加"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
