"use client";

import { useState } from "react";
import {
  DEFAULT_BLOB,
  EVOLUTION,
  SHAPES,
  formLook,
  type BlobState,
  type Form,
} from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { BlobForm } from "@/components/blob-form";
import { EvolveModal, evolveSpec, rerollSpec, type RevealSpec } from "@/components/evolve-modal";

// Drives the real components with local state; touches no data.
export function BlobLab() {
  const [seed, setSeed] = useState("11111111-2222-3333-4444-555555555555");
  const [state, setState] = useState<BlobState>({ ...DEFAULT_BLOB, level: 3 });
  const [spec, setSpec] = useState<RevealSpec | null>(null);
  const base = baseShapeOf(seed);
  const toggle = (k: "shiny2" | "shiny3") => setState((s) => ({ ...s, [k]: !s[k] }));

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="font-mono text-lg font-semibold text-ink">Blob lab</h1>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          className="flex-1 min-w-0 border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
          aria-label="Seed (user id)"
        />
        <span className="font-mono text-xs text-muted">
          base {base} → {EVOLUTION[base].join(" → ")}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 font-mono text-xs">
        <button className="border border-border px-3 py-1.5" onClick={() => toggle("shiny2")}>
          shiny2: {String(state.shiny2)}
        </button>
        <button className="border border-border px-3 py-1.5" onClick={() => toggle("shiny3")}>
          shiny3: {String(state.shiny3)}
        </button>
        {([1, 2, 3] as Form[]).map((f) => (
          <button key={f} className="border border-border px-3 py-1.5" onClick={() => setState((s) => ({ ...s, form: f }))}>
            wear Lv{f}
          </button>
        ))}
      </div>

      <section className="flex gap-8 items-end">
        {([1, 2, 3] as Form[]).map((f) => (
          <div key={f} className="flex flex-col items-center gap-2 font-mono text-xs text-muted">
            <BlobForm name={seed} look={formLook(base, f, state)} size={120} animate="always" />
            Lv{f}
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 font-mono text-xs">
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(evolveSpec(seed, { ...state, form: 1 }, 2, false))}>Lv2</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(evolveSpec(seed, { ...state, form: 1 }, 2, true))}>Lv2 shiny</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(evolveSpec(seed, { ...state, form: 2, shiny2: false }, 3, false))}>Lv3</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(evolveSpec(seed, { ...state, form: 2, shiny2: false }, 3, true))}>Lv3 shiny</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(evolveSpec(seed, { ...state, form: 2, shiny2: true }, 3, true))}>Lv3 inherited</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(rerollSpec(seed, EVOLUTION[base][1], "triangle" === EVOLUTION[base][1] ? "sun" : "triangle", false))}>Reroll miss</button>
        <button className="bg-ink text-surface px-3 py-1.5" onClick={() => setSpec(rerollSpec(seed, EVOLUTION[base][1], "triangle" === EVOLUTION[base][1] ? "sun" : "triangle", true))}>Reroll hit</button>
      </section>

      <section className="grid grid-cols-5 gap-4">
        {SHAPES.map((s) => (
          <div key={s} className="flex flex-col items-center gap-1 font-mono text-[10px] text-muted">
            <div className="flex gap-1">
              <BlobForm name={seed} look={{ shape: s, finish: "plain" }} size={40} />
              <BlobForm name={seed} look={{ shape: s, finish: "holo" }} size={40} />
              <BlobForm name={seed} look={{ shape: s, finish: "shiny" }} size={40} />
            </div>
            {s}
          </div>
        ))}
      </section>

      {spec && <EvolveModal spec={spec} onPrimary={() => setSpec(null)} onSecondary={() => setSpec(null)} />}
    </main>
  );
}
