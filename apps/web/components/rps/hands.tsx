import type { ReactNode } from "react";
import type { RpsMove } from "@/lib/rps";

// Hand illustrations, drawn pointing up (wrist at the bottom) on a 100×100
// grid: black stroke, white skin, yellow cuff — the S-meter card palette.
type HandProps = { size?: number; className?: string; title?: string };

const LINE = {
  stroke: "#000",
  strokeWidth: 3,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};
const SKIN = "#FFFFFF";
const CUFF = "#FDE047";

function Cuff() {
  return <rect x="33" y="80" width="34" height="16" fill={CUFF} {...LINE} />;
}

function Svg({ size = 64, className, title, children }: HandProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title}>
      {children}
    </svg>
  );
}

export function RockHand({ title = "Rock", ...rest }: HandProps) {
  return (
    <Svg title={title} {...rest}>
      <rect x="24" y="32" width="52" height="52" rx="15" fill={SKIN} {...LINE} />
      <path d="M37 32 V48 M50 32 V48 M63 32 V48" fill="none" {...LINE} />
      <Cuff />
      <rect x="21" y="54" width="40" height="15" rx="7.5" fill={SKIN} {...LINE} />
    </Svg>
  );
}

export function PaperHand({ title = "Paper", ...rest }: HandProps) {
  return (
    <Svg title={title} {...rest}>
      <rect x="9" y="44" width="13" height="32" rx="6.5" fill={SKIN} {...LINE} transform="rotate(-35 15 60)" />
      <rect x="27" y="16" width="11" height="46" rx="5.5" fill={SKIN} {...LINE} />
      <rect x="39" y="8" width="11" height="52" rx="5.5" fill={SKIN} {...LINE} />
      <rect x="51" y="10" width="11" height="50" rx="5.5" fill={SKIN} {...LINE} />
      <rect x="63" y="18" width="11" height="44" rx="5.5" fill={SKIN} {...LINE} />
      <rect x="26" y="44" width="49" height="40" rx="13" fill={SKIN} {...LINE} />
      <Cuff />
    </Svg>
  );
}

export function ScissorsHand({ title = "Scissors", ...rest }: HandProps) {
  return (
    <Svg title={title} {...rest}>
      <rect x="30" y="6" width="12" height="50" rx="6" fill={SKIN} {...LINE} transform="rotate(-14 36 52)" />
      <rect x="51" y="6" width="12" height="50" rx="6" fill={SKIN} {...LINE} transform="rotate(14 57 52)" />
      <rect x="24" y="40" width="52" height="44" rx="14" fill={SKIN} {...LINE} />
      <path d="M58 40 V54 M68 42 V54" fill="none" {...LINE} />
      <Cuff />
      <rect x="21" y="58" width="38" height="14" rx="7" fill={SKIN} {...LINE} />
    </Svg>
  );
}

export function Hand({ move, ...rest }: HandProps & { move: RpsMove }) {
  if (move === "rock") return <RockHand {...rest} />;
  if (move === "paper") return <PaperHand {...rest} />;
  return <ScissorsHand {...rest} />;
}
