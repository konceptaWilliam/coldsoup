type Status = "OPEN" | "URGENT" | "DONE";

const config: Record<Status, { label: string; className: string; dot?: boolean }> = {
  OPEN: {
    label: "open",
    className:
      "bg-pastel-tint text-pastel-ink border border-pastel-deep",
  },
  URGENT: {
    label: "urgent",
    className:
      "bg-urgent-tint text-urgent-ink border border-urgent-border",
    dot: true,
  },
  DONE: {
    label: "done",
    className:
      "bg-done-tint text-done-ink border border-done-border",
  },
};

export function StatusBadge({
  status,
  animate,
}: {
  status: Status;
  animate?: boolean;
}) {
  const { label, className, dot } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 ${className} ${
        animate ? "animate-pop" : ""
      }`}
    >
      {dot && (
        <span className="w-[5px] h-[5px] rounded-full bg-urgent-ink animate-pulse-dot inline-block" />
      )}
      {label}
    </span>
  );
}
