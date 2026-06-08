"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useNotificationStatus } from "@/lib/use-notification-status";

type TextStep = { kind?: "text"; label: string; title: string; body: string };
type NotifyStep = { kind: "notify" };
type Step = TextStep | NotifyStep;

const STEPS: TextStep[] = [
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
  const [enabling, setEnabling] = useState(false);
  const markSeen = trpc.profile.markIntroSeen.useMutation();
  const { status, enable } = useNotificationStatus();

  // Append a notification step only when it's actionable: "off" (can enable
  // here) or "needs-install" (steer to install first). Skip when already on,
  // blocked, unsupported, or still resolving.
  const steps = useMemo<Step[]>(() => {
    if (status === "off" || status === "needs-install") {
      return [...STEPS, { kind: "notify" }];
    }
    return STEPS;
  }, [status]);

  if (!visible) return null;

  const safeStep = Math.min(step, steps.length - 1);
  const isLast = safeStep === steps.length - 1;
  const current = steps[safeStep];

  const finish = () => {
    setVisible(false);
    markSeen.mutate();
  };

  const advance = () => (isLast ? finish() : setStep((s) => s + 1));

  const enableNotifications = async () => {
    setEnabling(true);
    await enable();
    setEnabling(false);
    finish();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-4 px-safe">
      <div
        className="w-full max-w-sm border border-pastel-deep p-6"
        style={{ background: "var(--pastel)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-pastel-ink/70">
            {current.kind === "notify" ? "Notifications" : current.label}
          </span>
          <button
            onClick={finish}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-pastel-ink/70 hover:text-pastel-ink"
          >
            Skip
          </button>
        </div>

        {current.kind === "notify" ? (
          status === "needs-install" ? (
            <>
              <h2 className="mt-4 font-mono text-xl font-semibold text-pastel-ink">
                Turn on notifications
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pastel-ink/80">
                On iPhone, install Coldsoup to your home screen first — then
                notifications can be enabled from settings.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-4 font-mono text-xl font-semibold text-pastel-ink">
                Don&rsquo;t miss replies
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pastel-ink/80">
                Get a ping when someone replies or mentions you — even when the
                app is closed.
              </p>
            </>
          )
        ) : (
          <>
            <h2 className="mt-4 font-mono text-xl font-semibold text-pastel-ink">
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-pastel-ink/80">
              {current.body}
            </p>
          </>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 ${i === safeStep ? "bg-pastel-ink" : "bg-pastel-deep"}`}
              />
            ))}
          </div>
          {current.kind === "notify" && status === "off" ? (
            <div className="flex items-center gap-3">
              <button
                onClick={finish}
                className="font-mono text-xs uppercase tracking-[0.1em] text-pastel-ink/70 hover:text-pastel-ink"
              >
                Maybe later
              </button>
              <button
                onClick={enableNotifications}
                disabled={enabling}
                className="bg-ink px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-surface hover:bg-ink/90 disabled:opacity-40"
              >
                {enabling ? "…" : "Enable"}
              </button>
            </div>
          ) : (
            <button
              onClick={advance}
              className="bg-ink px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] text-surface hover:bg-ink/90"
            >
              {isLast ? "Done" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
