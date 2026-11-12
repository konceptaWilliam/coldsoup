"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { EvolveModal, rerollSpec, type RevealSpec } from "@/components/evolve-modal";

/**
 * Lv3 reroll + its reveal modal. Shared by Settings and the app-entry banner.
 * Render `modal` somewhere in the tree; it is null until a roll lands.
 */
export function useLv3Reroll(userId: string, onDone?: () => void) {
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.profile.myBlob.invalidate();
    void utils.profile.blobs.invalidate();
  };
  const [reveal, setReveal] = useState<{ spec: RevealSpec; shiny: boolean } | null>(null);
  const setForm = trpc.profile.setBlobForm.useMutation({ onSuccess: refresh });
  const keep = trpc.profile.keepLv3Shape.useMutation({ onSuccess: refresh });
  const reroll = trpc.profile.rerollLv3.useMutation({
    onSuccess: (r) => {
      refresh();
      setReveal({ spec: rerollSpec(userId, r.previous, r.shape, r.shiny), shiny: r.shiny });
    },
  });

  const close = () => {
    setReveal(null);
    onDone?.();
  };

  const modal = reveal ? (
    <EvolveModal
      spec={reveal.spec}
      onPrimary={() => {
        if (reveal.shiny) setForm.mutate({ form: 3 });
        else keep.mutate();
        close();
      }}
      onSecondary={close}
    />
  ) : null;

  return { reroll, modal };
}
