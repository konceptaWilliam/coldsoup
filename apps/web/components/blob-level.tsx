"use client";

import { formLook, type Form } from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { useBlob } from "@/lib/use-blob";
import { BlobForm } from "@/components/blob-form";

const LEVEL_TEXT: Record<Form, string> = { 1: "text-muted", 2: "text-online", 3: "text-accent" };

/** True level (never the equipped form) and the user's three forms. */
export function BlobLevel({ userId }: { userId: string }) {
  const state = useBlob(userId);
  const base = baseShapeOf(userId);
  const shinyNow = state.level === 2 ? state.shiny2 : state.level === 3 ? state.shiny3 : false;

  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      <span
        className={`inline-flex items-center border border-current px-2 py-0.5 font-mono text-[11px] ${LEVEL_TEXT[state.level]}`}
      >
        Lv{state.level}
        {shinyNow ? " ✦ Shiny" : ""}
      </span>
      <div className="flex items-center gap-1.5" aria-label="Evolution line">
        {([1, 2, 3] as const).map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            {f > 1 && <span className="font-mono text-[10px] text-muted-2">→</span>}
            <span className={f === state.form ? "rounded-full outline outline-1 outline-ink outline-offset-2" : ""}>
              <BlobForm
                name={userId}
                look={formLook(base, f, state)}
                size={36}
                silhouette={f > state.level}
                title={f > state.level ? "Locked" : `Lv${f}`}
              />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
