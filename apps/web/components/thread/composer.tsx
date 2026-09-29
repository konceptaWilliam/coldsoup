"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { validateFile } from "@/lib/file-utils";
import { MENTION_SPECIALS } from "@/lib/mentions";
import type { ReplyTo } from "@/lib/thread-types";

const DRAFT_PREFIX = "coldsoup:draft:";

function draftKey(threadId: string) {
  return `${DRAFT_PREFIX}${threadId}`;
}

function readDraft(threadId: string): string {
  try {
    return localStorage.getItem(draftKey(threadId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(threadId: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(draftKey(threadId), value);
    else localStorage.removeItem(draftKey(threadId));
  } catch {}
}

function clearDraft(threadId: string) {
  try {
    localStorage.removeItem(draftKey(threadId));
  } catch {}
}

// A single staged (not-yet-sent) file in the composer. Images render as a
// thumbnail tile with a remove button; other files fall back to a name chip.
function PendingPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  if (isImage && url) {
    return (
      <div className="relative h-16 w-16 overflow-hidden border border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={file.name}
          className="h-full w-full object-cover"
        />
        <button
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center bg-ink/70 text-surface text-sm leading-none hover:bg-ink transition-colors"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-16 items-center gap-1.5 border border-border bg-surface-2 px-2 text-xs text-ink">
      <span className="max-w-[120px] truncate font-mono">{file.name}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="ml-0.5 text-muted hover:text-ink transition-colors"
      >
        ×
      </button>
    </div>
  );
}

export type ComposerReply = { id: string; body: string; authorName: string; imageUrl: string | null };

export type ComposerHandle = {
  focus(): void;
  blur(): void;
  isFocused(): boolean;
  startReply(target: ComposerReply): void;
  addFiles(files: File[]): void;
  showError(message: string): void;
  inputBox(): HTMLDivElement | null;
};

export type ComposerProps = {
  threadId: string;
  isDone: boolean;
  reopenPending: boolean;
  members: { id: string; display_name: string; avatar_url: string | null }[];
  onSend: (input: { body: string; files: File[]; replyTo: ReplyTo | null; replyToAttachmentUrl: string | null }) => void;
  onTyping: () => void;
  onGaze: (active: boolean) => void;
  onEditLastOwn: () => boolean;
  onOpenPoll: () => void;
  onOpenSmeter: () => void;
  onReopen: () => void;
  overlay: ReactNode;
  footer: ReactNode;
};

// Owns everything that changes per keystroke, so typing re-renders only this
// component — never the message list.
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    threadId,
    isDone,
    reopenPending,
    members,
    onSend,
    onTyping,
    onGaze,
    onEditLastOwn,
    onOpenPoll,
    onOpenSmeter,
    onReopen,
    overlay,
    footer,
  },
  ref,
) {
  const [body, setBody] = useState(() => readDraft(threadId));
  // True while the soft keyboard is up — used to drop the composer's safe-area
  // bottom padding (otherwise it leaves a gap between the input and keyboard).
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ComposerReply | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerTouchYRef = useRef<number | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);

  // Detect the soft keyboard via the VisualViewport: when it shrinks the visual
  // viewport well below the layout viewport, the keyboard is up.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(window.innerHeight - vv.height > 120);
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => writeDraft(threadId, body), 400);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [body, threadId]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null || !members) return [];
    const q = mentionQuery.toLowerCase();
    const specials = MENTION_SPECIALS
      .filter((s) => mentionQuery === "" || s.includes(q))
      .map((s) => ({ id: `__special_${s}`, display_name: s, avatar_url: null }));
    const matched =
      mentionQuery === ""
        ? members
        : members.filter((m) => m.display_name.toLowerCase().includes(q));
    return [...specials, ...matched];
  }, [mentionQuery, members]);

  function insertMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const textBeforeCursor = body.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    const newBody =
      body.slice(0, lastAtIdx) + "@" + name + " " + body.slice(cursor);
    setBody(newBody);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = lastAtIdx + name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);

    // Detect @mention
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    if (lastAtIdx >= 0) {
      const partial = textBeforeCursor.slice(lastAtIdx + 1);
      if (
        partial.length <= 40 &&
        !partial.includes("\n") &&
        !partial.includes("@")
      ) {
        setMentionQuery(partial);
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }

    onTyping();
  }

  function pickAudioMime(): { mime: string; ext: string } {
    const opts: [string, string][] = [
      ["audio/webm", "webm"],
      ["audio/mp4", "m4a"],
      ["audio/ogg", "ogg"],
    ];
    for (const [mime, ext] of opts) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext };
      }
    }
    return { mime: "audio/webm", ext: "webm" };
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const { mime, ext } = pickAudioMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
        setPendingFiles((prev) => [...prev, file]);
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      // mic permission denied / unavailable — silently ignore
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
  }

  function fmtRec(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex].display_name);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }
    // ↑ in an empty composer edits your last message (standard chat idiom).
    if (e.key === "ArrowUp" && !e.shiftKey && body.trim() === "") {
      if (onEditLastOwn()) e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // On touch devices, Enter inserts a newline; send via the button instead.
      if (window.matchMedia("(pointer: coarse)").matches) return;
      e.preventDefault();
      handleSend();
    }
  }

  function showError(msg: string) {
    setUploadError(msg);
    setTimeout(() => setUploadError(null), 6000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(chosen);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Ctrl/Cmd-V of a screenshot (or any image) stages it as an attachment.
  // Only intercept when the clipboard actually carries files — a plain-text
  // paste falls through to the textarea's default behaviour.
  function handlePaste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(pasted);
  }

  const canSend = !isDone && (body.trim().length > 0 || pendingFiles.length > 0);

  function handleSend() {
    if (!body.trim() && pendingFiles.length === 0) return;
    setUploadError(null);
    onSend({
      body: body.trim(),
      files: pendingFiles,
      replyTo: replyingTo
        ? { id: replyingTo.id, body: replyingTo.body, author_name: replyingTo.authorName, image_url: replyingTo.imageUrl ?? null }
        : null,
      replyToAttachmentUrl: replyingTo?.imageUrl ?? null,
    });
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    clearDraft(threadId);
    setBody("");
    setPendingFiles([]);
    setReplyingTo(null);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  function addFiles(files: File[]) {
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const err = validateFile(file);
      if (err) errors.push(`${err.file}: ${err.reason}`);
      else valid.push(file);
    }
    if (errors.length > 0) showError(errors.join("\n"));
    if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
  }

  // Gaze only cares about "focused with text" flipping, not every keystroke.
  const gazeActive = composerFocused && body.trim().length > 0;
  useEffect(() => {
    onGaze(gazeActive);
  }, [gazeActive, onGaze]);

  // Leaving the thread mid-recording must release the mic and the timer.
  useEffect(
    () => () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
    isFocused: () => typeof document !== "undefined" && document.activeElement === textareaRef.current,
    startReply: (target) => {
      setReplyingTo(target);
      textareaRef.current?.focus();
    },
    addFiles,
    showError,
    inputBox: () => composerRef.current,
  }));

  return (
    <div
      className={`px-4 md:px-6 pt-3 md:pt-[14px] pb-4 border-t border-border flex-shrink-0 relative ${
        keyboardOpen ? "" : "pb-safe"
      }`}
      onTouchStart={(e) => {
        composerTouchYRef.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(e) => {
        const start = composerTouchYRef.current;
        if (start == null) return;
        const dy = (e.touches[0]?.clientY ?? start) - start;
        // Swipe down on the input bar dismisses the keyboard.
        if (dy > 40 && document.activeElement === textareaRef.current) {
          textareaRef.current?.blur();
          composerTouchYRef.current = null;
        }
      }}
      onTouchEnd={() => {
        composerTouchYRef.current = null;
      }}
    >
      {overlay}

      {/* @mention suggestions dropdown */}
      {mentionSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 md:left-6 md:right-6 mb-1 bg-surface border border-border shadow-lg z-20">
          {mentionSuggestions.map((member, i) => (
            <button
              key={member.id}
              className={`w-full text-left px-3 py-2 font-mono text-[12px] text-ink transition-colors border-b border-border last:border-b-0 ${
                i === mentionIndex ? "bg-surface-2" : "hover:bg-surface-2"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(member.display_name)}
            >
              <span className="text-muted">@</span>
              {member.display_name}
            </button>
          ))}
        </div>
      )}

      {isDone && (
        <div className="flex items-center justify-center gap-3 py-2.5 mb-0 border border-done-tint bg-done-tint/50">
          <span className="font-mono text-[11px] text-done-ink uppercase tracking-[0.12em]">
            thread closed
          </span>
          <button
            onClick={() => {
              onReopen();
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
            disabled={reopenPending}
            className="font-mono text-[11px] uppercase tracking-[0.12em] px-2.5 py-1 border border-border-strong text-ink bg-surface hover:bg-border/40 transition-colors disabled:opacity-40"
          >
            reopen to reply
          </button>
        </div>
      )}
      {!isDone && uploadError && (
        <div className="flex items-start justify-between gap-3 mb-2 px-3 py-2 border border-red-200 bg-red-50">
          <p className="font-mono text-[11px] text-red-700 whitespace-pre-wrap leading-snug">
            {uploadError}
          </p>
          <button
            onClick={() => setUploadError(null)}
            className="font-mono text-[13px] leading-none text-red-400 hover:text-red-700 transition-colors flex-shrink-0 mt-px"
          >
            ×
          </button>
        </div>
      )}

      {/* Reply banner */}
      {!isDone && replyingTo && (
        <div className="flex items-center gap-2 mb-2 pl-3 pr-2 py-2 border-l-2 border-pastel-deep bg-surface-2">
          {replyingTo.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={replyingTo.imageUrl}
              alt=""
              className="w-9 h-9 object-cover border border-border flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
              replying to {replyingTo.authorName}
            </span>
            <p className="text-[12px] text-muted truncate mt-0.5 leading-snug">
              {replyingTo.body || (replyingTo.imageUrl ? "(image)" : "(attachment)")}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="font-mono text-base leading-none text-muted hover:text-ink transition-colors flex-shrink-0 mt-0.5"
          >
            ×
          </button>
        </div>
      )}

      {/* Pending file previews */}
      {!isDone && pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((file, i) => (
            <PendingPreview
              key={i}
              file={file}
              onRemove={() => removePendingFile(i)}
            />
          ))}
        </div>
      )}

      {!isDone && (
        <div
          ref={composerRef}
          className="border border-border bg-surface-2 flex items-end gap-0 transition-all duration-200"
          onFocusCapture={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "var(--pastel-deep)";
            el.style.boxShadow = "0 0 0 3px var(--pastel-tint)";
          }}
          onBlurCapture={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = "";
            el.style.boxShadow = "";
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {/* "+" attach menu */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAttachMenuOpen((o) => !o)}
              title="Attach or create poll"
              className="h-11 w-11 md:h-10 md:w-10 flex items-center justify-center text-muted hover:text-pastel-ink transition-colors font-mono text-lg leading-none"
            >
              +
            </button>
            {attachMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAttachMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-border shadow-lg min-w-[160px]">
                  <button
                    className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2 border-b border-border"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    Attach a file
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2 border-b border-border"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onOpenPoll();
                    }}
                  >
                    Create a poll
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 font-mono text-[12px] text-ink hover:bg-surface-2"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onOpenSmeter();
                    }}
                  >
                    Create an S-meter
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Voice record */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? "Stop recording" : "Record voice message"}
            className={`h-11 md:h-10 flex items-center justify-center flex-shrink-0 transition-colors ${
              isRecording ? "px-2.5 text-red-600" : "w-11 md:w-10 text-muted hover:text-pastel-ink"
            }`}
          >
            {isRecording ? (
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2.5 h-2.5 bg-red-600 inline-block" />
                {fmtRec(recordSeconds)}
              </span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            placeholder="message"
            rows={1}
            className="flex-1 min-h-[44px] md:min-h-[40px] max-h-[72px] border-none bg-transparent px-2.5 py-[10px] font-sans text-base md:text-[13.5px] leading-[1.45] text-ink placeholder:text-muted resize-none outline-none overflow-y-auto"
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 72)}px`;
              onGaze(gazeActive); // re-aim as the box grows
            }}
          />
          <button
            // Keep the textarea focused so the mobile keyboard stays open.
            // iOS fires (and focuses on) mousedown/pointerdown — preventing
            // their default stops the button stealing focus, so the input
            // never blurs. (preventDefault here doesn't cancel the click.)
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={!canSend}
            className={`h-11 md:h-10 px-4 flex-shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] border-none transition-all duration-200 ${
              canSend
                ? "bg-ink text-surface cursor-pointer hover:-translate-y-px"
                : "bg-border text-muted-2 cursor-not-allowed"
            }`}
          >
            send
          </button>
        </div>
      )}

      {footer}

      {/* Composer hint */}
      {!isDone && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-mono text-[10px] text-muted-2">
            ⏎ send · ⇧⏎ newline · @ mention
          </span>
          <span className="font-mono text-[10px] text-muted-2 flex items-center gap-1">
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{
                background: "var(--pastel-deep)",
                animation: "pulseDot 2s ease-in-out infinite",
              }}
            />
            live
          </span>
        </div>
      )}
    </div>
  );
});
