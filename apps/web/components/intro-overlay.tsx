"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const STEPS: { label: string; title: string; body: string }[] = [
  {
    label: "Welcome",
    title: "coldsoup",
    body: "A team messenger stripped to the essentials. No DMs, no channels, no noise — just the work.",
  },
  {
    label: "Groups & threads",
    title: "Everything is a thread",
    body: "Conversations live in threads, inside of groups. Each topic gets its own thread instead of an endless feed.",
  },
  {
    label: "Status",
    title: "OPEN · URGENT · DONE",
    body: "Every thread carries a visible status, so the whole group sees what needs attention and what's settled — at a glance.",
  },
  {
    label: "Joining groups",
    title: "A friend got you here?",
    body: "Ask them to invite you to their group. Group invites are email-only — there's no public sign-up or join link.",
  },
  {
    label: "Your own group",
    title: "..or start your own",
    body: "Press the + sign in the groups list to create a group, then invite your people by email.",
  },
  {
    label: "Get started",
    title: "Start a thread",
    body: "Use the + button to open a new thread, then set its status as things move. That's it.",
  },
];

export function IntroOverlay({ seen }: { seen: boolean }) {
  // `?intro=1` in the URL force-shows the intro for testing (no new account
  // needed), regardless of the saved seen flag.
  const [visible, setVisible] = useState(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("intro") === "1"
    ) {
      return true;
    }
    return !seen;
  });
  const [step, setStep] = useState(0);
  const markSeen = trpc.profile.markIntroSeen.useMutation();

  if (!visible) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = () => {
    setVisible(false);
    markSeen.mutate();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-4 px-safe">
      <div
        className="w-full max-w-sm border border-pastel-deep p-6"
        style={{ background: "var(--pastel)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-pastel-ink/70">
            {current.label}
          </span>
          <button
            onClick={finish}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-pastel-ink/70 hover:text-pastel-ink"
          >
            Skip
          </button>
        </div>

        <h2 className="mt-4 font-mono text-xl font-semibold text-pastel-ink">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-pastel-ink/80">
          {current.body}
        </p>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 ${i === step ? "bg-pastel-ink" : "bg-pastel-deep"}`}
              />
            ))}
          </div>
          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="bg-ink px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-surface hover:bg-ink/90"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
