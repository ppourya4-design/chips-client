/**
 * Chips screen share — WebRTC between Chips clients in the same TS channel.
 *
 * NOT the TeamSpeak protocol: TeaSpeak speaks TS3, which has no screen
 * sharing. Instead, peers in a channel meet in a signaling room on the
 * Chips media host (`POST /sig/send` + long-poll `GET /sig/poll`, see the
 * endpoint's API.md) and connect peer-to-peer; the media never touches any
 * server. Only Chips clients see any of this — native TS clients are
 * completely unaffected.
 *
 * Protocol (relay kinds are limited to offer/answer/ice/presence/bye):
 * - Everyone in the channel joins room `chan-<channelId>` and polls it,
 *   which keeps them in the room's peer table.
 * - A publisher sends `presence {sharing:true}` and broadcasts an
 *   `offer`-kind announcement `{announce:true, name, uid}` so peers learn
 *   who is sharing (presence itself carries no names). Both repeat ~25 s.
 * - A viewer opens the connection: it creates the peer connection with
 *   recvonly transceivers and sends the publisher an `offer {sdp, name}`.
 * - The publisher adds the captured tracks, answers `{sdp, name}`, and
 *   both sides trickle `ice {candidate, sdpMid, sdpMLineIndex}`.
 * - `bye` from either side tears that pair down; a broadcast `bye` from
 *   the publisher ends the share for every watcher.
 *
 * Resilience: the poll loop backs off and resumes with the same cursor
 * (delivery is at-least-once inside the relay's 120 s TTL, so messages are
 * deduplicated by id). A viewer whose ICE drops re-offers with an ICE
 * restart a bounded number of times before reporting failure.
 */

import { MEDIA_BASE, mediaToken } from "./media";

