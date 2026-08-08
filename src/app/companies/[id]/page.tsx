"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Star,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Link2,
  Check,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, CompanyStatus, Step, StepStatus, Track, TrackKind } from "@/lib/types";
import {
  STATUS_LABELS,
  STEP_STATUS_LABELS,
  TRACK_LABELS,
  TRACK_ORDER,
  TRACK_START_LABELS,
} from "@/lib/types";
import { FLOW_TEMPLATES } from "@/lib/flowTemplates";
import CompanyLogo from "@/components/CompanyLogo";
import { normalizeUrl, openUrl } from "@/lib/url";
import { haptic } from "@/lib/haptics";
import { countdownLabel, daysUntil, deadlineTone, TONE_CLASSES } from "@/lib/dates";
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  Spinner,
  inputClass,
} from "@/components/ui";
import FlowProgress from "@/components/FlowProgress";

const stepStatusColor: Record<StepStatus, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  current: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  waiting: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// トラック種別ごとの既定テンプレ。企業追加画面と同じ対応にする
const DEFAULT_TEMPLATE: Record<TrackKind, string> = {
  summer: "intern",
  winter: "intern",
  main: "shinsotsu",
};

function toDateInput(v: string | null): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}
function toDateTimeInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { ready, configured, userId } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  // ステップ追加欄はトラックごとに独立して持つ
  const [newStep, setNewStep] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const [c, s, t] = await Promise.all([
      supabase.from("companies").select("*").eq("id", id).single(),
      supabase.from("steps").select("*").eq("company_id", id).order("order_index"),
      supabase.from("tracks").select("*").eq("company_id", id),
    ]);
    setCompany((c.data as Company) ?? null);
    setSteps((s.data as Step[]) ?? []);
    const list = ((t.data as Track[]) ?? []).sort(
      (a, b) => TRACK_ORDER.indexOf(a.kind) - TRACK_ORDER.indexOf(b.kind)
    );
    setTracks(list);
    setLoading(false);
  }, [configured, id]);

  useEffect(() => {
    // データ取得（外部システム＝Supabase との同期）。fetch 後の setState は本ルールの対象外運用とする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  function patchCompany(patch: Partial<Company>) {
    setCompany((c) => (c ? { ...c, ...patch } : c));
  }

  async function saveInfo() {
    if (!company) return;
    setSavingInfo(true);
    await getSupabase()
      .from("companies")
      .update({
        name: company.name,
        industry: company.industry,
        priority: company.priority,
        status: company.status,
        website: company.website,
        mypage_url: company.mypage_url,
        webtest_url: company.webtest_url,
        webtest_deadline: company.webtest_deadline || null,
        webtest_done: company.webtest_done,
        memo: company.memo,
      })
      .eq("id", company.id);
    setSavingInfo(false);
  }

  async function toggleWebtestDone() {
    if (!company) return;
    const v = !company.webtest_done;
    patchCompany({ webtest_done: v });
    await getSupabase().from("companies").update({ webtest_done: v }).eq("id", company.id);
  }

  // ---- ステップ操作 ----
  function stepsOf(trackId: string) {
    return steps
      .filter((s) => s.track_id === trackId)
      .sort((a, b) => a.order_index - b.order_index);
  }

  async function addStep(trackId: string) {
    const name = (newStep[trackId] ?? "").trim();
    if (!userId || !name) return;
    const mine = stepsOf(trackId);
    const order = mine.length ? Math.max(...mine.map((s) => s.order_index)) + 1 : 0;
    const { data } = await getSupabase()
      .from("steps")
      .insert({
        company_id: id,
        track_id: trackId,
        user_id: userId,
        name,
        order_index: order,
        status: "pending",
      })
      .select()
      .single();
    if (data) setSteps((prev) => [...prev, data as Step]);
    setNewStep((prev) => ({ ...prev, [trackId]: "" }));
  }

  // ---- トラック操作 ----
  async function addTrack(kind: TrackKind) {
    if (!userId) return;
    haptic("commit");
    const supabase = getSupabase();
    const { data } = await supabase
      .from("tracks")
      .insert({ company_id: id, user_id: userId, kind })
      .select()
      .single();
    if (!data) return;
    const track = data as Track;
    setTracks((prev) =>
      [...prev, track].sort(
        (a, b) => TRACK_ORDER.indexOf(a.kind) - TRACK_ORDER.indexOf(b.kind)
      )
    );

    // 空のトラックを渡されても何もできないので、種別に応じた既定フローを入れておく
    await applyTemplate(track.id, kind);
  }

  /** 種別に応じた既定フローをそのトラックに流し込む。ステップが空のトラックの復旧にも使う */
  async function applyTemplate(trackId: string, kind: TrackKind) {
    if (!userId) return;
    const tpl = FLOW_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE[kind]);
    if (!tpl || tpl.steps.length === 0) return;
    const { data: created } = await getSupabase()
      .from("steps")
      .insert(
        tpl.steps.map((name, i) => ({
          company_id: id,
          track_id: trackId,
          user_id: userId,
          name,
          order_index: i,
          status: i === 0 ? "current" : "pending",
        }))
      )
      .select();
    if (created) setSteps((prev) => [...prev, ...(created as Step[])]);
  }

  async function updateTrack(trackId: string, patch: Partial<Track>) {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...patch } : t)));
    await getSupabase().from("tracks").update(patch).eq("id", trackId);
  }

  async function removeTrack(trackId: string) {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (!confirm(`「${TRACK_LABELS[t.kind]}」とその選考ステップを削除しますか？`)) return;
    setTracks((prev) => prev.filter((x) => x.id !== trackId));
    setSteps((prev) => prev.filter((s) => s.track_id !== trackId));
    await getSupabase().from("tracks").delete().eq("id", trackId);
  }

  async function updateStep(stepId: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
    await getSupabase().from("steps").update(patch).eq("id", stepId);
  }

  // 結果待ちステップを「通過」「不通」で即確定する。
  // 不通の場合は企業ステータスも不通過にして、紐づくインターン日程をカレンダーから自動的に消す。
  async function markStepResult(stepId: string, result: "done" | "failed") {
    await updateStep(stepId, { status: result });
    if (result === "failed" && company && company.status !== "rejected") {
      patchCompany({ status: "rejected" });
      await getSupabase()
        .from("companies")
        .update({ status: "rejected" })
        .eq("id", company.id);
    }
  }

  async function deleteStep(stepId: string) {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    await getSupabase().from("steps").delete().eq("id", stepId);
  }

  async function move(stepId: string, dir: -1 | 1) {
    // 並べ替えは同じトラック内で完結させる。企業全体で並べると別の選考のステップと入れ替わる
    const target = steps.find((s) => s.id === stepId);
    if (!target) return;
    const ordered = steps
      .filter((s) => s.track_id === target.track_id)
      .sort((a, b) => a.order_index - b.order_index);
    const idx = ordered.findIndex((s) => s.id === stepId);
    const swap = idx + dir;
    if (swap < 0 || swap >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swap];
    const ao = a.order_index;
    const bo = b.order_index;
    setSteps((prev) =>
      prev.map((s) =>
        s.id === a.id ? { ...s, order_index: bo } : s.id === b.id ? { ...s, order_index: ao } : s
      )
    );
    const supabase = getSupabase();
    await Promise.all([
      supabase.from("steps").update({ order_index: bo }).eq("id", a.id),
      supabase.from("steps").update({ order_index: ao }).eq("id", b.id),
    ]);
  }

  async function removeCompany() {
    if (!company || !confirm("この企業を削除しますか？")) return;
    await getSupabase().from("companies").delete().eq("id", company.id);
    router.push("/companies");
  }

  if (!ready || (configured && loading)) return <Spinner />;

  if (!company) {
    return (
      <div>
        <Button variant="ghost" onClick={() => router.push("/companies")}>
          <ArrowLeft size={16} /> 戻る
        </Button>
        <p className="mt-6 text-slate-500">
          {configured ? "企業が見つかりません。" : "Supabase 未設定のため表示できません。"}
        </p>
      </div>
    );
  }

  const wtDays = daysUntil(company.webtest_deadline);

  return (
    <div>
      <button
        onClick={() => router.push("/companies")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-sky"
      >
        <ArrowLeft size={16} /> 企業一覧へ
      </button>

      <PageHeader
        title={company.name}
        subtitle={company.industry || "業界未設定"}
        action={
          <Button variant="danger" onClick={removeCompany}>
            <Trash2 size={16} /> 削除
          </Button>
        }
      />

      {/* 進捗バー。トラックごとに分けて出す（まとめて1本にすると別の選考が繋がって見える） */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-semibold">選考フロー進捗</p>
        {tracks.length === 0 ? (
          <p className="text-xs text-slate-400">選考が未登録です</p>
        ) : (
          <div className="space-y-4">
            {tracks.map((t) => (
              <div key={t.id}>
                <span
                  className={`mb-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    t.kind === "main" ? "bg-accent text-white" : "bg-accent/10 text-accent"
                  }`}
                >
                  {TRACK_LABELS[t.kind]}
                </span>
                <FlowProgress steps={stepsOf(t.id)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 企業情報 */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">企業情報</h2>
            <Button onClick={saveInfo} disabled={savingInfo}>
              <Save size={15} /> {savingInfo ? "保存中…" : "保存"}
            </Button>
          </div>

          <div className="space-y-4">
            <Field label="企業名">
              <input
                value={company.name}
                onChange={(e) => patchCompany({ name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="業界">
              <input
                value={company.industry ?? ""}
                onChange={(e) => patchCompany({ industry: e.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="志望度">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => patchCompany({ priority: i + 1 })}
                      className="p-0.5"
                      aria-label={`志望度${i + 1}`}
                    >
                      <Star
                        size={22}
                        className={
                          i < company.priority
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-300 dark:text-slate-600"
                        }
                      />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="ステータス">
                <select
                  value={company.status}
                  onChange={(e) => patchCompany({ status: e.target.value as CompanyStatus })}
                  className={inputClass}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* 企業サイトURL（ロゴの取得元） */}
            <Field label="企業サイトURL">
              <div className="flex items-center gap-2">
                <CompanyLogo website={company.website} size={40} />
                <input
                  value={company.website ?? ""}
                  onChange={(e) => patchCompany({ website: e.target.value || null })}
                  className={inputClass}
                  placeholder="example.co.jp"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
              <span className="mt-1 block text-[11px] text-slate-400">
                ここからロゴを取得します
              </span>
            </Field>

            {/* マイページURL */}
            <Field label="マイページURL">
              <div className="flex gap-2">
                <input
                  value={company.mypage_url ?? ""}
                  onChange={(e) => patchCompany({ mypage_url: e.target.value })}
                  className={inputClass}
                  placeholder="https://mypage.example.com"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!normalizeUrl(company.mypage_url)}
                  onClick={() => openUrl(company.mypage_url)}
                  className="shrink-0"
                >
                  <ExternalLink size={15} /> 開く
                </Button>
              </div>
            </Field>

            {/* WebテストURL */}
            <Field label="WebテストURL">
              <div className="flex gap-2">
                <input
                  value={company.webtest_url ?? ""}
                  onChange={(e) => patchCompany({ webtest_url: e.target.value })}
                  className={inputClass}
                  placeholder="https://webtest.example.com"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!normalizeUrl(company.webtest_url)}
                  onClick={() => openUrl(company.webtest_url)}
                  className="shrink-0"
                >
                  <ExternalLink size={15} /> 開く
                </Button>
              </div>
            </Field>

            {/* Webテスト締切 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Webテスト締切">
                <input
                  type="date"
                  value={toDateInput(company.webtest_deadline)}
                  onChange={(e) => patchCompany({ webtest_deadline: e.target.value || null })}
                  className={inputClass}
                />
              </Field>
              <div className="flex flex-col justify-end gap-2">
                {company.webtest_deadline && (
                  <span
                    className={`inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      TONE_CLASSES[deadlineTone(wtDays)]
                    }`}
                  >
                    {countdownLabel(wtDays)}
                  </span>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={company.webtest_done}
                    onChange={toggleWebtestDone}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  Webテスト完了
                </label>
              </div>
            </div>

            {/* メモ */}
            <Field label="自由メモ">
              <textarea
                value={company.memo ?? ""}
                onChange={(e) => patchCompany({ memo: e.target.value })}
                onBlur={saveInfo}
                rows={4}
                className={inputClass}
                placeholder="OB訪問の内容、選考の感触など（フォーカスを外すと自動保存）"
              />
            </Field>
          </div>
        </Card>

        {/* 選考フロー編集（トラックごと） */}
        <Card>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-bold">選考フロー編集</h2>
            {/* まだ無い種別だけ追加できる。同じ種別を二重に持たせない */}
            <div className="flex flex-wrap gap-1.5">
              {TRACK_ORDER.filter((k) => !tracks.some((t) => t.kind === k)).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addTrack(k)}
                  className="flex min-h-[36px] items-center gap-1 rounded-full border border-separator px-3 text-xs font-medium text-slate-600 transition-transform duration-150 active:scale-95 dark:text-slate-300"
                >
                  <Plus size={13} /> {TRACK_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              選考がありません。上のボタンから追加してください。
            </p>
          ) : (
            <div className="space-y-8">
              {tracks.map((track) => {
                const list = stepsOf(track.id);
                return (
                  <section key={track.id}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          track.kind === "main"
                            ? "bg-accent text-white"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {TRACK_LABELS[track.kind]}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTrack(track.id)}
                        aria-label={`${TRACK_LABELS[track.kind]}を削除`}
                        className="ml-auto rounded-lg p-2 text-slate-400 transition-transform duration-150 hover:text-red-500 active:scale-90"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* 何の日付なのかは種別で呼び名が変わるので、ラベルを画面に出す */}
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <Field label="ステータス">
                        <Select
                          ariaLabel={`${TRACK_LABELS[track.kind]}のステータス`}
                          value={track.status}
                          onValueChange={(v: string) =>
                            updateTrack(track.id, { status: v as CompanyStatus })
                          }
                          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({
                            value: k,
                            label: v,
                          }))}
                        />
                      </Field>
                      <Field label={TRACK_START_LABELS[track.kind]}>
                        <input
                          type="date"
                          value={track.start_date ?? ""}
                          onChange={(e) =>
                            updateTrack(track.id, { start_date: e.target.value || null })
                          }
                          className={inputClass}
                        />
                        <span className="mt-1 block text-[11px] text-slate-400">
                          選考が始まる日。インターンの実施日程ではありません
                        </span>
                      </Field>
                    </div>

          <div className="mb-4 flex gap-2">
            <input
              value={newStep[track.id] ?? ""}
              onChange={(e) => setNewStep((prev) => ({ ...prev, [track.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addStep(track.id)}
              className={inputClass}
              placeholder="ステップ名（例: GD, 一次面接）"
            />
            <Button type="button" onClick={() => addStep(track.id)} disabled={!(newStep[track.id] ?? "").trim()} className="shrink-0">
              <Plus size={15} /> 追加
            </Button>
          </div>

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-slate-400">ステップがありません</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  haptic("commit");
                  applyTemplate(track.id, track.kind);
                }}
              >
                <Plus size={15} /> テンプレからフローを作成
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((s, i) => {
                const dDays = daysUntil(s.deadline);
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-separator p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          onClick={() => move(s.id, -1)}
                          disabled={i === 0}
                          className="text-slate-400 hover:text-accent disabled:opacity-30"
                          aria-label="上へ"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={() => move(s.id, 1)}
                          disabled={i === list.length - 1}
                          className="text-slate-400 hover:text-accent disabled:opacity-30"
                          aria-label="下へ"
                        >
                          <ChevronDown size={16} />
                        </button>
                      </div>
                      <input
                        value={s.name}
                        onChange={(e) =>
                          setSteps((prev) =>
                            prev.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x))
                          )
                        }
                        onBlur={(e) => updateStep(s.id, { name: e.target.value })}
                        className={`${inputClass} font-medium`}
                      />
                      <button
                        onClick={() => deleteStep(s.id)}
                        aria-label="削除"
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="block min-w-0 text-xs text-slate-500 dark:text-slate-400">
                        ステータス
                        <select
                          value={s.status}
                          onChange={(e) => updateStep(s.id, { status: e.target.value as StepStatus })}
                          className={`${inputClass} mt-1 ${stepStatusColor[s.status]}`}
                        >
                          {Object.entries(STEP_STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-0 text-xs text-slate-500 dark:text-slate-400">
                        予定日時
                        <input
                          type="datetime-local"
                          value={toDateTimeInput(s.date)}
                          onChange={(e) =>
                            updateStep(s.id, {
                              date: e.target.value ? new Date(e.target.value).toISOString() : null,
                            })
                          }
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <label className="block min-w-0 text-xs text-slate-500 dark:text-slate-400">
                        締切
                        <input
                          type="date"
                          value={toDateInput(s.deadline)}
                          onChange={(e) => updateStep(s.id, { deadline: e.target.value || null })}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <div className="flex min-w-0 items-end">
                        {s.deadline && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              TONE_CLASSES[deadlineTone(dDays)]
                            }`}
                          >
                            {countdownLabel(dDays)}
                          </span>
                        )}
                      </div>
                    </div>

                    {s.status === "waiting" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => markStepResult(s.id, "done")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                        >
                          <Check size={15} /> 通過
                        </button>
                        <button
                          type="button"
                          onClick={() => markStepResult(s.id, "failed")}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                        >
                          <X size={15} /> 不通
                        </button>
                      </div>
                    )}

                    <input
                      value={s.memo ?? ""}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((x) => (x.id === s.id ? { ...x, memo: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => updateStep(s.id, { memo: e.target.value })}
                      className={`${inputClass} mt-2`}
                      placeholder="ステップ別メモ"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {!configured && (
            <p className="mt-4 flex items-center gap-1 text-xs text-amber-600">
              <Link2 size={13} /> Supabase 未設定のため保存されません。
            </p>
          )}
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
