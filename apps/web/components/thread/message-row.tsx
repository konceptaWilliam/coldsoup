"use client";

import { memo, useMemo } from "react";
import type { Expression } from "blobatar";
import { Avatar } from "@/components/avatar";
import { SMeterCard } from "@/components/smeter";
import { localPreview } from "@/lib/local-previews";
import { aspectStyle } from "@/lib/media";
import type { MentionMatcher } from "@/lib/mentions";
import { rowPropsEqual } from "@/lib/row-props-equal";
import { REACTION_TYPES, type Attachment, type Me, type Message, type ReplyTo } from "@/lib/thread-types";
import {
  firstLink,
  formatTime,
  ImageGallery,
  LinkPreview,
  PollView,
  renderBody,
  ThreadImage,
} from "./message-parts";

// Message context needed to start a reply from an image (lightbox / hold menu).
// The specific image url is supplied at reply time (the lightbox can swipe to a
// different image than the one originally opened).
export type ReplyTarget = { id: string; body: string; authorName: string };
export type Reader = { id: string; name: string };

export type RowActions = {
  longPressStart: (e: React.PointerEvent<HTMLDivElement>, msg: Message) => void;
  longPressMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  longPressClear: () => void;
  openMenu: (e: React.MouseEvent<HTMLDivElement>, msg: Message) => void;
  swipeStart: (e: React.TouchEvent<HTMLDivElement>, msg: Message) => void;
  swipeMove: (e: React.TouchEvent<HTMLDivElement>, msg: Message) => void;
  swipeEnd: (e: React.TouchEvent<HTMLDivElement>, msg: Message, name: string) => void;
  openProfile: (target: { id: string | null; name: string }) => void;
  openReplyImage: (replyTo: ReplyTo) => void;
  jumpTo: (messageId: string) => Promise<void>;
  startEdit: (messageId: string, body: string) => void;
  setEditBody: (value: string) => void;
  submitEdit: (messageId: string) => void;
  cancelEdit: () => void;
  copy: (messageId: string, text: string) => void;
  reply: (target: { id: string; body: string; authorName: string; imageUrl: string | null }) => void;
  openLightbox: (payload: { images: Attachment[]; index: number; reply: ReplyTarget }) => void;
  holdImage: (payload: { attachment: Attachment; reply: ReplyTarget }) => void;
  react: (messageId: string, type: string) => void;
  remove: (messageId: string) => void;
  retry: (key: string) => void;
  discard: (key: string) => void;
  reactionPressStart: (e: React.PointerEvent<HTMLButtonElement>, key: string) => void;
  reactionPressMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  reactionPressEnd: () => void;
  setTooltip: (key: string | null) => void;
  showTooltipBriefly: (key: string) => void;
  consumeReactionLongPress: (key: string) => boolean;
};

export type MessageRowProps = {
  msg: Message;
  isOwn: boolean;
  isSameAuthor: boolean;
  mood: Expression | undefined;
  animate: boolean;
  flash: boolean;
  menuOpen: boolean;
  isEditing: boolean;
  editBody: string | undefined;
  tooltipType: string | null;
  copied: boolean;
  rowError: string | undefined;
  seenReaders: Reader[];
  bigThread: boolean;
  threadId: string;
  me: Me;
  mentions: MentionMatcher;
  actions: RowActions;
};

function splitAttachments(atts: Attachment[]) {
  return {
    imgAtts: atts.filter((a) => a.type === "image"),
    audioAtts: atts.filter((a) => a.type === "audio"),
    videoAtts: atts.filter((a) => a.type === "video"),
    fileAtts: atts.filter((a) => a.type === "file"),
  };
}

