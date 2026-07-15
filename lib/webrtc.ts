import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ICE_SERVERS } from "./constants";

type Signal = {
  from: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

interface PeerOptions {
  supabase: SupabaseClient;
  lobbyId: string;
  /** My user id. */
  userId: string;
  /** The other participant's user id. */
  remoteId: string;
  /** The creator is the WebRTC initiator (impolite peer). */
  initiator: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onStatusChange?: (status: string) => void;
}

/**
 * 1:1 WebRTC peer connection with signaling relayed through a shared Supabase
 * Realtime broadcast channel. Both peers subscribe to the SAME channel name
 * (derived from the lobby id), so each side's broadcast reaches the other.
 * `self: false` stops us hearing our own echoes.
 *
 * Negotiation uses the canonical "perfect negotiation" pattern so that
 * connection succeeds no matter which peer joins first or how the tracks are
 * added: only the impolite peer (creator) can win an offer collision; the
 * polite peer (guest) rolls back and accepts. This fixes the previous bug
 * where the single offer was sent before the guest had subscribed to the
 * channel and then could never be retried.
 *
 * Mic/camera privacy: Mute / Hide do NOT merely flip `track.enabled` (that
 * keeps the device powered on and the OS camera/mic indicator lit). Instead we
 * physically STOP the track and detach it with `replaceTrack(null)`, which
 * truly releases the hardware. Unmuting/showing re-acquires a fresh track and
 * re-attaches it — no renegotiation required because the m-line already exists.
 */
export class Peer {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;
  private remoteId: string;
  private myUserId: string;
  private initiator: boolean;
  /** The guest is the polite peer; the creator is impolite. */
  private polite: boolean;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onStatusChange?: (status: string) => void;
  private makingOffer = false;
  private ignoreOffer = false;
  private remotePresent = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private micMuted = false;
  private camHidden = false;

  constructor(opts: PeerOptions) {
    this.supabase = opts.supabase;
    this.myUserId = opts.userId;
    this.remoteId = opts.remoteId;
    this.initiator = opts.initiator;
    this.polite = !opts.initiator;
    this.onRemoteStream = opts.onRemoteStream;
    this.onStatusChange = opts.onStatusChange;

    this.channel = opts.supabase.channel(`rtc-${opts.lobbyId}`, {
      config: { broadcast: { self: false }, presence: { key: opts.userId } },
    });

    this.channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      const sig = payload as Signal;
      if (sig.from === this.myUserId) return;
      void this.handleSignal(sig);
    });

    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState<{ key: string }>();
      this.remotePresent = Object.keys(state).includes(this.remoteId);
      // Make sure the peer connection exists as soon as we know the remote is
      // around; negotiationneeded will fire the first offer.
      this.ensurePeer();
    });

    this.channel.subscribe((status) => {
      this.onStatusChange?.(`channel:${status}`);
    });

    void this.init();
  }

  async init() {
    await this.ensureLocalStream();
    this.ensurePeer();
  }

  private async ensureLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    this.localStream = new MediaStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !this.camHidden,
        audio: !this.micMuted,
      });
      for (const track of stream.getTracks()) {
        this.localStream.addTrack(track);
      }
    } catch (err) {
      console.warn("getUserMedia failed (continuing without media):", err);
    }
    return this.localStream;
  }

  async getLocalStream(): Promise<MediaStream | null> {
    await this.ensureLocalStream();
    return this.localStream;
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 4,
    });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        const sender = pc.addTrack(track, this.localStream);
        if (track.kind === "audio") this.audioSender = sender;
        if (track.kind === "video") this.videoSender = sender;
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) this.onRemoteStream?.(stream);
    };

    pc.onconnectionstatechange = () => {
      this.onStatusChange?.(`peer:${pc.connectionState}`);
    };

    // Perfect negotiation: either side may (re)negotiate; collisions resolved.
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        this.send({ description: pc.localDescription!.toJSON() });
      } catch (err) {
        console.warn("Negotiation failed:", err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc = pc;
    this.flushPendingCandidates();
    return pc;
  }

  private send(sig: Omit<Signal, "from">) {
    this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...sig, from: this.myUserId },
    });
  }

  private async handleSignal(sig: Signal) {
    const pc = this.ensurePeer();
    if (pc.signalingState === "closed") return;
    try {
      if (sig.description) {
        const desc = sig.description;
        const offerCollision =
          desc.type === "offer" &&
          (this.makingOffer || pc.signalingState !== "stable");
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;

        await pc.setRemoteDescription(desc); // auto-rolls back if needed
        this.flushPendingCandidates();

        if (desc.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          this.send({ description: pc.localDescription!.toJSON() });
        }
      } else if (sig.candidate) {
        try {
          await pc.addIceCandidate(sig.candidate);
        } catch (err) {
          if (!this.ignoreOffer) console.warn("ICE add failed:", err);
        }
      }
    } catch (err) {
      console.warn("handleSignal failed:", err);
    }
  }

  private flushPendingCandidates() {
    if (!this.pc?.remoteDescription) return;
    const pc = this.pc;
    for (const c of this.pendingCandidates) {
      pc.addIceCandidate(c).catch(() => {});
    }
    this.pendingCandidates = [];
  }

  /** Mute/unmute the microphone. When muted, the device is fully released. */
  async setLocalMuted(muted: boolean): Promise<void> {
    this.micMuted = muted;
    if (muted) {
      this.localStream?.getAudioTracks().forEach((t) => t.stop());
      this.localStream
        ?.getTracks()
        .filter((t) => t.kind === "audio")
        .forEach((t) => this.localStream!.removeTrack(t));
      await this.audioSender?.replaceTrack(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];
        if (track) {
          this.localStream?.addTrack(track);
          await this.audioSender?.replaceTrack(track);
        }
      } catch (err) {
        console.warn("Could not re-acquire mic:", err);
      }
    }
  }

  /** Hide/show the camera. When hidden, the device is fully released. */
  async setLocalVideoHidden(hidden: boolean): Promise<void> {
    this.camHidden = hidden;
    if (hidden) {
      this.localStream?.getVideoTracks().forEach((t) => t.stop());
      this.localStream
        ?.getTracks()
        .filter((t) => t.kind === "video")
        .forEach((t) => this.localStream!.removeTrack(t));
      await this.videoSender?.replaceTrack(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        if (track) {
          this.localStream?.addTrack(track);
          await this.videoSender?.replaceTrack(track);
        }
      } catch (err) {
        console.warn("Could not re-acquire camera:", err);
      }
    }
  }

  close() {
    try {
      this.channel.unsubscribe();
    } catch {
      /* noop */
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onnegotiationneeded = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.audioSender = null;
    this.videoSender = null;
  }
}
