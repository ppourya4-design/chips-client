import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DesktopSocket } from "../src/desktop/socket.ts";
import type { SpawnConnector } from "../src/desktop/connection.ts";

// DesktopSocket uses only the standard WebSocket ready-state constants.
Object.assign(globalThis, { WebSocket: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test("desktop bridge starts a connector, maps events and serializes commands", async () => {
  const lines: string[] = [];
  let received: ((line: string) => void) | undefined;
  let stopped = false;
  const spawn: SpawnConnector = async (options, onLine) => {
    assert.equal(options.host, "wwts.ir:1694");
    assert.equal(options.nickname, "Ali");
    received = onLine;
    return { write: async (line) => { lines.push(line); }, stop: async () => { stopped = true; } };
  };
  const socket = new DesktopSocket(spawn);
  const events: any[] = [];
  socket.onmessage = (ev) => events.push(JSON.parse(ev.data));
  await tick();
  socket.send(JSON.stringify({type: "connect", host: "wwts.ir:1694", nickname: "Ali"}));
  await tick();
  received!(JSON.stringify({type: "channels", channels: [{id: 1, parent: 0, order: 0, name: "Lobby", topic: "", codec: "Opus", max_clients: null, has_password: false}], clients: [], own_client_id: 4}));
  assert.equal(events.at(-1).channels[0].hasPassword, false);
  assert.equal(events.at(-1).ownClientId, 4);
  socket.send(JSON.stringify({type: "sendChatMessage", message: "hello\nworld"}));
  socket.send(JSON.stringify({type: "switchChannel", channelId: 3, channelPassword: "سلام"}));
  socket.send(JSON.stringify({type: "sendAudio", pcm: "QUJD"}));
  await tick();
  assert.deepEqual(lines, ["chat hello world\n", `switch 3 ${Buffer.from("سلام").toString("base64")}\n`, "audio QUJD\n"]);
  socket.close();
  await tick();
  assert.equal(stopped, true);
  assert.equal(socket.readyState, WebSocket.CLOSED);
});

test("closing during spawn still stops the resulting connector", async () => {
  let release!: () => void;
  let stopped = false;
  const wait = new Promise<void>((r) => { release = r; });
  const socket = new DesktopSocket(async () => { await wait; return {write: async () => {}, stop: async () => { stopped = true; }}; });
  await tick();
  socket.send(JSON.stringify({type: "connect", host: "wwts.ir:1694", nickname: "Ali"}));
  await tick();
  socket.close();
  release();
  await tick();
  assert.equal(stopped, true);
  assert.equal(socket.readyState, WebSocket.CLOSED);
});

test("invalid target is rejected without starting a process", async () => {
  let started = false;
  const socket = new DesktopSocket(async () => { started = true; throw new Error(); });
  const events: any[] = [];
  socket.onmessage = (ev) => events.push(JSON.parse(ev.data));
  await tick();
  socket.send(JSON.stringify({type: "connect", host: "--bad", nickname: "Ali"}));
  await tick();
  assert.equal(started, false);
  assert.equal(events.at(-1).type, "error");
  socket.close();
});
