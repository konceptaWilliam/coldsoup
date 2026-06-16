"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc/router";

// S-meter keeps its own neo-brutalist skin (yellow / hard black borders /
// offset shadows) — a deliberate "app-in-app" ported from rehearsal-pain-planner.

type SMeterMode = "weekly" | "dates" | "statements";

export type SMeterSummary = {
  id: string;
  mode: SMeterMode;
  title: string | null;
  customDates: string[] | null;
  customLabels: string[] | null;
  votedCount: number;
  memberCount: number;
  allVoted: boolean;
  isParticipant: boolean;
};

type GetData = inferRouterOutputs<AppRouter>["smeters"]["get"];

const FACE_COLORS = ["#22C55E", "#86EFAC", "#FBBF24", "#FB923C", "#EF4444", "#991B1B"];
const PAIN_LABELS = [
  "It works perfectly",
  "It works well",
  "It's okay",
  "It's a bit tough",
  "It's pretty tough",
  "I absolutely can't",
];
const MOOD: Record<string, string> = {
  perfect: "Works for everyone!",
  great: "Works for most",
  okay: "Split — needs compromise",
  tough: "Hard for several",
  blocked: "Blocked — someone can't",
  bad: "Bad day",
};
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FACE_PX: Record<"sm" | "md" | "lg", number> = { sm: 34, md: 50, lg: 64 };

function clampScore(v: number) {
  return Math.max(1, Math.min(6, Math.round(v)));
}
function formatCustomDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en", { day: "numeric", month: "short" });
}
// Card labels: statements carry free text, dates format to "5 Jun", weekly
// falls back to weekday names. customLabels takes precedence when present.
function dayLabel(idx: number, customDates: string[] | null, customLabels?: string[] | null) {
  if (customLabels && customLabels[idx]) return customLabels[idx];
  if (customDates && customDates[idx]) return formatCustomDate(customDates[idx]);
  return DAY_NAMES[idx] ?? `Day ${idx + 1}`;
}
function dayShort(idx: number, customDates: string[] | null, customLabels?: string[] | null) {
  if (customLabels && customLabels[idx]) return customLabels[idx];
  if (customDates && customDates[idx]) return formatCustomDate(customDates[idx]);
  return DAY_SHORT[idx] ?? `D${idx + 1}`;
}

