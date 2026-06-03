// Static streaming skeletons rendered by loading.tsx while async route
// segments resolve. Shapes mirror ThreadList (336px column) and ThreadDetail
// (flex-1) so navigation shows structure instantly instead of a blank wait.

export function ThreadListSkeleton({ active = false }: { active?: boolean }) {
  return (
    <section
      className={`${
        active ? "hidden md:flex" : "flex"
      } flex-col w-full md:w-[336px] flex-shrink-0 border-r border-border h-full`}
    >
      {/* Header */}
      <header className="px-3 md:px-[18px] pt-2 md:pt-[14px] pb-2 md:pb-[10px] border-b border-border">
        <div className="h-5 w-32 bg-border/40 animate-pulse" />
      </header>
      {/* Thread items */}
      <div className="flex-1 overflow-hidden p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[80px] bg-border/40 animate-pulse" />
        ))}
      </div>
    </section>
  );
}

export function ThreadDetailSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-surface">
      {/* Header */}
      <header className="px-3 md:px-[18px] py-[10px] border-b border-border flex items-center gap-2">
        <div className="h-5 w-40 bg-border/40 animate-pulse" />
      </header>
      {/* Messages — bottom-anchored, like the real list */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end p-4 space-y-4">
        {[60, 40, 75, 50, 65].map((w, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 bg-border/30 animate-pulse" />
            <div
              className="h-10 bg-border/40 animate-pulse"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="h-11 bg-border/30 animate-pulse" />
      </div>
    </div>
  );
}

export function ThreadDetailEmptySkeleton() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center">
      <p className="font-mono text-sm text-muted">Select a thread to read it</p>
    </div>
  );
}
