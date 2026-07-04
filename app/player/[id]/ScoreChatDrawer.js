"use client";

import { useEffect, useRef, useState } from "react";

import "./score-chat-drawer.css";

const SUGGESTED = [
  "Pourquoi pas plus haut?",
  "Qu'est-ce qui pourrait faire monter le score?",
  "Le marché est-il en retard?",
];

/**
 * Chat "Convaincs-moi" — rendu inline (tâche 3.4, plus d'overlay/drawer :
 * c'est maintenant un onglet parmi Facteurs/Pourquoi ça bouge, pas un panneau
 * séparé). Déjà lazy par nature : aucun appel réseau avant le premier message.
 * @param {{ playerId: string; playerName?: string }} props
 */
export default function ScoreChatDrawer({ playerId, playerName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function send(text) {
    const message = String(text ?? "").trim();
    if (!message || sending) return;
    setError(null);
    setSending(true);
    const newMessages = [...messages, { role: "user", content: message }];
    setMessages(newMessages);
    setInput("");
    try {
      const res = await fetch("/api/score/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId,
          message,
          history: messages,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error ?? "Erreur inattendue");
        setMessages((m) => m.slice(0, -1));
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Erreur réseau");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="scd-inline" aria-label="Discussion sur le score">
      {playerName && <p className="scd-inline__subtitle">Challenge le score de {playerName}</p>}

      <div className="scd-messages scd-messages--inline" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="scd-empty">
            <p>Pose une question pour challenger le score.</p>
            <div className="scd-suggestions">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="scd-suggestion"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`scd-msg scd-msg--${m.role}`}>
            <div className="scd-msg__bubble">{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="scd-msg scd-msg--assistant">
            <div className="scd-msg__bubble scd-msg__bubble--typing">
              <span /> <span /> <span />
            </div>
          </div>
        )}
      </div>

      {error && <div className="scd-error">{error}</div>}

      <form
        className="scd-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className="scd-input"
          placeholder="Pose ta question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={800}
        />
        <button
          type="submit"
          className="scd-send"
          disabled={sending || !input.trim()}
          aria-label="Envoyer"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
