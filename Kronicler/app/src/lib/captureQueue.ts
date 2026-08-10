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
export async function flushQueue(send: (item: PendingNote) => Promise<void>): Promise<{ sent: number; left: number }> {
  const q = read();
  if (q.length === 0) return { sent: 0, left: 0 };
  const remaining: PendingNote[] = [];
  let sent = 0;
  for (const item of q) {
    try { await send(item); sent++; }
    catch { remaining.push(item); }
  }
  write(remaining);
  return { sent, left: remaining.length };
}
