// Pure reducers over the infinite messages.list cache (plus the pending-send
// merge and dispatch selection). No React and no imports, so everything here
// is unit-tested with node --test.

export type CacheReaction = { type: string; count: number; userReacted: boolean; users: string[] };

export type CacheMessage = {
  id: string;
  created_at: string;
  client_id?: string | null;
  reactions: CacheReaction[];
  poll_id: string | null;
  poll: { id: string; options: { id: string }[] } | null;
  smeter_id: string | null;
  smeter: unknown;
  delivery_status?: "sending" | "failed";
};

export type ThreadPage<M> = { messages: M[]; hasMore: boolean };
/** pages[0] is the newest page; each page is ascending by created_at. */
export type ThreadPages<M> = { pages: ThreadPage<M>[]; pageParams: unknown[] };

const time = (m: { created_at: string }) => Date.parse(m.created_at);

function withPage<M>(data: ThreadPages<M>, index: number, page: ThreadPage<M>): ThreadPages<M> {
  const pages = data.pages.slice();
  pages[index] = page;
  return { ...data, pages };
}

export function flatten<M extends CacheMessage>(data: ThreadPages<M> | undefined): M[] {
  if (!data) return [];
  const out: M[] = [];
  for (let i = data.pages.length - 1; i >= 0; i--) out.push(...data.pages[i].messages);
  return out;
}

export function upsertMessage<M extends CacheMessage>(data: ThreadPages<M>, msg: M): ThreadPages<M> {
  for (let p = 0; p < data.pages.length; p++) {
    const idx = data.pages[p].messages.findIndex((m) => m.id === msg.id);
    if (idx !== -1) {
      const messages = data.pages[p].messages.slice();
      messages[idx] = msg;
      return withPage(data, p, { ...data.pages[p], messages });
    }
  }
  if (data.pages.length === 0) {
    return { pages: [{ messages: [msg], hasMore: false }], pageParams: [undefined] };
  }
  // The page whose range covers the timestamp: walk from newest to older
  // while the message is older than the page's first row.
  const ts = time(msg);
  let p = 0;
  while (p < data.pages.length - 1) {
    const first = data.pages[p].messages[0];
    if (!first || ts >= time(first)) break;
    p++;
  }
  const messages = data.pages[p].messages.slice();
  let i = messages.length;
  while (i > 0 && time(messages[i - 1]) > ts) i--;
  messages.splice(i, 0, msg);
  return withPage(data, p, { ...data.pages[p], messages });
}

export function patchMessage<M extends CacheMessage>(
  data: ThreadPages<M>,
  id: string,
  fn: (m: M) => M
): ThreadPages<M> {
  for (let p = 0; p < data.pages.length; p++) {
    const idx = data.pages[p].messages.findIndex((m) => m.id === id);
    if (idx === -1) continue;
    const current = data.pages[p].messages[idx];
    const next = fn(current);
    if (next === current) return data;
    const messages = data.pages[p].messages.slice();
    messages[idx] = next;
    return withPage(data, p, { ...data.pages[p], messages });
  }
  return data;
}

function removeOnce(list: string[], value: string): string[] {
  const i = list.indexOf(value);
  return i === -1 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
}

export function applyReaction<M extends CacheMessage>(
  data: ThreadPages<M>,
  a: { messageId: string; type: string; userId: string; userName: string; op: "add" | "remove"; meId: string }
): ThreadPages<M> {
  return patchMessage(data, a.messageId, (m) => {
    let changed = false;
    const isMe = a.userId === a.meId;
    const reactions = m.reactions.map((r) => {
      if (r.type !== a.type) return r;
      // For me userReacted is exact; for others the name list is the only
      // per-user record in the cache.
      const has = isMe ? r.userReacted : r.users.includes(a.userName);
      if (a.op === "add" ? has : !has) return r;
      changed = true;
      return {
        type: r.type,
        count: Math.max(0, r.count + (a.op === "add" ? 1 : -1)),
        userReacted: isMe ? a.op === "add" : r.userReacted,
        users: a.op === "add" ? [...r.users, a.userName] : removeOnce(r.users, a.userName),
      };
    });
    return changed ? { ...m, reactions } : m;
  });
}

