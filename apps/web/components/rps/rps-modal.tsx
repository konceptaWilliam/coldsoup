"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { bannerText, canRematch, rematchOpponentId, type RpsDetail, type RpsMove } from "@/lib/rps";
import { RpsBattle } from "./rps-battle";
import { RpsPicker } from "./rps-picker";
import { RpsButton, RpsSheet, RpsWaiting } from "./rps-sheet";

export function RpsModal({
  gameId,
  threadId,
  onSeen,
  onClose,
}: {
  gameId: string;
  threadId: string;
  onSeen?: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.rps.get.useQuery({ gameId }, { staleTime: Infinity });
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
  const markSeen = trpc.rps.markSeen.useMutation();
  const rematch = trpc.rps.create.useMutation({
    onSuccess: () => setMode("rematch_sent"),
    onError: (e) =>
      setRematchError(
        e.data?.code === "CONFLICT" ? "A rematch has already been started — check the thread." : "Couldn't start the rematch.",
      ),
  });

  // The one and only viewing: as soon as an unwatched finished game is shown,
  // record it. The cached detail keeps seen=false, so the animation still
  // finishes in this modal; the next open shows the result only.
  const firstViewing = data?.status === "done" && !data.seen;
  const viewed = useRef(false);
  const mark = markSeen.mutate;
  useEffect(() => {
    if (!firstViewing || viewed.current) return;
    viewed.current = true;
    mark({ gameId });
    onSeen?.();
    // onSeen is a fresh closure each render; run once per game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstViewing, gameId, mark]);

  // On close, flip the cached copy too — reopening a tie (for Rematch) must
  // show the result only, not the animation again.
  function close() {
    if (viewed.current) utils.rps.get.setData({ gameId }, (d) => (d ? { ...d, seen: true } : d));
    onClose();
  }

  return (
    <RpsSheet title="Rock, paper, scissors" onClose={close}>
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
          onClose={close}
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
        // Already watched (only reachable for a tie, to rematch): result only.
        <RpsBattle
          left={{ name: challenger, move: cm }}
          right={{ name: opponent, move: om }}
          banner={bannerText(game)}
          startAt={game.seen ? "result" : "shake"}
          frozen={game.seen}
        />
      ) : (
        <p className="font-mono text-sm text-neutral-600 py-8 text-center">{bannerText(game)}</p>
      )}
      {canRematch(game) && (
        <RpsButton onClick={onStartRematch} color="#FDE047">
          Rematch →
        </RpsButton>
      )}
    </div>
  );
}
