// Offline capture queue (Foundations-before-auth handoff §3). A note typed on a
// phone must NEVER be lost to a dead connection — so a capture is written to a
// local queue first, then flushed to Supabase when there's a network. Sync
// happens later, silently. Small text only, so localStorage is enough and more
// robust than an IndexedDB dance for v1.

const KEY = "k.captureQueue";

export interface PendingNote {
  id: string;        // local id (dedupes retries; not the DB id)
  worldId: string;
  body: string;
  createdAt: number;
}

function read(): PendingNote[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as PendingNote[]) : []; }
  catch { return []; }
}
function write(q: PendingNote[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* private mode / full */ }
}

const uid = (): string =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Queue a captured note. Returns immediately — the write is durable locally
// before any network call, which is the whole point.
export function enqueueNote(worldId: string, body: string): PendingNote {
  const item: PendingNote = { id: uid(), worldId, body: body.trim(), createdAt: Date.now() };
  write([...read(), item]);
  return item;
}

export function pendingCount(): number {
  return read().length;
}

// Flush the queue with a caller-supplied sender (kept injectable so the queue is
// testable without Supabase). Items that send are dropped; items that fail stay
// for the next flush. Never throws.
//
// Flushes are serialized. Two overlapping runs (e.g. the `online` event firing
// while a manual capture flushes) would re-send the same item — a duplicate
// note — and the final write could clobber a note enqueued mid-flush. A request
// arriving while a flush is in flight sets `again`, so exactly one follow-up
// flush runs afterward to pick up anything queued during this one.
let inFlight: Promise<{ sent: number; left: number }> | null = null;
let flushing = false;
let again = false;

export function flushQueue(send: (item: PendingNote) => Promise<void>): Promise<{ sent: number; left: number }> {
  // `flushing` is a plain boolean set BEFORE doFlush runs: doFlush executes
  // synchronously into `send`, which (via captureNote) re-enters flushQueue, so
  // the guard has to be visible on that same synchronous turn or the re-entrant
  // call starts a second concurrent flush.
  if (flushing) { again = true; return inFlight ?? Promise.resolve({ sent: 0, left: 0 }); }
  flushing = true;
  inFlight = doFlush(send).finally(() => {
    flushing = false;
    inFlight = null;
    if (again) { again = false; void flushQueue(send); }
  });
  return inFlight;
}

async function doFlush(send: (item: PendingNote) => Promise<void>): Promise<{ sent: number; left: number }> {
  const q = read();
  if (q.length === 0) return { sent: 0, left: 0 };
  const sentIds = new Set<string>();
  let sent = 0;
  for (const item of q) {
    try { await send(item); sentIds.add(item.id); sent++; }
    catch { /* keep for the next flush */ }
  }
  // Re-read before writing so any note enqueued during the flush survives —
  // drop only the ids we actually sent.
  const remaining = read().filter((it) => !sentIds.has(it.id));
  write(remaining);
  return { sent, left: remaining.length };
}
