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
    return { write: async (line) => { await tick(); lines.push(line); }, stop: async () => { stopped = true; } };
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
  await new Promise((resolve) => setTimeout(resolve, 60));
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


test("connector exit propagates and closes the desktop socket", async () => {
  let exit!: (code: number | null) => void;
  const socket = new DesktopSocket(async (_options, _line, onExit) => {
    exit = onExit;
    return { write: async () => {}, stop: async () => {} };
  });
  const events: any[] = [];
  socket.onmessage = (ev) => events.push(JSON.parse(ev.data));
  await tick();
  socket.send(JSON.stringify({type: "connect", host: "wwts.ir:1694", nickname: "Ali"}));
  await tick();
  exit(1);
  await tick();
  assert.equal(events.at(-1).type, "error");
  assert.equal(socket.readyState, WebSocket.CLOSED);
});

test("profile descriptions flow both ways over the desktop bridge", async () => {
  // Step 5: the shipped app writes its [s:v1;…] style token into its own client
  // description and applies other clients' descriptions when the sidecar
  // reports a change - without reconnecting.
  const lines: string[] = [];
  let received: ((line: string) => void) | undefined;
  const spawn: SpawnConnector = async (_options, onLine) => {
    received = onLine;
    return { write: async (line) => { await tick(); lines.push(line); }, stop: async () => {} };
  };
  const socket = new DesktopSocket(spawn);
  const events: any[] = [];
  socket.onmessage = (ev) => events.push(JSON.parse(ev.data));
  await tick();
  socket.send(JSON.stringify({ type: "connect", host: "wwts.ir:1694", nickname: "Ali" }));
  await tick();
  received!(JSON.stringify({
    type: "channels",
    channels: [],
    clients: [{
      id: 4, channel: 1, name: "Ali", input_muted: false, output_muted: false,
      input_hardware_enabled: true, away: false, away_message: "", is_channel_commander: false,
      country: "", uid: "uid-4", database_id: 4, channel_group: 6, server_groups: [],
      has_talk_power: false, description: "[s:v1;fx=prism]",
    }],
    own_client_id: 4,
  }));
  const snapshot = events.find((event) => event.type === "channels");
  assert.equal(snapshot.clients[0].description, "[s:v1;fx=prism]");

  socket.send(JSON.stringify({ type: "setDescription", description: "[s:v1;fx=shimmer]" }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(lines, [`setdescription {"description":"[s:v1;fx=shimmer]"}\n`]);

  received!(JSON.stringify({ type: "clientDescriptionChanged", client_id: 7, description: "[s:v1;fx=solid]" }));
  assert.deepEqual(events.at(-1), {
    type: "clientDescriptionChanged",
    clientId: 7,
    description: "[s:v1;fx=solid]",
  });
  socket.close();
});