function PainFace({
  value,
  size = "md",
  selected = false,
  onClick,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  onClick?: () => void;
}) {
  const idx = Math.max(0, Math.min(5, value - 1));
  const px = FACE_PX[size];
  return (
    <div
      onClick={onClick}
      className={onClick ? "cursor-pointer select-none" : ""}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        border: selected ? "3px solid black" : "2px solid black",
        boxShadow: selected ? "3px 3px 0 black" : "2px 2px 0 black",
        transform: selected ? "scale(1.1)" : "scale(1)",
        transition: "transform 0.12s ease",
        overflow: "hidden",
        background: FACE_COLORS[idx],
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/smeter-${value}.png`} alt={PAIN_LABELS[idx]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

// ── Inline card (sibling of PollView) ───────────────────────────────────────
export function SMeterCard({ smeter, threadId }: { smeter: SMeterSummary; threadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-1 block w-full sm:max-w-[360px] text-left border-2 border-black bg-white shadow-[4px_4px_0_black] p-3 hover:shadow-[2px_2px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] font-extrabold tracking-[0.15em] text-black">S-METER</span>
          <span className="border-2 border-black bg-yellow-300 px-1.5 py-px font-mono text-[9px] font-extrabold tracking-wider text-black">
            {smeter.mode === "dates" ? "DATES" : smeter.mode === "statements" ? "STATEMENTS" : "WEEKLY"}
          </span>
        </div>
        <p className="font-mono text-[15px] font-extrabold text-black mb-2">{smeter.title || "Find a day"}</p>
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4, 5, 6].map((v) => <PainFace key={v} value={v} size="sm" />)}
        </div>
        <p className="font-mono text-[11px] font-bold text-neutral-600 mb-1">
          {smeter.votedCount} of {smeter.memberCount} voted
        </p>
        <div className="flex gap-[3px] mb-2">
          {Array.from({ length: Math.max(1, smeter.memberCount) }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2.5 border-2 border-black"
              style={{ background: i < smeter.votedCount ? "#FDE047" : "#fff" }}
            />
          ))}
        </div>
        <div
          className="border-2 border-black py-1.5 text-center font-mono text-[13px] font-extrabold text-black"
          style={{ background: smeter.allVoted ? "#4ADE80" : smeter.isParticipant ? "#FDE047" : "#E5E5E5" }}
        >
          {smeter.allVoted ? "View results →" : smeter.isParticipant ? "Tap to vote →" : "Can't vote"}
        </div>
      </button>
      {open && <SMeterModal smeterId={smeter.id} threadId={threadId} onClose={() => setOpen(false)} />}
    </>
  );
}

// Inline "click for results →" link used by the S-meter-done system message.
export function SMeterResultsLink({ smeterId, threadId }: { smeterId: string; threadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="underline font-semibold text-ink hover:opacity-70">
        Click for results →
      </button>
      {open && <SMeterModal smeterId={smeterId} threadId={threadId} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Full overlay: vote → wait → stats ───────────────────────────────────────
function SMeterModal({ smeterId, threadId, onClose }: { smeterId: string; threadId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.smeters.get.useQuery({ smeterId });
  const submit = trpc.smeters.submit.useMutation({
    onSuccess: () => {
      utils.smeters.get.invalidate({ smeterId });
      utils.messages.list.invalidate({ threadId });
    },
  });

  // Live updates as other members vote.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`smeter:${smeterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "smeter_responses", filter: `smeter_id=eq.${smeterId}` },
        () => utils.smeters.get.invalidate({ smeterId }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [smeterId, utils]);

  // Swipe-down-to-dismiss for the mobile/PWA bottom sheet. Only engages when the
  // content is scrolled to the top and the drag is downward, so it doesn't fight
  // the scroll. Desktop (centered dialog) is excluded.
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; scroll: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) return;
    dragStart.current = { y: e.touches[0].clientY, scroll: sheetRef.current?.scrollTop ?? 0 };
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = dragStart.current;
    if (!s) return;
    const dy = e.touches[0].clientY - s.y;
    if (s.scroll <= 0 && dy > 0) {
      setDragging(true);
      setDragY(dy);
    }
  }
  function onTouchEnd() {
    if (dragStart.current && dragY > 110) onClose();
    else setDragY(0);
    setDragging(false);
    dragStart.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging ? "none" : "transform 0.2s ease" }}
        className="bg-[#F5F5F5] w-full sm:max-w-lg max-h-[92vh] overflow-y-auto border-2 border-black"
      >
        {/* Drag handle (bottom-sheet affordance, mobile only) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-[#F5F5F5]">
          <div className="w-10 h-1 bg-black/30 rounded-full" />
        </div>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b-2 border-black bg-[#F5F5F5]">
          <span className="font-mono text-[18px] font-extrabold text-black truncate">{data?.title || "S-meter"}</span>
          <button onClick={onClose} className="font-mono text-2xl leading-none text-black hover:opacity-60 w-9 h-9 flex items-center justify-center">
            ×
          </button>
        </div>

        <div className="p-4">
          {isLoading || !data ? (
            <p className="font-mono text-sm text-neutral-600 py-12 text-center">Loading…</p>
          ) : data.stats ? (
            <StatsView data={data} stats={data.stats} />
          ) : data.myResponses || !data.isParticipant ? (
            <WaitingView data={data} />
          ) : (
            <VotingView
              data={data}
              isPending={submit.isPending}
              onSubmit={(responses) => submit.mutate({ smeterId, responses })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Voting ──────────────────────────────────────────────────────────────────
function VotingView({
  data,
  isPending,
  onSubmit,
}: {
  data: GetData;
  isPending: boolean;
  onSubmit: (r: { dayIndex: number; painScore: number }[]) => void;
}) {
  const total =
    data.mode === "dates" && data.customDates
      ? data.customDates.length
      : data.mode === "statements" && data.customLabels
        ? data.customLabels.length
        : 7;
  const [day, setDay] = useState(0);
  const [scores, setScores] = useState<Record<number, number>>({});
  const current = scores[day] ?? null;
  const isLast = day === total - 1;
  const allScored = Object.keys(scores).length === total;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[12px] font-bold uppercase tracking-wide text-black mb-1.5">
          Day {day + 1} of {total}
        </p>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="flex-1 h-3 border-2 border-black" style={{ background: i <= day ? "#FDE047" : "#fff" }} />
          ))}
        </div>
      </div>

      <div className="border-2 border-black bg-white shadow-[4px_4px_0_black] p-4">
        <h3 className="font-mono text-base font-extrabold text-black text-center mb-4">
          How does {dayLabel(day, data.customDates, data.customLabels)} work for you?
        </h3>
        <div className="grid grid-cols-3 gap-3 justify-items-center">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <PainFace value={s} size="lg" selected={current === s} onClick={() => setScores((p) => ({ ...p, [day]: s }))} />
              <span className="font-mono text-[11px] font-bold text-black">{s}</span>
            </div>
          ))}
        </div>
        {current && (
          <div className="mt-4 border-2 border-black bg-yellow-100 p-3 flex items-center gap-3">
            <PainFace value={current} size="md" selected />
            <p className="font-mono text-[13px] font-bold text-black">{PAIN_LABELS[current - 1]}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2.5">
        {day > 0 && (
          <button
            onClick={() => setDay((d) => d - 1)}
            className="flex-1 border-2 border-black bg-white shadow-[4px_4px_0_black] py-3 font-mono font-extrabold text-black hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
          >
            ← Back
          </button>
        )}
        {isLast ? (
          <button
            onClick={() => allScored && !isPending && onSubmit(Object.entries(scores).map(([d, s]) => ({ dayIndex: Number(d), painScore: s })))}
            disabled={!allScored || isPending}
            className="flex-[2] border-2 border-black bg-yellow-300 shadow-[4px_4px_0_black] py-3 font-mono font-extrabold text-black hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-40"
          >
            {isPending ? "Submitting…" : "Submit"}
          </button>
        ) : (
          <button
            onClick={() => current && setDay((d) => d + 1)}
            disabled={!current}
            className="flex-[2] border-2 border-black bg-yellow-300 shadow-[4px_4px_0_black] py-3 font-mono font-extrabold text-black hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-40"
          >
            Next day →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Waiting ───────────────────────────────────────────────────────────────
function WaitingView({ data }: { data: GetData }) {
  return (
    <div className="space-y-4">
      <div className="border-2 border-black bg-white shadow-[4px_4px_0_black] p-4">
        <h3 className="font-mono text-lg font-extrabold text-black mb-1">Waiting for everyone ⏳</h3>
        <p className="font-mono text-[13px] font-bold text-neutral-600 mb-3">
          {data.votedCount} of {data.memberCount} voted
        </p>
        <div className="space-y-2">
          {data.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-2 border-black px-2.5 py-2 bg-white">
              <span className="font-mono text-[13px] font-bold text-black truncate">{m.display_name}</span>
              <span
                className="border-2 border-black px-1.5 py-px font-mono text-[10px] font-extrabold text-black"
                style={{ background: m.hasVoted ? "#4ADE80" : "#FCA5A5" }}
              >
                {m.hasVoted ? "DONE" : "WAITING"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-1.5">
        {[1, 3, 5].map((v) => <PainFace key={v} value={v} size="sm" />)}
      </div>
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────
function StatsView({ data, stats }: { data: GetData; stats: NonNullable<GetData["stats"]> }) {
  const [selected, setSelected] = useState(stats.bestDay);
  const cd = data.customDates;
  const cl = data.customLabels;
  const best = stats.days[stats.bestDay];
  const worst = stats.days[stats.worstDay];
  const sel = stats.days[selected];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="border-2 border-black bg-green-400 shadow-[4px_4px_0_black] p-3">
          <p className="font-mono text-[10px] font-extrabold uppercase tracking-wide text-black mb-1">Best day</p>
          <p className="font-mono text-[14px] font-extrabold text-black">{dayLabel(best.dayIndex, cd, cl)}</p>
          <div className="flex items-center gap-2 mt-2">
            <PainFace value={clampScore(best.avg)} size="md" />
            <span className="font-mono text-xl font-extrabold text-black">{best.avg.toFixed(1)}</span>
          </div>
        </div>
        <div className="border-2 border-black bg-red-300 shadow-[4px_4px_0_black] p-3">
          <p className="font-mono text-[10px] font-extrabold uppercase tracking-wide text-black mb-1">Worst day</p>
          <p className="font-mono text-[14px] font-extrabold text-black">{dayLabel(worst.dayIndex, cd, cl)}</p>
          <div className="flex items-center gap-2 mt-2">
            <PainFace value={clampScore(worst.avg)} size="md" />
            <span className="font-mono text-xl font-extrabold text-black">{worst.avg.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <p className="font-mono text-sm font-extrabold uppercase tracking-wide text-black">Overview</p>
      <div className="flex flex-wrap gap-1.5">
        {stats.days.map((d, idx) => {
          const active = idx === selected;
          return (
            <button
              key={d.dayIndex}
              onClick={() => setSelected(idx)}
              className="border-2 border-black p-1 flex flex-col items-center gap-0.5 transition-all"
              style={{
                width: stats.days.length <= 7 ? "13%" : "18%",
                minWidth: 44,
                background: active ? "#FDE047" : "#fff",
                boxShadow: active ? "none" : "2px 2px 0 black",
                transform: active ? "translate(2px,2px)" : "none",
              }}
            >
              <span className="font-mono text-[9px] font-extrabold text-black truncate w-full text-center">
                {dayShort(d.dayIndex, cd, cl).slice(0, 6)}
              </span>
              <PainFace value={clampScore(d.avg)} size="sm" />
              <span className="font-mono text-[9px] font-bold text-black">{d.avg.toFixed(1)}</span>
            </button>
          );
        })}
      </div>

      {sel && <DayDetail day={sel} title={dayLabel(sel.dayIndex, cd, cl)} />}
    </div>
  );
}

function DayDetail({ day, title }: { day: NonNullable<GetData["stats"]>["days"][number]; title: string }) {
  const counts = [1, 2, 3, 4, 5, 6].map((s) => day.scores.filter((x) => x === s).length);
  const maxCount = Math.max(1, ...counts);
  return (
    <div className="border-2 border-black bg-white shadow-[4px_4px_0_black] p-4 space-y-4">
      <h3 className="font-mono text-base font-extrabold text-black">{title}</h3>
      <div className="flex items-center gap-4">
        <PainFace value={clampScore(day.avg)} size="lg" />
        <div>
          <p className="font-mono text-3xl font-extrabold text-black">{day.avg.toFixed(1)}</p>
          <p className="font-mono text-[12px] font-bold text-neutral-600">{MOOD[day.classification]}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {counts.map((count, i) => (
          <div key={i} className="flex items-center gap-2">
            <PainFace value={i + 1} size="sm" />
            <div className="flex-1 h-[18px] border-2 border-black bg-white">
              <div className="h-full" style={{ width: `${(count / maxCount) * 100}%`, background: FACE_COLORS[i] }} />
            </div>
            <span className="font-mono text-[12px] font-bold text-black w-5 text-right">{count}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {day.memberScores.map((ms) => (
          <div key={ms.userId} className="flex items-center justify-between border border-black px-2 py-1.5">
            <span className="font-mono text-[13px] font-bold text-black truncate">{ms.displayName}</span>
            <PainFace value={ms.score} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create modal ────────────────────────────────────────────────────────────
export function SMeterCreateModal({
  members,
  onSubmit,
  onClose,
  isPending,
}: {
  members: { id: string; display_name: string }[];
  onSubmit: (
    mode: SMeterMode,
    customDates: string[] | undefined,
    customLabels: string[] | undefined,
    title: string | undefined,
    participantIds: string[] | undefined,
  ) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<SMeterMode>("weekly");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  // Everyone included by default; clicking a block toggles them out/in.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const included = members.filter((m) => !excluded.has(m.id));
  const canSubmit =
    !isPending &&
    (mode === "weekly" ||
      (mode === "dates" && dates.length >= 1) ||
      (mode === "statements" && labels.length >= 1)) &&
    included.length >= 1;

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addDate() {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates((prev) => [...prev, dateInput].sort());
    setDateInput("");
  }

  function addLabel() {
    const v = labelInput.trim();
    if (!v || labels.includes(v) || labels.length >= 60) return;
    setLabels((prev) => [...prev, v]);
    setLabelInput("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#F5F5F5] border-2 border-black w-full max-w-[calc(100vw-16px)] sm:max-w-md mx-2 sm:mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-mono text-base font-extrabold text-black mb-4">Create S-meter</h2>

        <div className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["weekly", "dates", "statements"] as SMeterMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="border-2 border-black py-3 font-mono text-[11px] font-extrabold text-black transition-all"
                  style={
                    mode === m
                      ? { background: "#FDE047", transform: "translate(2px,2px)" }
                      : { background: "#fff", boxShadow: "2px 2px 0 black" }
                  }
                >
                  {m === "weekly" ? "Weekly" : m === "dates" ? "Dates" : "Statements"}
                </button>
              ))}
            </div>
          </div>

          {mode === "dates" && (
            <div>
              <label className="block font-mono text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Pick dates</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="flex-1 border-2 border-black bg-white px-3 py-2 font-mono text-[13px] text-black focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addDate}
                  disabled={!dateInput || dates.includes(dateInput)}
                  className="border-2 border-black bg-white shadow-[2px_2px_0_black] px-3 font-mono text-[12px] font-bold text-black hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
              {dates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {dates.map((d) => (
                    <span key={d} className="border-2 border-black bg-white px-2 py-1 font-mono text-[12px] font-bold text-black flex items-center gap-1">
                      {formatCustomDate(d)}
                      <button type="button" onClick={() => setDates((prev) => prev.filter((x) => x !== d))} className="font-extrabold">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "statements" && (
            <div>
              <label className="block font-mono text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Add statements</label>
              <div className="flex gap-2">
                <input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  maxLength={200}
                  placeholder="e.g. Pizza on Friday"
                  className="flex-1 border-2 border-black bg-white px-3 py-2 text-base md:text-[13px] text-black placeholder:text-neutral-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addLabel}
                  disabled={!labelInput.trim() || labels.includes(labelInput.trim()) || labels.length >= 60}
                  className="border-2 border-black bg-white shadow-[2px_2px_0_black] px-3 font-mono text-[12px] font-bold text-black hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {labels.map((l) => (
                    <span key={l} className="border-2 border-black bg-white px-2 py-1 font-mono text-[12px] font-bold text-black flex items-center gap-1 max-w-full">
                      <span className="truncate">{l}</span>
                      <button type="button" onClick={() => setLabels((prev) => prev.filter((x) => x !== l))} className="font-extrabold flex-shrink-0">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block font-mono text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Rehearsal day"
              className="w-full border-2 border-black bg-white px-3 py-2 text-base md:text-sm text-black placeholder:text-neutral-500 focus:outline-none"
            />
          </div>

          {members.length > 0 && (
            <div>
              <label className="block font-mono text-[10px] font-bold text-neutral-600 uppercase tracking-wider mb-1.5">
                Participants <span className="normal-case text-neutral-400">({included.length} of {members.length})</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const isIn = !excluded.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      title={isIn ? "Click to remove" : "Click to add back"}
                      className="border-2 border-black px-2 py-1 font-mono text-[12px] font-bold flex items-center gap-1.5 transition-all"
                      style={
                        isIn
                          ? { background: "#fff", color: "#000", boxShadow: "2px 2px 0 black" }
                          : { background: "#E5E5E5", color: "#9A9A9A", textDecoration: "line-through" }
                      }
                    >
                      {m.display_name}
                      <span className="font-extrabold">{isIn ? "×" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="font-mono text-sm text-neutral-600 hover:text-black px-4 py-2">Cancel</button>
            <button
              onClick={() =>
                canSubmit &&
                onSubmit(
                  mode,
                  mode === "dates" ? dates : undefined,
                  mode === "statements" ? labels : undefined,
                  title.trim() || undefined,
                  included.length === members.length ? undefined : included.map((m) => m.id),
                )
              }
              disabled={!canSubmit}
              className="border-2 border-black bg-yellow-300 shadow-[4px_4px_0_black] px-5 py-2 font-mono text-sm font-extrabold text-black hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-40"
            >
              {isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
