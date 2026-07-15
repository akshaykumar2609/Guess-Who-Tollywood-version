import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ICE_SERVERS } from "./constants";

type Signal =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

interface PeerOptions {
  supabase: SupabaseClient;
  lobbyId: string;
  /** My user id. */
  userId: string;
  /** The other participant's user id. */
  remoteId: string;
  /** The creator is the WebRTC initiator (creates the offer). */
  initiator: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onStatusChange?: (status: string) => void;
}

/**
 * Minimal 1:1 WebRTC peer connection with signaling relayed through a shared
 * Supabase Realtime broadcast channel (no dedicated signaling server needed).
 *
 * Both peers subscribe to the SAME channel name derived from the lobby id, so
 * each side's broadcast reaches the other. `self: false` stops us hearing our
 * own echoes. To avoid "glare" (both sides sending offers) only the lobby
 * creator initiates the offer; the guest answers. Presence is used to wait
 * until the remote peer is actually subscribed before the creator offers.
 */
export class Peer {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteId: string;
  private myUserId: string;
  private initiator: boolean;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onStatusChange?: (status: string) => void;
  private started = false;
  private remotePresent = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(opts: PeerOptions) {
    this.supabase = opts.supabase;
    this.myUserId = opts.userId;
    this.remoteId = opts.remoteId;
    this.initiator = opts.initiator;
    this.onRemoteStream = opts.onRemoteStream;
    this.onStatusChange = opts.onStatusChange;

    // Shared channel so both peers receive each other's signals.
    this.channel = opts.supabase.channel(`rtc-${opts.lobbyId}`, {
      config: { broadcast: { self: false }, presence: { key: opts.userId } },
    });

    this.channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const sig = payload as Signal & { from: string };
      if (sig.from === this.myUserId) return;
      void this.handleSignal(sig);
    });

    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState<{ key: string }>();
      const keys = Object.keys(state);
      this.remotePresent = keys.includes(this.remoteId);
      if (this.remotePresent && this.initiator && this.initialized && !this.started) {
        void this.start();
      }
    });

    this.channel.subscribe((status) => {
      this.onStatusChange?.(`channel:${status}`);
    });

    // Acquire local media + build the peer connection as soon as we exist.
    void this.init();
  }

  /** Acquire local media and build the RTCPeerConnection with local tracks. */
  async init() {
    if (this.initialized) return;
    this.initialized = true;
    await this.getLocalStream();
    this.ensurePeer();
    if (this.initiator && this.remotePresent && !this.started) {
      void this.start();
    }
  }

  private initialized = false;

  /** Acquire the local camera + mic. Resolves once available. */
  async getLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      // Fall back to audio-only so the game still works without a camera.
      console.warn("getUserMedia video failed, trying audio only:", err);
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
    }
    return this.localStream;
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      this.onRemoteStream?.(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      this.onStatusChange?.(`peer:${pc.connectionState}`);
    };

    this.pc = pc;
    // Flush any ICE candidates that arrived before remoteDescription was set.
    if (this.pendingCandidates.length) {
      for (const c of this.pendingCandidates) void pc.addIceCandidate(c);
      this.pendingCandidates = [];
    }
    return pc;
  }

  private send(sig: Signal) {
    this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...sig, from: this.myUserId },
    });
  }

  /** Begin negotiation (initiator only; guest waits for the offer). */
  async start() {
    if (this.started) return;
    this.started = true;
    // init() has already built the pc with local tracks; just send the offer.
    const pc = this.ensurePeer();
    if (!this.initiator) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ description: pc.localDescription!.toJSON() });
  }

  private async handleSignal(sig: Signal & { from: string }) {
    const pc = this.ensurePeer();
    if ("description" in sig) {
      await pc.setRemoteDescription(sig.description);
      // Apply any queued ICE candidates now that remote description is set.
      for (const c of this.pendingCandidates) {
        try {
          await pc.addIceCandidate(c);
        } catch (err) {
          console.warn("Queued ICE add failed:", err);
        }
      }
      this.pendingCandidates = [];
      if (sig.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ description: pc.localDescription!.toJSON() });
      }
    } else if ("candidate" in sig) {
      // Buffer candidates if remote description isn't ready yet.
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(sig.candidate);
      } else {
        try {
          await pc.addIceCandidate(sig.candidate);
        } catch (err) {
          console.warn("Failed to add ICE candidate:", err);
        }
      }
    }
  }

  setLocalMuted(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
  }

  setLocalVideoHidden(hidden: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => (t.enabled = !hidden));
    }
  }

  close() {
    this.channel.unsubscribe();
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}
