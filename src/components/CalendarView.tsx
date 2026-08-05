"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type SlotInfo,
} from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarPlus, Download, Trash2, ExternalLink, Check, X } from "lucide-react";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/useAuth";
import type { Company, Internship, Step, StepStatus } from "@/lib/types";
import { normalizeUrl } from "@/lib/url";
import { downloadICS, type ICSEvent } from "@/lib/ics";
import {
  Button,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
} from "@/components/ui";
import ConfigBanner from "@/components/ConfigBanner";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ja }),
  getDay,
  locales: { ja },
});

type CalType = "step" | "deadline" | "webtest" | "intern";

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  type: CalType;
  status?: StepStatus;
  companyId: string;
  companyName: string;
  stepId?: string;
}

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar);

const typeColor: Record<CalType, string> = {
  step: "#1a2980",
  deadline: "#ef4444",
  webtest: "#f59e0b",
  intern: "#14b8a6",
};
const statusColor: Partial<Record<StepStatus, string>> = {
  done: "#10b981",
  current: "#f97316",
  waiting: "#8b5cf6",
  failed: "#ef4444",
};

const messages = {
  date: "日付",
  time: "時間",
  event: "予定",
  allDay: "終日",
  week: "週",
  work_week: "稼働週",
  day: "日",
  month: "月",
  previous: "前へ",
  next: "次へ",
  yesterday: "昨日",
  tomorrow: "明日",
  today: "今日",
  agenda: "予定リスト",
  noEventsInRange: "この期間に予定はありません",
  showMore: (n: number) => `他 ${n} 件`,
};

