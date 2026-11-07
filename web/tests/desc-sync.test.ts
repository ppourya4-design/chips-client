import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDescriptionSync } from "../src/descSync";

// Deterministic clock + scheduler so the pacing rules are tested exactly,
// with no real timers.
function fakeClock() {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    cancel: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance: (ms: number) => {
      const target = t + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | null = null;
        for (const entry of timers) {
          if (entry[1].at <= target && (due === null || entry[1].at < due[1].at)) due = entry;
        }
        if (due === null) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = target;
    },
  };
}

function rig(minIntervalMs = 100) {
  const sent: string[] = [];
  const clock = fakeClock();
  const sync = createDescriptionSync((d) => sent.push(d), {
    minIntervalMs,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  return { sent, clock, sync };
}

test("first request sends immediately; identical repeats are dropped", () => {
  const { sent, clock, sync } = rig();
  sync.request("desc-a");
  sync.request("desc-a");
  clock.advance(1000);
  sync.request("desc-a");
  assert.deepEqual(sent, ["desc-a"]);
});

test("a burst inside the interval collapses to the latest value, sent once", () => {
  const { sent, clock, sync } = rig();
  sync.request("a");
  clock.advance(10);
  sync.request("b");
  sync.request("c");
  sync.request("d");
  assert.deepEqual(sent, ["a"]);
  clock.advance(89);
  assert.deepEqual(sent, ["a"]);
  clock.advance(1);
  assert.deepEqual(sent, ["a", "d"]);
});

test("sends stay spaced by the full interval after a trailing send", () => {
  const { sent, clock, sync } = rig();
  sync.request("a");
  sync.request("b");
  clock.advance(100);
  assert.deepEqual(sent, ["a", "b"]);
  sync.request("c");
  clock.advance(99);
  assert.deepEqual(sent, ["a", "b"]);
  clock.advance(1);
  assert.deepEqual(sent, ["a", "b", "c"]);
});

test("a value equal to the pending one does not queue a second send", () => {
  const { sent, clock, sync } = rig();
  sync.request("a");
  sync.request("b");
  sync.request("b");
  clock.advance(500);
  assert.deepEqual(sent, ["a", "b"]);
});

test("reset drops the pending value and forgets what was sent", () => {
  const { sent, clock, sync } = rig();
  sync.request("a");
  sync.request("b");
  sync.reset();
  clock.advance(1000);
  assert.deepEqual(sent, ["a"]);
  // After a reset (e.g. reconnect) the same description must go out again.
  sync.request("a");
  assert.deepEqual(sent, ["a", "a"]);
});
