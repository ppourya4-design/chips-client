// Desktop message dispatcher adapted from gateway/src/index.ts (WebSpeak3, MIT).
// No TeamSpeak protocol is implemented here: commands go to the unchanged sidecar.
import { Ts3Connection, type SpawnConnector, type ServerType } from "./connection";

const HOST_PATTERN = /^[\p{L}\p{N}._\-:[\]]{1,253}$/u;
const SERVER_TYPES = new Set<ServerType>(["teamspeak", "teaspeak", "auto"]);

export class DesktopSocket {
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  readyState: number = WebSocket.CONNECTING;
  private connection?: Ts3Connection;
  private pending = Promise.resolve();
  private spawn: SpawnConnector;

  constructor(spawn: SpawnConnector) {
    this.spawn = spawn;
    queueMicrotask(() => {
      if (this.readyState !== WebSocket.CONNECTING) return;
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
      this.emit({ type: "hello", features: ["clientVolume", "chunkedUpload", "whisperPolicy", "transferLimit"], iceServers: [] });
    });
  }

  private emit(message: unknown) {
    if (this.readyState === WebSocket.OPEN) this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  send(raw: string): void {
    if (this.readyState !== WebSocket.OPEN) return;
    this.pending = this.pending.then(async () => {
      const msg = JSON.parse(raw);
      await this.dispatch(msg);
    }).catch(() => this.emit({type: "error", message: "Desktop bridge could not process message"}));
  }

  close(): void {
    if (this.readyState === WebSocket.CLOSED || this.readyState === WebSocket.CLOSING) return;
    this.readyState = WebSocket.CLOSING;
    this.pending = this.pending.then(async () => {
      await this.connection?.disconnect();
      this.connection = undefined;
    }).catch(() => {}).finally(() => {
      this.readyState = WebSocket.CLOSED;
      this.onclose?.({} as CloseEvent);
    });
  }

  private async dispatch(msg: any): Promise<void> {
    let connection = this.connection;
    switch (msg.type) {
      case "connect": {
        if (typeof msg.host !== "string" || !HOST_PATTERN.test(msg.host) || msg.host.startsWith("-") ||
            typeof msg.nickname !== "string" || !msg.nickname.trim() || msg.nickname.length > 100 || /[\p{Cc}]/u.test(msg.nickname)) {
          this.emit({ type: "error", message: "Invalid server address or nickname." });
          break;
        }
        await connection?.disconnect();
        const serverType = SERVER_TYPES.has(msg.serverType) ? msg.serverType : undefined;
        const privilegeKey = typeof (msg.privilegeKey ?? msg.token) === "string" ? (msg.privilegeKey ?? msg.token).trim() || undefined : undefined;
        connection = new Ts3Connection({ host: msg.host, nickname: msg.nickname, serverPassword: msg.serverPassword,
          channelPassword: msg.channelPassword, defaultChannel: msg.defaultChannel, identity: msg.identity, serverType, privilegeKey }, this.spawn, () => this.close());
        this.connection = connection;
        connection.onEvent((event) => this.emit(event));
        try {
          await connection.connect();
        } catch {
          this.emit({ type: "error", message: "Connector failed to start." });
          this.connection = undefined;
        }
        break;
      }
      case "switchChannel": {
        const channelId = Number(msg.channelId);
        if (Number.isFinite(channelId)) {
          await connection?.switchChannel(channelId, msg.channelPassword);
        }
        break;
      }
      case "moveClient": {
        const clientId = Number(msg.clientId);
        const channelId = Number(msg.channelId);
        if (Number.isFinite(clientId) && Number.isFinite(channelId)) {
          await connection?.moveClient(clientId, channelId, msg.channelPassword);
        }
        break;
      }
      case "sendChatMessage": {
        await connection?.sendChatMessage(msg.message);
        break;
      }
      case "sendServerMessage": {
        await connection?.sendServerMessage(msg.message);
        break;
      }
      case "sendPrivateMessage": {
        await connection?.sendPrivateMessage(msg.clientId, msg.message);
        break;
      }
      case "sendPoke": {
        await connection?.sendPoke(msg.clientId, msg.message ?? "");
        break;
      }
      case "sendAudio": {
        await connection?.sendAudio(msg.pcm);
        break;
      }
      case "requestStreamInfo": {
        const clientId = Number(msg.clientId);
        if (Number.isFinite(clientId)) await connection?.requestStreamInfo(clientId);
        break;
      }
      case "joinStream": {
        const clientId = Number(msg.clientId);
        if (Number.isFinite(clientId)) {
          await connection?.joinStream(String(msg.streamId ?? ""), clientId, msg.message ?? "");
        }
        break;
      }
      case "leaveStream": {
        const clientId = Number(msg.clientId);
        if (Number.isFinite(clientId)) {
          await connection?.leaveStream(String(msg.streamId ?? ""), clientId);
        }
        break;
      }
      case "streamSignal": {
        const clientId = Number(msg.clientId);
        if (Number.isFinite(clientId) && msg.payload !== undefined) {
          await connection?.sendStreamSignal(String(msg.streamId ?? ""), clientId, msg.payload);
        }
        break;
      }
      case "setupStream": {
        await connection?.setupStream({
          name: String(msg.name ?? "Stream"),
          type: Number(msg.streamType ?? 3),
          bitrate: Number(msg.bitrate ?? 1_500_000),
          accessibility: Number(msg.accessibility ?? 1),
          mode: Number(msg.mode ?? 1),
          viewerLimit: Number(msg.viewerLimit ?? 0),
          audio: Boolean(msg.audio),
        });
        break;
      }
      case "respondJoinStream": {
        const clientId = Number(msg.clientId);
        if (Number.isFinite(clientId)) {
          await connection?.respondJoinStream(
            String(msg.streamId ?? ""),
            clientId,
            Boolean(msg.accept),
            String(msg.offer ?? ""),
            String(msg.message ?? ""),
          );
        }
        break;
      }
      case "stopStream": {
        await connection?.stopStream(String(msg.streamId ?? ""), String(msg.reason ?? ""));
        break;
      }
      case "setAway": {
        await connection?.setAway(msg.away, msg.message ?? "");
        break;
      }
      case "setInputMuted": {
        await connection?.setInputMuted(msg.muted);
        break;
      }
      case "setOutputMuted": {
        await connection?.setOutputMuted(msg.muted);
        break;
      }
      case "setClientVolume": {
        connection?.setClientVolume(Number(msg.clientId), Number(msg.volume));
        break;
      }
      case "setNickname": {
        await connection?.setNickname(msg.nickname);
        break;
      }
      case "setWhisperPolicy": {
        connection?.setWhisperPolicy(msg.block === true, Array.isArray(msg.exceptions) ? msg.exceptions : []);
        break;
      }
      case "setWhisperTargets": {
        await connection?.setWhisperTargets(msg.channelIds ?? [], msg.clientIds ?? []);
        break;
      }
      case "getClientConnectionInfo": {
        await connection?.getClientConnectionInfo(msg.clientId);
        break;
      }
      case "getServerConnectionInfo": {
        await connection?.getServerConnectionInfo();
        break;
      }
      case "kickFromChannel": {
        await connection?.kickFromChannel(msg.clientId, msg.reason ?? "");
        break;
      }
      case "kickFromServer": {
        await connection?.kickFromServer(msg.clientId, msg.reason ?? "");
        break;
      }
      case "banClient": {
        await connection?.banClient(msg.clientId, msg.seconds ?? 0, msg.reason ?? "");
        break;
      }
      case "editServer": {
        await connection?.editServer(msg.payload ?? {});
        break;
      }
      case "getServerLog": {
        await connection?.getServerLog();
        break;
      }
      case "getBanList": {
        await connection?.getBanList();
        break;
      }
      case "deleteBan": {
        await connection?.deleteBan(msg.banId);
        break;
      }
      case "deleteAllBans": {
        await connection?.deleteAllBans();
        break;
      }
      case "getComplainList": {
        await connection?.getComplainList();
        break;
      }
      case "deleteComplaint": {
        await connection?.deleteComplaint(msg.targetClientDbId, msg.fromClientDbId);
        break;
      }
      case "deleteAllComplaintsFor": {
        await connection?.deleteAllComplaintsFor(msg.targetClientDbId);
        break;
      }
      case "getOfflineMessageList": {
        await connection?.getOfflineMessageList();
        break;
      }
      case "getOfflineMessage": {
        await connection?.getOfflineMessage(msg.messageId);
        break;
      }
      case "sendOfflineMessage": {
        await connection?.sendOfflineMessage(msg.clientUid, msg.subject, msg.message);
        break;
      }
      case "deleteOfflineMessage": {
        await connection?.deleteOfflineMessage(msg.messageId);
        break;
      }
      case "markOfflineMessageRead": {
        await connection?.markOfflineMessageRead(msg.messageId);
        break;
      }
      case "getChannelGroupList": {
        await connection?.getChannelGroupList();
        break;
      }
      case "getServerGroupList": {
        await connection?.getServerGroupList();
        break;
      }
      case "setChannelGroup": {
        await connection?.setChannelGroup(msg.channelGroupId, msg.channelId, msg.clientDbId);
        break;
      }
      case "addServerGroup": {
        await connection?.addServerGroup(msg.serverGroupId, msg.clientDbId);
        break;
      }
      case "removeServerGroup": {
        await connection?.removeServerGroup(msg.serverGroupId, msg.clientDbId);
        break;
      }
      case "serverQueryLogin": {
        await connection?.serverQueryLogin(msg.username, msg.password);
        break;
      }
      case "getPermissionOverview": {
        await connection?.getPermissionOverview();
        break;
      }
      case "getFileList": {
        await connection?.getFileList(msg.channelId, msg.path);
        break;
      }
      case "createDirectory": {
        await connection?.createDirectory(msg.channelId, msg.dirname);
        break;
      }
      case "deleteFile": {
        await connection?.deleteFile(msg.channelId, msg.name);
        break;
      }
      case "renameFile": {
        await connection?.renameFile(msg.channelId, msg.oldName, msg.newName);
        break;
      }
      case "downloadFile": {
        await connection?.downloadFile(msg.channelId, msg.path);
        break;
      }
      case "setTransferLimit": {
        connection?.setTransferLimit(msg.up, msg.down);
        break;
      }
      case "uploadFile": {
        await connection?.uploadFile(msg.channelId, msg.path, msg.dataBase64);
        break;
      }
      case "uploadFileChunk": {
        await connection?.uploadFileChunk(msg.channelId, msg.path, msg.offset, msg.total, msg.data);
        break;
      }
      case "getPermissionCatalog": {
        await connection?.getPermissionCatalog();
        break;
      }
      case "getPermList": {
        await connection?.getPermList(msg.scope, msg.id1, msg.id2);
        break;
      }
      case "addPermission": {
        await connection?.addPermission(msg.scope, msg.ids, msg.permId, msg.value, msg.negated, msg.skip);
        break;
      }
      case "removePermission": {
        await connection?.removePermission(msg.scope, msg.ids, msg.permId);
        break;
      }
      case "disconnect": {
        await connection?.disconnect(msg.message ?? "");
        this.connection = undefined;
        break;
      }
      default:
        this.emit({ type: "error", message: `Unknown message type: ${msg.type}` });
    }
  }
}
