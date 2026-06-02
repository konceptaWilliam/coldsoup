"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

export function NewThreadDialog({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const createThread = trpc.threads.create.useMutation({
    onSuccess: (thread) => {
      utils.threads.list.invalidate({ groupId });
      router.push(`/g/${groupId}/t/${thread.id}`);
      onClose();
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createThread.mutate({ groupId, title: title.trim(), dueDate });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border w-full max-w-md mx-4 p-6">
        <h2 className="font-mono text-sm font-semibold text-ink mb-4">
          New thread
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="thread-title"
              className="block font-mono text-xs text-muted uppercase tracking-wider mb-2"
            >
              Title
            </label>
            <input
              ref={inputRef}
              id="thread-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/ /g, "_"))}
              placeholder="What needs to be discussed?"
              maxLength={200}
              className="w-full border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="thread-due-date"
              className="block font-mono text-xs text-muted uppercase tracking-wider mb-2"
            >
              Due date
            </label>
            <div className="flex items-center gap-2">
              <input
                id="thread-due-date"
                type="date"
                value={dueDate ?? ""}
                onChange={(e) => setDueDate(e.target.value || null)}
                className="flex-1 border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ink transition-colors"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate(null)}
                  className="font-mono text-xs text-muted hover:text-ink px-2 py-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {createThread.error && (
            <p className="text-sm text-red-600">
              {createThread.error.message}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-sm text-muted hover:text-ink px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createThread.isPending}
              className="bg-ink text-surface font-mono text-sm font-medium px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
            >
              {createThread.isPending ? "Creating..." : "Create thread"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
