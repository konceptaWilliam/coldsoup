"use client";

import { useState, type ReactNode } from "react";
import type { RpsSummary } from "@/lib/rps";
import { RpsCardView } from "@/components/rps/rps-card";
import { RpsPicker } from "@/components/rps/rps-picker";
import { RpsBattle } from "@/components/rps/rps-battle";
import { OpponentList } from "@/components/rps/rps-create-modal";
import { RpsSheetFrame, RpsWaiting } from "@/components/rps/rps-sheet";
import { PaperHand, RockHand, ScissorsHand } from "@/components/rps/hands";

const ANNA = { id: "a", display_name: "Anna", avatar_url: null };
const BO = { id: "b", display_name: "Bo", avatar_url: null };
const base: RpsSummary = { id: "g", status: "pending", challenger: ANNA, opponent: BO, result: null, role: "spectator" };

const CARDS: { label: string; rps: RpsSummary }[] = [
  { label: "Opponent, pending", rps: { ...base, role: "opponent" } },
  { label: "Challenger / spectator, pending", rps: { ...base, role: "challenger" } },
  { label: "Player, won", rps: { ...base, status: "done", result: "challenger", role: "challenger" } },
  { label: "Player, lost", rps: { ...base, status: "done", result: "challenger", role: "opponent" } },
  { label: "Player, tie", rps: { ...base, status: "done", result: "tie", role: "opponent" } },
  { label: "Spectator, done", rps: { ...base, status: "done", result: "opponent", role: "spectator" } },
];

const MEMBERS = [
  { id: "b", display_name: "Bo" },
  { id: "c", display_name: "Cecilia" },
  { id: "d", display_name: "Dawit" },
];

function Section({ id, show, title, children }: { id: string; show: string; title: string; children: ReactNode }) {
  if (show !== "all" && show !== id) return null;
  return (
    <section className="mb-10">
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] text-neutral-500 mb-1">{children}</p>;
}

export function RpsLab({ section }: { section: string }) {
  const [replay, setReplay] = useState(0);
  return (
    <main className="min-h-screen bg-white p-4 max-w-md mx-auto">
      <Section id="hands" show={section} title="Hands">
        <div className="flex gap-6 justify-center">
          <RockHand size={96} />
          <PaperHand size={96} />
          <ScissorsHand size={96} />
        </div>
      </Section>

      <Section id="cards" show={section} title="Card states">
        <div className="space-y-5">
          {CARDS.map((c) => (
            <div key={c.label}>
              <Label>{c.label}</Label>
              <RpsCardView rps={c.rps} />
            </div>
          ))}
        </div>
      </Section>

      <Section id="create" show={section} title="Create flow">
        <div className="space-y-5">
          <div>
            <Label>1 · Pick opponent</Label>
            <RpsSheetFrame title="Rock, paper, scissors.." onClose={() => {}}>
              <OpponentList members={MEMBERS} onPick={() => {}} />
            </RpsSheetFrame>
          </div>
          <div>
            <Label>2 · Pick move</Label>
            <RpsSheetFrame title="Rock, paper, scissors.." onClose={() => {}}>
              <RpsPicker onPick={() => {}} prompt="Your move against Bo" />
            </RpsSheetFrame>
          </div>
          <div>
            <Label>3 · Waiting</Label>
            <RpsSheetFrame title="Rock, paper, scissors.." onClose={() => {}}>
              <RpsWaiting name="Bo" />
            </RpsSheetFrame>
          </div>
        </div>
      </Section>

      <Section id="battle" show={section} title="Battle">
        <div className="space-y-5">
          {(["shake", "reveal", "result"] as const).map((p) => (
            <div key={p}>
              <Label>Phase: {p}</Label>
              <RpsSheetFrame title="Rock, paper, scissors">
                <RpsBattle
                  left={{ name: "Anna", move: "scissors" }}
                  right={{ name: "Bo", move: "rock" }}
                  banner="Bo wins!"
                  startAt={p}
                  frozen
                />
              </RpsSheetFrame>
            </div>
          ))}
          <div>
            <Label>Live</Label>
            <RpsSheetFrame title="Rock, paper, scissors">
              <RpsBattle
                key={replay}
                left={{ name: "Anna", move: "paper" }}
                right={{ name: "Bo", move: "paper" }}
                banner="Tie!"
              />
              <button className="mt-3 font-mono text-xs underline" onClick={() => setReplay((n) => n + 1)}>
                replay
              </button>
            </RpsSheetFrame>
          </div>
        </div>
      </Section>
    </main>
  );
}
