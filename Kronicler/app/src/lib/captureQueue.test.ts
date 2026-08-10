import { describe, it, expect, beforeEach } from "vitest";
import { enqueueNote, pendingCount, flushQueue, type PendingNote } from "./captureQueue";

// Minimal localStorage for the node test env (no jsdom).
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

describe("captureQueue", () => {
  it("queues a note durably before any network call", () => {
    enqueueNote("w1", "  Watson's limp keeps drifting  ");
    expect(pendingCount()).toBe(1);
  });

  it("flushes queued notes and drops the ones that send", async () => {
    enqueueNote("w1", "note one");
    enqueueNote("w1", "note two");
    const sent: string[] = [];
    const res = await flushQueue(async (n: PendingNote) => { sent.push(n.body); });
    expect(res).toEqual({ sent: 2, left: 0 });
    expect(sent).toEqual(["note one", "note two"]);
    expect(pendingCount()).toBe(0);
  });

  it("keeps a note that fails to send, for the next flush", async () => {
    enqueueNote("w1", "ok");
    enqueueNote("w1", "boom");
    let calls = 0;
    const res = await flushQueue(async (n: PendingNote) => { calls++; if (n.body === "boom") throw new Error("offline"); });
    expect(res).toEqual({ sent: 1, left: 1 });
    expect(pendingCount()).toBe(1);
    // Second flush (now "online") clears the survivor.
    const res2 = await flushQueue(async () => { /* succeeds */ });
    expect(res2).toEqual({ sent: 1, left: 0 });
    expect(pendingCount()).toBe(0);
    expect(calls).toBe(2);
  });

  it("no-ops cleanly on an empty queue", async () => {
    expect(await flushQueue(async () => { throw new Error("should not be called"); })).toEqual({ sent: 0, left: 0 });
  });

  it("serializes overlapping flushes so an item is never sent twice", async () => {
    enqueueNote("w1", "a");
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const sent: string[] = [];
    const send = async (n: PendingNote) => { sent.push(n.body); await gate; };
    const f1 = flushQueue(send);   // starts, parks mid-send of "a"
    const f2 = flushQueue(send);   // overlapping request — must not re-send "a"
    open();
    await Promise.all([f1, f2]);
    expect(sent).toEqual(["a"]);
    expect(pendingCount()).toBe(0);
  });

  it("doesn't lose a note captured during an in-flight flush", async () => {
    enqueueNote("w1", "first");
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const sent: string[] = [];
    let concurrent = false;
    const send = async (n: PendingNote) => {
      sent.push(n.body);
      if (n.body === "first" && !concurrent) {
        concurrent = true;
        enqueueNote("w1", "second");  // a second capture lands mid-flush…
        void flushQueue(send);        // …and asks to sync (the real captureNote path)
        await gate;
      }
    };
    const f = flushQueue(send);
    open();
    await f;
    await new Promise((r) => setTimeout(r, 0)); // let the coalesced follow-up run
    expect(sent).toEqual(["first", "second"]);
    expect(pendingCount()).toBe(0);
  });
});