export default function CalendarView() {
  const { ready, configured, userId } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());

  // 追加モーダル
  const [addOpen, setAddOpen] = useState(false);
  const [addCompany, setAddCompany] = useState("");
  const [addName, setAddName] = useState("");
  const [addWhen, setAddWhen] = useState("");

  // 編集モーダル
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editMemo, setEditMemo] = useState("");

  const load = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const [c, s, it] = await Promise.all([
      supabase.from("companies").select("*"),
      supabase.from("steps").select("*"),
      supabase.from("internships").select("*"),
    ]);
    setCompanies((c.data as Company[]) ?? []);
    setSteps((s.data as Step[]) ?? []);
    setInternships((it.data as Internship[]) ?? []);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    // データ取得（外部システム＝Supabase との同期）。fetch 後の setState は本ルールの対象外運用とする。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) load();
  }, [ready, load]);

  const companyName = useCallback(
    (id: string) => companies.find((c) => c.id === id)?.name ?? "不明な企業",
    [companies]
  );

  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = [];
    for (const s of steps) {
      if (s.date) {
        const start = new Date(s.date);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        list.push({
          id: `step-${s.id}`,
          title: `${companyName(s.company_id)}：${s.name}`,
          start,
          end,
          type: "step",
          status: s.status,
          companyId: s.company_id,
          companyName: companyName(s.company_id),
          stepId: s.id,
        });
      }
      if (s.deadline) {
        const start = new Date(`${s.deadline}T00:00:00`);
        list.push({
          id: `dl-${s.id}`,
          title: `〆 ${companyName(s.company_id)}：${s.name}`,
          start,
          end: start,
          allDay: true,
          type: "deadline",
          companyId: s.company_id,
          companyName: companyName(s.company_id),
        });
      }
    }
    for (const c of companies) {
      if (c.webtest_deadline) {
        const start = new Date(`${c.webtest_deadline}T00:00:00`);
        list.push({
          id: `wt-${c.id}`,
          title: `Webテスト〆 ${c.name}`,
          start,
          end: start,
          allDay: true,
          type: "webtest",
          companyId: c.id,
          companyName: c.name,
        });
      }
    }
    // インターン日程。不通過（rejected）の企業に紐づくものはカレンダーから自動的に消す。
    const rejectedCompanyIds = new Set(
      companies.filter((c) => c.status === "rejected").map((c) => c.id)
    );
    for (const it of internships) {
      if (!it.start_date) continue;
      if (it.company_id && rejectedCompanyIds.has(it.company_id)) continue;
      const start = new Date(`${it.start_date}T00:00:00`);
      // 終日イベントの end は排他的なので、終了日（無ければ開始日）の翌日0時にする
      const endBase = new Date(`${it.end_date ?? it.start_date}T00:00:00`);
      const end = new Date(endBase.getTime() + 24 * 60 * 60 * 1000);
      list.push({
        id: `intern-${it.id}`,
        title: `🎓 ${it.company_name}：インターン`,
        start,
        end,
        allDay: true,
        type: "intern",
        companyId: it.company_id ?? "",
        companyName: it.company_name,
      });
    }
    return list;
  }, [steps, companies, internships, companyName]);

  const eventStyle = useCallback((event: CalEvent) => {
    const bg =
      event.type === "step" && event.status && statusColor[event.status]
        ? statusColor[event.status]!
        : typeColor[event.type];
    return {
      style: {
        backgroundColor: bg,
        borderRadius: "6px",
        color: "#fff",
        fontSize: "12px",
        padding: "1px 4px",
      },
    };
  }, []);

  function toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }

  function onSelectSlot(slot: SlotInfo) {
    setAddCompany(companies[0]?.id ?? "");
    setAddName("");
    setAddWhen(toLocalInput(new Date(slot.start)));
    setAddOpen(true);
  }

  async function createSlotStep(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !addCompany || !addName.trim() || !addWhen) return;
    const companySteps = steps.filter((s) => s.company_id === addCompany);
    const order = companySteps.length
      ? Math.max(...companySteps.map((s) => s.order_index)) + 1
      : 0;
    const { data } = await getSupabase()
      .from("steps")
      .insert({
        company_id: addCompany,
        user_id: userId,
        name: addName.trim(),
        order_index: order,
        status: "pending",
        date: new Date(addWhen).toISOString(),
      })
      .select()
      .single();
    if (data) setSteps((prev) => [...prev, data as Step]);
    setAddOpen(false);
  }

  async function onEventDrop({ event, start }: EventInteractionArgs<CalEvent>) {
    if (event.type !== "step" || !event.stepId) return;
    const newDate = new Date(start as Date);
    setSteps((prev) =>
      prev.map((s) => (s.id === event.stepId ? { ...s, date: newDate.toISOString() } : s))
    );
    await getSupabase()
      .from("steps")
      .update({ date: newDate.toISOString() })
      .eq("id", event.stepId);
  }

  function onSelectEvent(event: CalEvent) {
    setEditEvent(event);
    setEditWhen(event.type === "step" ? toLocalInput(event.start) : "");
    const st = steps.find((s) => s.id === event.stepId);
    setEditMemo(st?.memo ?? "");
  }

  async function saveEdit() {
    if (!editEvent?.stepId) return;
    await getSupabase()
      .from("steps")
      .update({
        date: editWhen ? new Date(editWhen).toISOString() : null,
        memo: editMemo,
      })
      .eq("id", editEvent.stepId);
    setSteps((prev) =>
      prev.map((s) =>
        s.id === editEvent.stepId
          ? { ...s, date: editWhen ? new Date(editWhen).toISOString() : null, memo: editMemo }
          : s
      )
    );
    setEditEvent(null);
    load();
  }

  // 結果待ちステップをカレンダー上で即「通過」「不通」に。不通なら企業を不通過にしてインターン日程を消す。
  async function markResult(result: "done" | "failed") {
    if (!editEvent?.stepId) return;
    const supabase = getSupabase();
    await supabase.from("steps").update({ status: result }).eq("id", editEvent.stepId);
    setSteps((prev) =>
      prev.map((s) => (s.id === editEvent.stepId ? { ...s, status: result } : s))
    );
    if (result === "failed") {
      const cid = editEvent.companyId;
      const c = companies.find((x) => x.id === cid);
      if (c && c.status !== "rejected") {
        setCompanies((prev) =>
          prev.map((x) => (x.id === cid ? { ...x, status: "rejected" } : x))
        );
        await supabase.from("companies").update({ status: "rejected" }).eq("id", cid);
      }
    }
    setEditEvent(null);
  }

  async function deleteEditEvent() {
    if (!editEvent?.stepId || !confirm("この予定（ステップ）を削除しますか？")) return;
    await getSupabase().from("steps").delete().eq("id", editEvent.stepId);
    setSteps((prev) => prev.filter((s) => s.id !== editEvent.stepId));
    setEditEvent(null);
  }

  function exportICS() {
    const icsEvents: ICSEvent[] = events.map((e) => ({
      title: e.title,
      start: e.start,
      end: e.end > e.start ? e.end : new Date(e.start.getTime() + 60 * 60 * 1000),
      desc: e.companyName,
    }));
    downloadICS(icsEvents, "katsudoulog-calendar.ics");
  }

  if (!ready || (configured && loading)) return <Spinner />;

  const editCompany = editEvent ? companies.find((c) => c.id === editEvent.companyId) : null;

  return (
    <div>
      <PageHeader
        title="カレンダー"
        subtitle="面接・締切・Webテストをまとめて表示。空き枠クリックで追加、ドラッグで日程変更。"
        action={
          <Button variant="outline" onClick={exportICS}>
            <Download size={15} /> Googleカレンダーに追加(.ics)
          </Button>
        }
      />

      {!configured && <ConfigBanner />}

      <div className="surface mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#1a2980" }} /> 面接・予定
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#f97316" }} /> 進行中
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#8b5cf6" }} /> 結果待ち
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#10b981" }} /> 通過済
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#ef4444" }} /> 締切
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#f59e0b" }} /> Webテスト〆
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ background: "#14b8a6" }} /> インターン
        </span>
      </div>

      <div className="surface p-2 md:p-4" style={{ height: "72vh" }}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          onView={(v) => setView(v)}
          date={date}
          onNavigate={(d) => setDate(d)}
          views={["month", "week", "day", "agenda"]}
          messages={messages}
          culture="ja"
          popup
          selectable
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          onEventDrop={onEventDrop}
          onEventResize={onEventDrop}
          resizable
          draggableAccessor={(e) => e.type === "step"}
          eventPropGetter={eventStyle}
          style={{ height: "100%" }}
        />
      </div>

      {/* 追加モーダル */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="予定を追加">
        {companies.length === 0 ? (
          <p className="text-sm text-slate-500">先に企業を登録してください。</p>
        ) : (
          <form onSubmit={createSlotStep} className="space-y-4">
            <Field label="企業">
              <select
                value={addCompany}
                onChange={(e) => setAddCompany(e.target.value)}
                className={inputClass}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ステップ名">
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={inputClass}
                placeholder="一次面接 など"
                required
              />
            </Field>
            <Field label="日時">
              <input
                type="datetime-local"
                value={addWhen}
                onChange={(e) => setAddWhen(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit">
                <CalendarPlus size={15} /> 追加
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 編集モーダル */}
      <Modal open={!!editEvent} onClose={() => setEditEvent(null)} title="予定の詳細">
        {editEvent && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-700/50">
              <div className="font-semibold">{editEvent.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {editEvent.companyName}
              </div>
            </div>

            {editEvent.type === "step" ? (
              <>
                {editEvent.status === "waiting" && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      結果待ち — 選考結果を記録
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => markResult("done")}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                      >
                        <Check size={15} /> 通過
                      </button>
                      <button
                        type="button"
                        onClick={() => markResult("failed")}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                      >
                        <X size={15} /> 不通
                      </button>
                    </div>
                  </div>
                )}
                <Field label="日時">
                  <input
                    type="datetime-local"
                    value={editWhen}
                    onChange={(e) => setEditWhen(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="メモ">
                  <textarea
                    value={editMemo}
                    onChange={(e) => setEditMemo(e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                </Field>
                <div className="flex justify-between pt-2">
                  <Button variant="danger" onClick={deleteEditEvent}>
                    <Trash2 size={15} /> 削除
                  </Button>
                  <Button onClick={saveEdit}>保存</Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {editEvent.type === "intern"
                    ? "これはインターンの日程です。編集・削除はインターンページから行えます。"
                    : "これは締切の予定です。日程の変更は企業詳細ページから行えます。"}
                </p>
                {editCompany &&
                  editEvent.type === "webtest" &&
                  normalizeUrl(editCompany.webtest_url) && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        window.open(
                          normalizeUrl(editCompany.webtest_url)!,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      <ExternalLink size={15} /> Webテストを開く
                    </Button>
                  )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