function mapWhere<M extends CacheMessage>(
  data: ThreadPages<M>,
  match: (m: M) => boolean,
  fn: (m: M) => M
): ThreadPages<M> {
  let touched = false;
  const pages = data.pages.map((page) => {
    if (!page.messages.some(match)) return page;
    touched = true;
    return { ...page, messages: page.messages.map((m) => (match(m) ? fn(m) : m)) };
  });
  return touched ? { ...data, pages } : data;
}

export function patchPoll<M extends CacheMessage>(data: ThreadPages<M>, pollId: string, poll: M["poll"]): ThreadPages<M> {
  return mapWhere(data, (m) => m.poll_id === pollId, (m) => ({ ...m, poll }));
}

export function patchSmeter<M extends CacheMessage>(data: ThreadPages<M>, smeterId: string, smeter: M["smeter"]): ThreadPages<M> {
  return mapWhere(data, (m) => m.smeter_id === smeterId, (m) => ({ ...m, smeter }));
}

export function findPollIdByOption<M extends CacheMessage>(data: ThreadPages<M> | undefined, optionId: string): string | null {
  for (const m of flatten(data)) {
    if (m.poll_id && m.poll?.options.some((o) => o.id === optionId)) return m.poll_id;
  }
  return null;
}

export function mergeLatest<M extends CacheMessage>(
  data: ThreadPages<M> | undefined,
  fresh: ThreadPage<M>
): ThreadPages<M> {
  if (!data || data.pages.length === 0) return { pages: [fresh], pageParams: [undefined] };
  let next = data;
  for (const m of fresh.messages) next = upsertMessage(next, m);
  if (next.pages.length === 1) next = withPage(next, 0, { ...next.pages[0], hasMore: fresh.hasMore });
  return next;
}

export function trimForPersist<M>(data: ThreadPages<M>): ThreadPages<M> {
  return { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
}

type PersistedQuery = { queryKey: unknown; state: { data?: unknown } };

function isInfiniteMessagesKey(key: unknown): boolean {
  if (!Array.isArray(key)) return false;
  const [path, meta] = key as [unknown, { type?: string } | undefined];
  return (
    Array.isArray(path) &&
    path[0] === "messages" &&
    path[1] === "list" &&
    meta?.type === "infinite"
  );
}

/** Returns a copy of a persisted client with every infinite messages.list trimmed to its newest page. */
export function trimPersistedMessages<T extends { clientState: { queries: PersistedQuery[] } }>(client: T): T {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((q) => {
        const data = q.state.data as ThreadPages<unknown> | undefined;
        if (!isInfiniteMessagesKey(q.queryKey) || !data?.pages) return q;
        return { ...q, state: { ...q.state, data: trimForPersist(data) } };
      }),
    },
  };
}

/** Server rows followed by pending rows not yet visible on the server. */
export function mergePending<M extends CacheMessage>(server: M[], pending: M[]): M[] {
  if (pending.length === 0) return server;
  const onServer = new Set<string>();
  for (const m of server) if (m.client_id) onServer.add(m.client_id);
  const visible = pending.filter((p) => !(p.client_id && onServer.has(p.client_id)));
  return visible.length === 0 ? server : [...server, ...visible];
}

export type DispatchStatus = "uploading" | "ready" | "dispatching" | "failed";

/** The next send to dispatch: the first non-failed entry, only when it is ready. */
export function nextToDispatch<E extends { status: DispatchStatus }>(queue: E[]): E | null {
  const head = queue.find((e) => e.status !== "failed");
  return head && head.status === "ready" ? head : null;
}
