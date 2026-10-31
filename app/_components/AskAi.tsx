import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildQuestion, errorMessage, newConversation, streamAnswer } from "@/lib/askAi";
import { beaconKey, type Beacon } from "./Radar";

interface Turn {
  question: string;
  answer: string;
  status: "waiting" | "streaming" | "done" | "error";
}

// Shown as the question's label: its first line, with an ellipsis when there is more.
function firstLine(text: string) {
  const [line, ...rest] = text.split("\n");
  return rest.length > 0 ? `${line}…` : line;
}

// The AI safety chat, in place of the Scan button. Closing it (back) drops the conversation.
// `detected` is read at each send, so every question sees the robots detected at that moment
// (plus every robot detected earlier in the conversation).
export function AskAi({ detected, onClose }: { detected: Beacon[]; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const conv = useRef(newConversation());
  const abort = useRef<(() => void) | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const busy = turns.at(-1)?.status === "waiting" || turns.at(-1)?.status === "streaming";

  // Stop a pending answer when the panel closes.
  useEffect(() => () => abort.current?.(), []);

  // Bring a new question to the top of the thread; the answer then grows below it.
  const turnCount = turns.length;
  useEffect(() => {
    const el = thread.current;
    const last = el?.lastElementChild as HTMLElement | null;
    if (el && last) el.scrollTop = last.offsetTop;
  }, [turnCount]);

  const update = (i: number, patch: Partial<Turn>) => setTurns((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    const i = turns.length;
    setTurns((ts) => [...ts, { question, answer: "", status: "waiting" }]);
    setDraft("");

    const c = conv.current;
    const { message, photoKeys } = buildQuestion(c, detected.map((beacon) => ({ key: beaconKey(beacon), beacon })), question);
    c.history.push(message);
    try {
      const { done, abort: stop } = streamAnswer(c, (answer) => update(i, { answer, status: "streaming" }));
      abort.current = stop;
      const answer = await done;
      for (const k of photoKeys) c.photosSent.add(k);
      update(i, { answer, status: "done" });
    } catch (err) {
      // Drop the unanswered question so the next one can be sent.
      if (c.history.at(-1) === message) c.history.pop();
      update(i, { answer: errorMessage(err), status: "error" });
    } finally {
      abort.current = null;
    }
  }

  return (
    <section className="ai-panel" aria-label="Ask AI about nearby robots">
      {turns.length > 0 && (
        <div className="ai-thread" ref={thread} aria-live="polite">
          {turns.map((t, i) => (
            <article key={i} className="ai-turn">
              <p className="ai-q" title={t.question}>
                {firstLine(t.question)}
              </p>
              <p className={`ai-a ${t.status}`}>{t.status === "waiting" ? "Thinking…" : t.answer}</p>
            </article>
          ))}
        </div>
      )}
      <form className="ai-input" onSubmit={send}>
        <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <textarea
          rows={1}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={turns.length > 0 ? "Ask a followup question" : "Ask about the robots around you"}
          aria-label="Question"
        />
        <button type="submit" className="icon-btn ai-send" aria-label="Send" disabled={!draft.trim() || busy}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
