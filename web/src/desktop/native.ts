import { Channel, invoke } from "@tauri-apps/api/core";
import type { SpawnConnector } from "./connection";

type SidecarEvent = { type: "line"; line: string } | { type: "exit"; code: number | null };

/** Native commands own lifecycle; the webview never chooses a binary or flags. */
export const spawnConnector: SpawnConnector = async (options, onLine, onExit) => {
  const id = crypto.randomUUID();
  const events = new Channel<SidecarEvent>();
  events.onmessage = (event) => {
    if (event.type === "line") onLine(event.line);
    else onExit(event.code);
  };
  await invoke("start_connector", { id, options, events });
  return {
    write: (line) => invoke<void>("write_connector", { id, line }),
    stop: (message) => invoke<void>("stop_connector", { id, message }),
  };
};
