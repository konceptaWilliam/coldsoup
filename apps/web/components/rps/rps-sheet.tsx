"use client";

import type { ReactNode } from "react";
import { RockHand } from "./hands";

// Modal box in the S-meter sheet style. RpsSheetFrame is the box alone (used
// inline by the dev preview); RpsSheet adds the fixed overlay.
export function RpsSheetFrame({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="bg-[#F5F5F5] w-full sm:max-w-md max-h-[92vh] overflow-y-auto border-2 border-black">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b-2 border-black bg-[#F5F5F5]">
        <span className="font-mono text-[16px] font-extrabold text-black truncate">{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-2xl leading-none text-black hover:opacity-60 w-9 h-9 flex items-center justify-center"
          >
            ×
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function RpsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <RpsSheetFrame title={title} onClose={onClose}>
        {children}
      </RpsSheetFrame>
    </div>
  );
}

export function RpsWaiting({ name }: { name: string }) {
  return (
    <div className="py-8 text-center">
      <div className="flex justify-center mb-4">
        <div className="rps-idle">
          <RockHand size={88} />
        </div>
      </div>
      <p className="font-mono text-[14px] font-extrabold text-black">Waiting for {name} to make a move…</p>
    </div>
  );
}

export function RpsButton({ onClick, children, color = "#fff" }: { onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: color }}
      className="w-full border-2 border-black py-2 font-mono text-[13px] font-extrabold text-black shadow-[3px_3px_0_black] hover:shadow-[1px_1px_0_black] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
    >
      {children}
    </button>
  );
}
