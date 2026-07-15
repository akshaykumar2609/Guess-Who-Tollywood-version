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
 * creator initiates the offer; the guest answers.
 *
 * Mic/camera privacy:
 *  - Mute / hide do NOT merely flip `track.enabled` (that keeps the device
 *    powered on and the OS camera/mic indicator lit). Instead we physically
 *    STOP the track and detach it from the sender with `replaceTrack(null)`,
 *    which truly releases the hardware. Unmuting/showing re-acquires a fresh
 *    track and re-attaches it — no renegotiation required because the m-line
 *    already exists.
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
  private onRemoteStream?: (stream: MediaStream) => void;
  private onStatusChange?: (status: string) => void;
  private started = false;
  private remotePresent = false;
  private makingOffer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private micMuted = false;
  private camHidden = false;

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
      this.remotePresent = Object.keys(state).includes(this.remoteId);
      if (this.remotePresent && this.initiator) this.maybeOffer();
    });

    this.channel.subscribe((status) => {
      this.onStatusChange?.(`channel:${status}`);
    });

    // Acquire local media + build the peer connection as soon as we exist.
    void this.init();
  }

  /** Acquire local media and build the RTCPeerConnection with local tracks. */
  async init() {
    if (this.pc) return;
    await this.ensureLocalStream();
    this.ensurePeer();
    // If the remote is already present, kick off negotiation.
    if (this.initiator && this.remotePresent) this.maybeOffer();
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

  /** Returns the current local stream (may have no tracks if denied). */
  async getLocalStream(): Promise<MediaStream | null> {
    await this.ensureLocalStream();
    return this.localStream;
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add whatever local tracks we currently have and remember the senders so
    // we can later replace/remove them without touching the m-line.
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
      this.onRemoteStream?.(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      this.onStatusChange?.(`peer:${pc.connectionState}`);
    };

    // Defensive renegotiation (e.g. if a browser decides the m-line changed).
    pc.onnegotiationneeded = async () => {
      if (!this.initiator || this.makingOffer) return;
      this.maybeOffer();
    };

    this.pc = pc;
    if (this.pendingCandidates.length) {
      for (const c of this.pendingCandidates) void pc.addIceCandidate(c);
      this.pendingCandidates = [];
    }
    return pc;
  }

  private async maybeOffer() {
    if (this.started || !this.initiator) return;
    const pc = this.ensurePeer();
    if (!pc) return;
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.send({ description: pc.localDescription!.toJSON() });
      this.started = true;
    } catch (err) {
      console.warn("createOffer failed:", err);
    } finally {
      this.makingOffer = false;
    }
  }

  private send(sig: Signal) {
    this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...sig, from: this.myUserId },
    });
  }

  private async handleSignal(sig: Signal & { from: string }) {
    const pc = this.ensurePeer();
    if ("description" in sig) {
      await pc.setRemoteDescription(sig.description);
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

  /** Mute/unmute the microphone. When muted, the device is fully released. */
  async setLocalMuted(muted: boolean): Promise<void> {
    this.micMuted = muted;
    if (muted) {
      // Stop the audio track AND detach it so the OS mic indicator turns off.
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
    this.channel.unsubscribe();
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.audioSender = null;
    this.videoSender = null;
  }
}
