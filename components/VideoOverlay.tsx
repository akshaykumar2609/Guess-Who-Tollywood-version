import { useEffect, useRef, useState } from "react";
import type { Peer } from "../lib/webrtc";

interface VideoOverlayProps {
  peer: Peer | null;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  statusLabel: string;
  selfName: string;
  remoteName: string;
}

export default function VideoOverlay({
  peer,
  remoteStream,
  localStream,
  statusLabel,
  selfName,
  remoteName,
}: VideoOverlayProps) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    void peer?.setLocalMuted(next);
  }
  function toggleVideo() {
    const next = !hidden;
    setHidden(next);
    void peer?.setLocalVideoHidden(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Remote video */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
          {remoteName}
        </span>
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-tolly-muted">
            {statusLabel}
          </div>
        )}
      </div>

      {/* Local self-view (small, draggable-looking) */}
      <div className="relative aspect-video w-32 overflow-hidden rounded-lg border border-white/10 bg-black">
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted /* never echo your own mic */
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {selfName} (you)
        </span>
        {hidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-[10px] text-tolly-muted">
            camera off
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleMute}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
            muted
              ? "bg-red-600/30 text-red-200"
              : "bg-tolly-ink text-tolly-muted hover:text-white"
          }`}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={toggleVideo}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
            hidden
              ? "bg-red-600/30 text-red-200"
              : "bg-tolly-ink text-tolly-muted hover:text-white"
          }`}
        >
          {hidden ? "Show cam" : "Hide cam"}
        </button>
      </div>
    </div>
  );
}
