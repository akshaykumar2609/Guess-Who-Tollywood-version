import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/types";

interface ChatProps {
  messages: ChatMessage[];
  myId: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function Chat({ messages, myId, onSend, disabled }: ChatProps) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-tolly-muted">
            Ask yes/no questions here. e.g. &ldquo;Is your character a
            director?&rdquo;
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.from === myId;
          return (
            <div
              key={i}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm ${
                  mine
                    ? "bg-tolly-red/80 text-white"
                    : "bg-tolly-panel text-tolly-muted"
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-white/10 bg-tolly-ink px-3 py-1.5 text-sm text-white outline-none focus:border-tolly-gold disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-lg bg-tolly-gold px-3 py-1.5 text-sm font-semibold text-tolly-ink disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