export const SHARE_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const PEER_ID_KEY = "chips:peer-id";
const PEER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** This installation's persistent signaling name (`u-xxxxxxxxxx`). */
export function loadPeerId(): string {
  try {
    const saved = localStorage.getItem(PEER_ID_KEY);
    if (saved && PEER_ID_RE.test(saved)) return saved;
    const id = `u-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(PEER_ID_KEY, id);
    return id;
  } catch {
    return `u-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function shareRoomForChannel(channelId: number): string {
  return `chan-${channelId}`;
}

export type SigKind = "offer" | "answer" | "ice" | "presence" | "bye";

export interface SigMessage {
  id: number;
  from: string;
  to: string;
  kind: SigKind;
  payload: Record<string, unknown> | null;
}

export interface SigPeer {
  name: string;
  sharing: boolean;
}

/** Cursor + dedupe for the at-least-once poll stream. Pure and testable. */
export class SigCursor {
  since = 0;
  private seen = new Set<number>();

  /** Feed one poll response's `next`; returns only the messages not seen yet. */
  accept(messages: SigMessage[], next: number): SigMessage[] {
    const fresh = messages.filter((m) => !this.seen.has(m.id));
    for (const m of messages) this.seen.add(m.id);
    if (next > this.since) this.since = next;
    if (this.seen.size > 400) {
      this.seen = new Set([...this.seen].slice(-200));
    }
    return fresh;
  }
}

type FetchFn = typeof fetch;

export class SigChannel {
  readonly room: string;
  readonly me: string;
  private cursor = new SigCursor();
  private running = false;
  private abort: AbortController | null = null;
  private failures = 0;

  constructor(
    room: string,
    me: string,
    private onMessage: (msg: SigMessage) => void,
    private onPeers: (peers: SigPeer[]) => void,
    private fetchFn: FetchFn = fetch,
  ) {
    this.room = room;
    this.me = me;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
  }

  async send(to: string, kind: SigKind, payload: Record<string, unknown>): Promise<void> {
    const token = mediaToken();
    if (!token) throw new Error("media-token-missing");
    const res = await this.fetchFn(`${MEDIA_BASE}/sig/send`, {
      method: "POST",
      headers: { "X-Upload-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ room: this.room, from: this.me, to, kind, payload }),
    });
    if (!res.ok) throw new Error(`sig-send-${res.status}`);
  }

  presence(sharing: boolean): void {
    void this.send(this.me, "presence", { sharing }).catch(() => {
      /* the next poll touches presence anyway */
    });
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        this.abort = new AbortController();
        const token = mediaToken();
        const url = `${MEDIA_BASE}/sig/poll?room=${encodeURIComponent(this.room)}&me=${encodeURIComponent(this.me)}&since=${this.cursor.since}`;
        const res = await this.fetchFn(url, {
          headers: { "X-Upload-Token": token },
          signal: this.abort.signal,
        });
        if (!res.ok) throw new Error(`sig-poll-${res.status}`);
        const body = (await res.json()) as {
          messages?: SigMessage[];
          peers?: SigPeer[];
          next?: number;
        };
        this.failures = 0;
        if (Array.isArray(body.peers)) this.onPeers(body.peers);
        const fresh = this.cursor.accept(body.messages ?? [], body.next ?? this.cursor.since);
        for (const msg of fresh) {
          if (msg.from !== this.me) this.onMessage(msg);
        }
        // The server normally holds the poll ~20 s. If it ever answers
        // instantly (misconfig, captive portal), don't spin: always yield
        // a real pause between rounds.
        if (fresh.length === 0) {
          await new Promise((r) => setTimeout(r, 300));
        } else {
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch {
        if (!this.running) return;
        this.failures += 1;
        const wait = Math.min(2000 * this.failures, 10000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
}

export type PublishState = "idle" | "sharing";
export type ViewState = "idle" | "connecting" | "live" | "reconnecting" | "failed" | "ended";

export interface SharerInfo {
  peerId: string;
  name: string;
  sharing: boolean;
}

export interface ShareEvents {
  onPublishState: (state: PublishState) => void;
  onSharers: (sharers: SharerInfo[]) => void;
  onViewState: (peerId: string, state: ViewState) => void;
  onRemoteStream: (peerId: string, stream: MediaStream | null) => void;
}

const MAX_ICE_RESTARTS = 5;

export class ShareSession {
  private sig: SigChannel;
  private events: ShareEvents;
  private myName: string;
  private myUid: string;

  private localStream: MediaStream | null = null;
  private publishState: PublishState = "idle";
  private heartbeat: number | null = null;

  /** Publisher side: one peer connection per watcher. */
  private publishPcs = new Map<string, RTCPeerConnection>();
  private publishPendingIce = new Map<string, RTCIceCandidateInit[]>();

  /** Viewer side: at most one watched publisher in v1. */
  private viewPc: RTCPeerConnection | null = null;
  private viewPeer: string | null = null;
  private viewPendingIce: RTCIceCandidateInit[] = [];
  private viewRestarts = 0;
  private viewRestartTimer: number | null = null;

  private sharerNames = new Map<string, string>();
  private sharers: SharerInfo[] = [];

  constructor(opts: {
    channelId: number;
    peerId: string;
    name: string;
    uid: string;
    events: ShareEvents;
    fetchFn?: FetchFn;
  }) {
    this.events = opts.events;
    this.myName = opts.name;
    this.myUid = opts.uid;
    this.sig = new SigChannel(
      shareRoomForChannel(opts.channelId),
      opts.peerId,
      (msg) => void this.handleMessage(msg),
      (peers) => this.handlePeers(peers),
      opts.fetchFn,
    );
  }

  start(): void {
    this.sig.start();
    this.sig.presence(false);
  }

  /** Stop sharing, stop watching, leave the room. */
  dispose(): void {
    this.stopPublishing();
    this.stopViewing();
    this.sig.presence(false);
    this.sig.stop();
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
  }

  // ---------------------------------------------------------- publishing

  async startPublishing(): Promise<void> {
    if (this.publishState === "sharing") return;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => this.stopPublishing());
    }
    this.publishState = "sharing";
    this.events.onPublishState("sharing");
    this.announce();
    this.sig.presence(true);
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => {
      this.announce();
      this.sig.presence(true);
    }, 25000);
  }

  stopPublishing(): void {
    if (this.publishState !== "sharing") return;
    this.publishState = "idle";
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const peerId of this.publishPcs.keys()) {
      void this.sig.send(peerId, "bye", { ended: true }).catch(() => {});
    }
    void this.sig.send("*", "bye", { ended: true }).catch(() => {});
    for (const pc of this.publishPcs.values()) pc.close();
    this.publishPcs.clear();
    this.publishPendingIce.clear();
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.sig.presence(false);
    this.events.onPublishState("idle");
  }

  private announce(): void {
    void this.sig
      .send("*", "offer", { announce: true, name: this.myName, uid: this.myUid })
      .catch(() => {});
  }

  // ------------------------------------------------------------ viewing

  watch(peerId: string): void {
    if (this.viewPeer === peerId && this.viewPc) return;
    this.stopViewing();
    this.viewPeer = peerId;
    this.viewRestarts = 0;
    void this.openViewConnection(false);
  }

  stopViewing(): void {
    if (this.viewRestartTimer !== null) {
      window.clearTimeout(this.viewRestartTimer);
      this.viewRestartTimer = null;
    }
    if (this.viewPeer) {
      void this.sig.send(this.viewPeer, "bye", {}).catch(() => {});
      this.events.onRemoteStream(this.viewPeer, null);
      this.events.onViewState(this.viewPeer, "idle");
    }
    this.viewPc?.close();
    this.viewPc = null;
    this.viewPeer = null;
    this.viewPendingIce = [];
  }

  private async openViewConnection(iceRestart: boolean): Promise<void> {
    const peerId = this.viewPeer;
    if (!peerId) return;
    this.viewPc?.close();
    const pc = new RTCPeerConnection({ iceServers: SHARE_ICE_SERVERS });
    this.viewPc = pc;
    this.viewPendingIce = [];
    this.events.onViewState(peerId, iceRestart ? "reconnecting" : "connecting");

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    const remote = new MediaStream();
    pc.ontrack = (ev) => {
      remote.addTrack(ev.track);
      this.events.onRemoteStream(peerId, remote);
    };
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void this.sig
        .send(peerId, "ice", {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid ?? "0",
          sdpMLineIndex: ev.candidate.sdpMLineIndex ?? 0,
        })
        .catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (this.viewPc !== pc) return;
      if (pc.connectionState === "connected") {
        this.viewRestarts = 0;
        this.events.onViewState(peerId, "live");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        this.scheduleViewRestart(peerId);
      }
    };

    try {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      await this.sig.send(peerId, "offer", { sdp: offer.sdp ?? "", name: this.myName });
    } catch {
      this.events.onViewState(peerId, "failed");
    }
  }

  private scheduleViewRestart(peerId: string): void {
    if (this.viewPeer !== peerId || this.viewRestartTimer !== null) return;
    if (this.viewRestarts >= MAX_ICE_RESTARTS) {
      this.events.onViewState(peerId, "failed");
      return;
    }
    this.events.onViewState(peerId, "reconnecting");
    this.viewRestartTimer = window.setTimeout(() => {
      this.viewRestartTimer = null;
      if (this.viewPeer !== peerId) return;
      this.viewRestarts += 1;
      void this.openViewConnection(true);
    }, 3000);
  }

  // --------------------------------------------------------- message in

  private handlePeers(peers: SigPeer[]): void {
    const next: SharerInfo[] = peers
      .filter((p) => p.name !== this.sig.me)
      .map((p) => ({
        peerId: p.name,
        name: this.sharerNames.get(p.name) ?? p.name,
        sharing: p.sharing,
      }));
    this.sharers = next;
    this.events.onSharers(next);
    // If the publisher I was watching left or stopped, end the view.
    if (this.viewPeer) {
      const pub = next.find((s) => s.peerId === this.viewPeer);
      if (!pub || !pub.sharing) {
        const peerId = this.viewPeer;
        this.stopViewing();
        this.events.onViewState(peerId, "ended");
      }
    }
  }

  private async handleMessage(msg: SigMessage): Promise<void> {
    const payload = (msg.payload ?? {}) as Record<string, unknown>;

    if (msg.kind === "offer" && payload.announce === true) {
      if (typeof payload.name === "string" && payload.name) {
        this.sharerNames.set(msg.from, payload.name);
        this.handlePeers(this.sharers.map((s) => ({ name: s.peerId, sharing: s.sharing })));
      }
      return;
    }

    if (msg.kind === "bye") {
      if (this.viewPeer === msg.from || msg.to === "*") {
        const peerId = this.viewPeer;
        if (peerId) {
          this.stopViewing();
          this.events.onViewState(peerId, "ended");
        }
      }
      const pc = this.publishPcs.get(msg.from);
      if (pc) {
        pc.close();
        this.publishPcs.delete(msg.from);
        this.publishPendingIce.delete(msg.from);
      }
      return;
    }

    if (msg.kind === "ice") {
      const candidate: RTCIceCandidateInit = {
        candidate: String(payload.candidate ?? ""),
        sdpMid: typeof payload.sdpMid === "string" ? payload.sdpMid : "0",
        sdpMLineIndex: typeof payload.sdpMLineIndex === "number" ? payload.sdpMLineIndex : 0,
      };
      if (!candidate.candidate) return;
      if (this.viewPeer === msg.from && this.viewPc) {
        if (this.viewPc.remoteDescription) {
          await this.viewPc.addIceCandidate(candidate).catch(() => {});
        } else {
          this.viewPendingIce.push(candidate);
        }
      } else if (this.publishPcs.has(msg.from)) {
        const pc = this.publishPcs.get(msg.from)!;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate).catch(() => {});
        } else {
          const list = this.publishPendingIce.get(msg.from) ?? [];
          list.push(candidate);
          this.publishPendingIce.set(msg.from, list);
        }
      }
      return;
    }

    if (msg.kind === "offer" && typeof payload.sdp === "string") {
      // A viewer wants my screen.
      if (this.publishState !== "sharing" || !this.localStream) {
        await this.sig.send(msg.from, "bye", { refused: true }).catch(() => {});
        return;
      }
      await this.answerViewer(msg.from, payload.sdp);
      return;
    }

    if (msg.kind === "answer" && typeof payload.sdp === "string") {
      if (this.viewPeer !== msg.from || !this.viewPc) return;
      const pc = this.viewPc;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        for (const c of this.viewPendingIce) {
          await pc.addIceCandidate(c).catch(() => {});
        }
        this.viewPendingIce = [];
      } catch {
        this.scheduleViewRestart(msg.from);
      }
    }
  }

  private async answerViewer(peerId: string, sdp: string): Promise<void> {
    this.publishPcs.get(peerId)?.close();
    const pc = new RTCPeerConnection({ iceServers: SHARE_ICE_SERVERS });
    this.publishPcs.set(peerId, pc);
    for (const track of this.localStream?.getTracks() ?? []) {
      pc.addTrack(track, this.localStream!);
    }
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void this.sig
        .send(peerId, "ice", {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid ?? "0",
          sdpMLineIndex: ev.candidate.sdpMLineIndex ?? 0,
        })
        .catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        if (this.publishPcs.get(peerId) === pc) this.publishPcs.delete(peerId);
      }
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      for (const c of this.publishPendingIce.get(peerId) ?? []) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      this.publishPendingIce.delete(peerId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sig.send(peerId, "answer", { sdp: answer.sdp ?? "", name: this.myName });
    } catch {
      pc.close();
      if (this.publishPcs.get(peerId) === pc) this.publishPcs.delete(peerId);
    }
  }
}
