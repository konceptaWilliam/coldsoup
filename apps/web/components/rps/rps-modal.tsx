"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { bannerText, canRematch, rematchOpponentId, type RpsDetail, type RpsMove } from "@/lib/rps";
import { RpsBattle } from "./rps-battle";
import { RpsPicker } from "./rps-picker";
import { RpsButton, RpsSheet, RpsWaiting } from "./rps-sheet";

export function RpsModal({ gameId, threadId, onClose }: { gameId: string; threadId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.rps.get.useQuery({ gameId });
  const [mode, setMode] = useState<"view" | "rematch" | "rematch_sent">("view");
  const [playError, setPlayError] = useState<string | null>(null);
  const [rematchError, setRematchError] = useState<string | null>(null);

  const play = trpc.rps.play.useMutation({
    onSuccess: (d) => utils.rps.get.setData({ gameId }, d),
    onError: (e) => {
      if (e.data?.code === "CONFLICT") void utils.rps.get.invalidate({ gameId });
      else setPlayError("You can't play this game anymore.");
    },
  });
  const rematch = trpc.rps.create.useMutation({
    onSuccess: () => setMode("rematch_sent"),
    onError: (e) =>
      setRematchError(
        e.data?.code === "CONFLICT" ? "A rematch has already been started — check the thread." : "Couldn't start the rematch.",
      ),
  });

  return (
    <RpsSheet title="Rock, paper, scissors" onClose={onClose}>
      {isLoading ? (
        <p className="font-mono text-sm text-neutral-600 py-12 text-center">Loading…</p>
      ) : error || !data ? (
        <p className="font-mono text-sm text-neutral-600 py-12 text-center">Couldn&apos;t load this game.</p>
      ) : (
        <GameBody
          game={data}
          mode={mode}
          playPending={play.isPending}
          playError={playError}
          rematchPending={rematch.isPending}
          rematchError={rematchError}
          onPlay={(move) => play.mutate({ gameId, move })}
          onStartRematch={() => setMode("rematch")}
          onRematch={(move) => {
            const opponentId = rematchOpponentId(data);
            if (opponentId) rematch.mutate({ threadId, opponentId, move, rematchOf: data.id });
          }}
          onClose={onClose}
        />
      )}
    </RpsSheet>
  );
}

function GameBody({
  game,
  mode,
  playPending,
  playError,
  rematchPending,
  rematchError,
  onPlay,
  onStartRematch,
  onRematch,
  onClose,
}: {
  game: RpsDetail;
  mode: "view" | "rematch" | "rematch_sent";
  playPending: boolean;
  playError: string | null;
  rematchPending: boolean;
  rematchError: string | null;
  onPlay: (move: RpsMove) => void;
  onStartRematch: () => void;
  onRematch: (move: RpsMove) => void;
  onClose: () => void;
}) {
  const challenger = game.challenger?.display_name ?? "Someone";
  const opponent = game.opponent?.display_name ?? "Someone";
  const rival = game.role === "challenger" ? opponent : challenger;

  if (mode === "rematch") {
    return (
      <>
        <RpsPicker onPick={onRematch} disabled={rematchPending} prompt={`Rematch against ${rival}`} />
        {rematchError && <p className="mt-3 font-mono text-[12px] font-bold text-red-600">{rematchError}</p>}
      </>
    );
  }
  if (mode === "rematch_sent") {
    return (
      <>
        <RpsWaiting name={rival} />
        <RpsButton onClick={onClose}>Close</RpsButton>
      </>
    );
  }

  if (game.status === "pending") {
    if (game.role === "opponent") {
      return (
        <>
          <RpsPicker
            onPick={onPlay}
            disabled={playPending}
            prompt={`${challenger} challenged you. Pick your move`}
          />
          {playError && <p className="mt-3 font-mono text-[12px] font-bold text-red-600">{playError}</p>}
        </>
      );
    }
    return <RpsWaiting name={opponent} />;
  }

  const { challenger: cm, opponent: om } = game.moves;
  return (
    <div className="space-y-4">
      {cm && om ? (
        <RpsBattle
          left={{ name: challenger, move: cm }}
          right={{ name: opponent, move: om }}
          banner={bannerText(game)}
        />
      ) : (
        <p className="font-mono text-sm text-neutral-600 py-8 text-center">{bannerText(game)}</p>
      )}
      <div className="grid gap-2">
        {canRematch(game) && (
          <RpsButton onClick={onStartRematch} color="#FDE047">
            Rematch →
          </RpsButton>
        )}
      </div>
    </div>
  );
}
