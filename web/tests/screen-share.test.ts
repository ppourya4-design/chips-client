import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  SigChannel,
  SigCursor,
  shareRoomForChannel,
  type SigMessage,
  type SigPeer,
} from "../src/screenShare";

const msg = (id: number, from = "u-other"): SigMessage => ({
  id,
  from,
  to: "u-me",
  kind: "ice",
  payload: { candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" },
});

test("shareRoomForChannel names the room after the channel", () => {
  assert.equal(shareRoomForChannel(109), "chan-109");
  assert.equal(shareRoomForChannel(0), "chan-0");
});

test("SigCursor advances and deduplicates at-least-once replays", () => {
  const c = new SigCursor();
  const first = c.accept([msg(1), msg(2)], 2);
  assert.equal(first.length, 2);
  assert.equal(c.since, 2);
  // Same window delivered again after a re-poll with an old cursor.
  const replay = c.accept([msg(1), msg(2), msg(3)], 3);
  assert.deepEqual(
    replay.map((m) => m.id),
    [3],
  );
  assert.equal(c.since, 3);
  // A stale `next` never moves the cursor backwards.
  c.accept([], 1);
  assert.equal(c.since, 3);
});

test("SigChannel polls, reports peers, skips own messages, dedupes", async () => {
  const peers: SigPeer[] = [{ name: "u-other", sharing: true }];
  const body = JSON.stringify({ messages: [msg(1), msg(2, "u-me")], peers, next: 2 });
  const fakeFetch = (async () =>
    new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

  const received: SigMessage[] = [];
  let peerReports = 0;
  const ch = new SigChannel(
    "chan-1",
    "u-me",
    (m) => received.push(m),
    () => {
      peerReports += 1;
    },
    fakeFetch,
  );
  ch.start();
  // Let the loop turn a few times against the instant fake server.
  await new Promise((r) => setTimeout(r, 30));
  ch.stop();
  assert.equal(received.length, 1);
  assert.equal(received[0].id, 1);
  assert.ok(peerReports >= 1);
});

test("SigChannel.stop ends the loop without throwing", async () => {
  const hangingFetch = (async () => new Promise<Response>(() => {})) as unknown as typeof fetch;
  const ch = new SigChannel("chan-1", "u-me", () => {}, () => {}, hangingFetch);
  ch.start();
  ch.stop();
  await new Promise((r) => setTimeout(r, 10));
});