function Row({
  msg,
  isOwn,
  isSameAuthor,
  mood,
  animate,
  flash,
  menuOpen,
  isEditing,
  editBody,
  tooltipType,
  copied,
  rowError,
  seenReaders,
  bigThread,
  threadId,
  me,
  mentions,
  actions,
}: MessageRowProps) {
  const name = msg.profiles?.display_name ?? "Unknown";
  const isLocalMessage = !!msg.delivery_status;
  const canRetry = !msg.missing_files?.length;
  const media = useMemo(() => splitAttachments(msg.attachments ?? []), [msg.attachments]);
  const link = useMemo(() => (msg.is_deleted ? null : firstLink(msg.body)), [msg.is_deleted, msg.body]);

  return (
      <div
        id={`message-${msg.id}`}
        className="relative flex gap-3 group rounded-sm px-2 -mx-2 select-none md:select-text"
        style={{
          marginTop: isSameAuthor ? 2 : 14,
          WebkitTouchCallout: "none",
          // In long threads, let the browser skip layout/paint
          // for off-screen rows (kept in the DOM, so reply-jump
          // and highlight via getElementById still work).
          contentVisibility:
            bigThread ? "auto" : undefined,
          containIntrinsicSize: bigThread ? "auto 56px" : undefined,
          userSelect:
            menuOpen ? "none" : undefined,
          animation: (() => {
            const parts: string[] = [];
            if (animate) {
              parts.push("fadeUp 360ms ease-out both");
            }
            if (flash) {
              parts.push("messageHighlight 2.4s 400ms ease-out forwards");
            }
            return parts.length ? parts.join(", ") : undefined;
          })(),
        }}
        onPointerDown={(e) => actions.longPressStart(e, msg)}
        onPointerMove={actions.longPressMove}
        onPointerUp={actions.longPressClear}
        onPointerCancel={actions.longPressClear}
        onPointerLeave={actions.longPressClear}
        onContextMenu={(e) => actions.openMenu(e, msg)}
        onTouchStart={(e) => actions.swipeStart(e, msg)}
        onTouchMove={(e) => actions.swipeMove(e, msg)}
        onTouchEnd={(e) => actions.swipeEnd(e, msg, name)}
        onTouchCancel={(e) => actions.swipeEnd(e, msg, name)}
        onMouseEnter={(e) => {
          if (!window.matchMedia("(hover: hover)").matches) return;
          const actions =
            e.currentTarget.querySelector<HTMLElement>(
              ".msg-actions",
            );
          if (actions) {
            actions.style.opacity = "1";
            actions.style.pointerEvents = "auto";
          }
        }}
        onMouseLeave={(e) => {
          if (!window.matchMedia("(hover: hover)").matches) return;
          const actions =
            e.currentTarget.querySelector<HTMLElement>(
              ".msg-actions",
            );
          if (actions) {
            actions.style.opacity = "0";
            actions.style.pointerEvents = "none";
          }
        }}
      >
        {/* Avatar column */}
        <div className="relative w-7 flex-shrink-0">
          {(!isSameAuthor || mood) && (
            <button
              type="button"
              onClick={() =>
                actions.openProfile({
                  id: msg.user_id,
                  name,
                })
              }
              className={
                isSameAuthor
                  ? // Mood-only blob on a grouped row: small and
                    // out of flow so the row never jumps.
                    "absolute top-0 left-1 hover:opacity-80 transition-opacity"
                  : "block text-left hover:opacity-80 transition-opacity"
              }
              title={`Open ${name}`}
            >
              <Avatar
                userId={msg.user_id}
                name={name}
                size={isSameAuthor ? 20 : 28}
                animate="hover"
                expression={mood}
              />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {!isSameAuthor && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[15px] font-semibold text-ink">
                {name}
              </span>
              <span className="font-mono text-[12px] text-muted">
                {formatTime(msg.created_at)}
              </span>
            </div>
          )}

          <div className={`relative ${msg.delivery_status === "sending" && msg.upload_progress !== undefined ? "opacity-70" : ""}`}>
            {/* Reply quote */}
            {msg.reply_to && !msg.is_deleted && (
              <div className="flex items-center gap-1.5 mb-1 border-l-2 border-border pl-2 hover:border-ink/40 transition-colors group/reply">
                {msg.reply_to.image_url && (
                  <button
                    onClick={() =>
                      actions.openReplyImage(msg.reply_to!)
                    }
                    aria-label="Open replied-to image"
                    className="flex-shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.reply_to.image_url}
                      alt=""
                      className="w-8 h-8 object-cover border border-border"
                    />
                  </button>
                )}
                <button
                  className="min-w-0 text-left flex-1"
                  onClick={() => void actions.jumpTo(msg.reply_to!.id)}
                >
                  <span className="font-mono text-[12px] text-muted font-semibold block">
                    {msg.reply_to.author_name}
                  </span>
                  <p className="text-[13px] text-muted truncate leading-snug">
                    {msg.reply_to.body || (msg.reply_to.image_url ? "(image)" : "")}
                  </p>
                </button>
              </div>
            )}

            {/* Deleted message tombstone */}
            {msg.is_deleted ? (
              <p className="text-[13px] text-muted italic font-mono">
                message deleted
              </p>
            ) : isEditing ? (
              <div className="mt-0.5">
                <textarea
                  value={editBody ?? ""}
                  onChange={(e) => actions.setEditBody(e.target.value)}
                  className="w-full border border-pastel-deep bg-surface-2 px-2.5 py-2 font-sans text-[13.5px] leading-[1.55] text-ink resize-none outline-none focus:ring-0"
                  style={{
                    boxShadow: "0 0 0 3px var(--pastel-tint)",
                  }}
                  rows={Math.max(
                    2,
                    (editBody ?? "").split("\n").length,
                  )}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      actions.cancelEdit();
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (
                        window.matchMedia("(pointer: coarse)")
                          .matches
                      )
                        return;
                      e.preventDefault();
                      actions.submitEdit(msg.id);
                    }
                  }}
                />
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => actions.submitEdit(msg.id)}
                    disabled={
                      !(editBody ?? "").trim()
                    }
                    className="font-mono text-[10px] uppercase tracking-wider bg-ink text-surface px-2.5 py-1 hover:bg-ink/90 disabled:opacity-40 transition-colors"
                  >
                    save
                  </button>
                  <button
                    onClick={() => {
                      actions.cancelEdit();
                    }}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink transition-colors"
                  >
                    cancel
                  </button>
                  <span className="font-mono text-[10px] text-muted-2 ml-1">
                    esc · ⏎ save
                  </span>
                </div>
              </div>
            ) : (
              <>
                {msg.poll && (
                  <PollView
                    poll={msg.poll}
                    myInfo={me}
                  />
                )}
                {msg.smeter && (
                  <SMeterCard smeter={msg.smeter} threadId={threadId} />
                )}
                {msg.body && (
                  <p className="text-[16px] leading-[1.5] text-ink whitespace-pre-wrap break-words">
                    {renderBody(msg.body, mentions, me.id)}
                  </p>
                )}
                {link && <LinkPreview url={link} />}
                {msg.edited_at && (
                  <span className="font-mono text-[10px] text-muted-2 ml-0.5">
                    (edited)
                  </span>
                )}
              </>
            )}

            {/* Hover action bar */}
            {!isEditing && !msg.is_deleted && !isLocalMessage && (
              <div
                className="msg-actions select-none absolute -top-[14px] right-0 flex gap-0.5 bg-surface-2 border border-border p-0.5"
                style={{
                  opacity: 0,
                  // Invisible by default and only revealed on real
                  // hover (desktop). pointer-events must track
                  // opacity, otherwise on touch — where mouseenter
                  // never fires — the hidden reaction/copy buttons
                  // stay tappable and a stray tap fires a phantom
                  // reaction.
                  pointerEvents: "none",
                  transition: "opacity 160ms ease",
                }}
              >
                {msg.body.trim().length > 0 && (
                  <button
                    onClick={() => actions.copy(msg.id, msg.body)}
                    title="Copy"
                    className="px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-ink transition-all border-none bg-transparent cursor-pointer leading-none"
                  >
                    {copied ? "ok" : "copy"}
                  </button>
                )}

                {/* Reply button */}
                <button
                  onClick={() => actions.reply({ id: msg.id, body: msg.body, authorName: name, imageUrl: null })}
                  title="Reply"
                  className="px-1.5 py-0.5 text-[13px] text-muted hover:text-ink hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                >
                  ↩
                </button>

                {/* Edit + delete — own messages only */}
                {isOwn && (
                  <>
                    <button
                      onClick={() => actions.startEdit(msg.id, msg.body)}
                      title="Edit"
                      className="px-1.5 py-0.5 text-[13px] text-muted hover:text-ink hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => actions.remove(msg.id)}
                      title="Delete"
                      className="px-1.5 py-0.5 text-[13px] text-muted hover:text-red-500 hover:scale-110 transition-all border-none bg-transparent cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </>
                )}

                {/* Reaction buttons */}
                {REACTION_TYPES.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => actions.react(msg.id, emoji)}
                    className="px-1.5 py-0.5 text-sm hover:scale-125 transition-transform border-none bg-transparent cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          {!msg.is_deleted &&
            (msg.attachments ?? []).length > 0 &&
            (() => {
              const { imgAtts, audioAtts, videoAtts, fileAtts } = media;
              return (
                <div className="mt-2 space-y-2">
                  {imgAtts.length === 1 && (
                    <ThreadImage
                      att={imgAtts[0]}
                      onOpen={() =>
                        actions.openLightbox({
                          images: imgAtts,
                          index: 0,
                          reply: {
                            id: msg.id,
                            body: msg.body,
                            authorName: name,
                          },
                        })
                      }
                      onHold={() =>
                        actions.holdImage({
                          attachment: imgAtts[0],
                          reply: {
                            id: msg.id,
                            body: msg.body,
                            authorName: name,
                          },
                        })
                      }
                    />
                  )}
                  {imgAtts.length >= 2 && (
                    <ImageGallery
                      attachments={imgAtts}
                      onOpen={(att) =>
                        actions.openLightbox({
                          images: imgAtts,
                          index: Math.max(
                            0,
                            imgAtts.indexOf(att),
                          ),
                          reply: {
                            id: msg.id,
                            body: msg.body,
                            authorName: name,
                          },
                        })
                      }
                      onHold={(att) =>
                        actions.holdImage({
                          attachment: att,
                          reply: {
                            id: msg.id,
                            body: msg.body,
                            authorName: name,
                          },
                        })
                      }
                    />
                  )}
                  {videoAtts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {videoAtts.map((att, i) => (
                        <video
                          key={i}
                          controls
                          src={localPreview(att.url) ?? att.url}
                          className="max-w-xs border border-border"
                          style={{ maxHeight: 320, ...aspectStyle(att) }}
                        />
                      ))}
                    </div>
                  )}
                  {audioAtts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {audioAtts.map((att, i) => (
                        <div
                          key={i}
                          className="border border-border bg-surface-2 px-2.5 py-2 max-w-xs"
                        >
                          <span className="font-mono text-[10px] text-muted block mb-1 truncate">
                            {att.name}
                          </span>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <audio controls src={att.url} className="w-full h-8" />
                        </div>
                      ))}
                    </div>
                  )}
                  {fileAtts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {fileAtts.map((att, i) => {
                        const ext = (att.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
                        return (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 border border-border px-3 py-2 hover:border-pastel-deep transition-colors"
                          >
                            <span className="w-8 h-8 flex items-center justify-center bg-ink text-surface font-mono text-[9px] font-semibold flex-shrink-0">
                              {ext || "FILE"}
                            </span>
                            <span className="font-mono text-xs text-ink max-w-[160px] truncate">
                              {att.name}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Reaction chips */}
          {!msg.is_deleted &&
            (msg.reactions ?? []).some((r) => r.count > 0) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {msg.reactions
                  .filter((r) => r.count > 0)
                  .map((r) => {
                    const tooltipKey = `${msg.id}:${r.type}`;
                    const isTooltipVisible = tooltipType === r.type;
                    return (
                      <div key={r.type} className="relative">
                        <button
                          onClick={() => {
                            // Swallow the click that ends a
                            // long-press so it doesn't toggle.
                            if (actions.consumeReactionLongPress(tooltipKey)) return;
                            actions.react(msg.id, r.type);
                          }}
                          onMouseEnter={() =>
                            actions.setTooltip(tooltipKey)
                          }
                          onMouseLeave={() =>
                            actions.setTooltip(null)
                          }
                          onPointerDown={(e) =>
                            actions.reactionPressStart(e, tooltipKey)
                          }
                          onPointerMove={actions.reactionPressMove}
                          onPointerUp={actions.reactionPressEnd}
                          onPointerCancel={actions.reactionPressEnd}
                          onPointerLeave={actions.reactionPressEnd}
                          onTouchStart={(e) => e.stopPropagation()}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            actions.showTooltipBriefly(tooltipKey);
                          }}
                          className={`inline-flex items-center gap-1 font-mono text-[11px] px-[7px] py-0.5 border transition-all duration-150 ${
                            r.userReacted
                              ? "bg-pastel-tint text-pastel-ink border-pastel-deep"
                              : "text-muted border-border hover:border-pastel-deep"
                          }`}
                          style={
                            r.userReacted
                              ? {
                                  animation:
                                    "pop 240ms ease-out",
                                }
                              : undefined
                          }
                        >
                          <span className="text-[12px]">
                            {r.type}
                          </span>
                          <span>{r.count}</span>
                        </button>
                        {isTooltipVisible &&
                          r.users.length > 0 && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 max-h-40 overflow-y-auto bg-ink text-surface font-mono text-[10px] px-2.5 py-1.5 pointer-events-none min-w-max max-w-[180px] space-y-0.5">
                              <div className="text-surface/50 uppercase tracking-[0.1em] mb-1">
                                {r.type} {r.count}
                              </div>
                              {r.users.map((u, i) => (
                                <div key={i} className="truncate">
                                  {u}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
              </div>
            )}

          {msg.upload_progress !== undefined && (
            <div className="mt-1 h-0.5 w-full max-w-[272px] bg-border overflow-hidden">
              <div
                className="h-full bg-ink transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(msg.upload_progress * 100)}%` }}
              />
            </div>
          )}
          {msg.delivery_status === "sending" && (
            <span
              aria-label="sending"
              className="absolute -right-1 bottom-0 font-mono text-[10px] text-muted-2 leading-none"
            >
              🕓
            </span>
          )}
          {rowError && (
            <p className="font-mono text-[10px] text-red-600 mt-1">{rowError}</p>
          )}

          {msg.delivery_status === "failed" && (
            <div className="flex items-center gap-2 mt-1">
              {canRetry ? (
                <button
                  onClick={() => msg.fail_id && actions.retry(msg.fail_id)}
                  className="font-mono text-[10px] text-red-600 hover:text-red-700"
                >
                  failed - retry
                </button>
              ) : (
                <span className="font-mono text-[10px] text-red-600">attachment lost</span>
              )}
              <button
                onClick={() => msg.fail_id && actions.discard(msg.fail_id)}
                className="font-mono text-[13px] leading-none text-muted hover:text-ink"
              >
                x
              </button>
            </div>
          )}

          {seenReaders.length > 0 && (
            <div className="absolute right-2 -bottom-2 z-10 flex items-center justify-end gap-0 pointer-events-none">
              {seenReaders.slice(0, 5).map((reader, readerIndex) => (
                <div
                  key={reader.id}
                  className="border border-surface rounded-sm"
                  style={{ marginLeft: readerIndex === 0 ? 0 : -6 }}
                  title={`Seen by ${reader.name}`}
                >
                  <Avatar
                    userId={reader.id}
                    name={reader.name}
                    size={16}
                  />
                </div>
              ))}
              {seenReaders.length > 5 && (
                <span className="font-mono text-[10px] text-muted-2 ml-1">
                  +{seenReaders.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
  );
}

// Re-renders only when this message or its per-row UI state changes — typing,
// presence and other rows' updates don't touch it.
export const MessageRow = memo(Row, rowPropsEqual);
