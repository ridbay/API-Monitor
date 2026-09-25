import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronDown, ChevronRight, Send, Sparkles, User } from "lucide-react";
import { Button } from "./ui/Button";
import { useSendChatMessage } from "../hooks/useChat";
import type { ChatEntity } from "../types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  entities?: ChatEntity[];
  suggestions?: string[];
}

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "Hi — I'm a keyword-matched assistant over this platform's own data, not a language model. Ask me about endpoint status, outages, or latency rankings — or tell me to run a check or a load test — or try one of the suggestions below.",
  suggestions: ["What's down?", "What's up?", "Summary", "Outages today", "Slowest APIs", "Most unstable"],
};

const DOT_TONE_CLASSES: Record<ChatEntity["status"], string> = {
  up: "bg-success-400",
  down: "bg-failure-400",
  unknown: "bg-[var(--color-text-faint)]",
};

function EntityRow({ entity, onClick }: { entity: ChatEntity; onClick: () => void }) {
  return (
    <Link
      to={`/endpoints/${entity.endpoint_id}`}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-brand-400/50 hover:bg-[var(--color-surface-hover)]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONE_CLASSES[entity.status]}`} />
      <span className="truncate font-medium text-[var(--color-text)]">{entity.name}</span>
      <span className="ml-auto shrink-0 text-[var(--color-text-faint)]">{entity.detail}</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-text-faint)]" strokeWidth={2} />
    </Link>
  );
}

function MessageBubble({ message, onNavigate, onSuggestion }: { message: ChatMessage; onNavigate: () => void; onSuggestion: (text: string) => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-brand-500/15 text-brand-300" : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" strokeWidth={2} /> : <Bot className="h-3.5 w-3.5" strokeWidth={2} />}
      </div>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-line rounded-xl px-3.5 py-2.5 text-sm ${
            isUser
              ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white"
              : "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
          }`}
        >
          {message.text}
        </div>

        {message.entities && message.entities.length > 0 && (
          <div className="flex w-full flex-col gap-1">
            {message.entities.map((entity) => (
              <EntityRow key={entity.endpoint_id} entity={entity} onClick={onNavigate} />
            ))}
          </div>
        )}

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestion(suggestion)}
                className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const sendMessage = useSendChatMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendMessage.isPending) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);
    setInput("");

    sendMessage.mutate(trimmed, {
      onSuccess: (result) => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", text: result.reply, entities: result.entities, suggestions: result.suggestions },
        ]);
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", text: "Something went wrong reaching the assistant. Try again." },
        ]);
      },
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-6px_rgba(99,102,241,0.6)] transition-transform hover:scale-105"
      >
        <Sparkles className="h-5.5 w-5.5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[32rem] w-96 max-h-[75vh] flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Assistant</h2>
            <p className="text-[11px] text-[var(--color-text-faint)]">Keyword-matched, not an LLM</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Minimize assistant"
          className="rounded-md p-1 text-[var(--color-text-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onNavigate={() => setOpen(false)} onSuggestion={submit} />
        ))}
        {sendMessage.isPending && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
              <Bot className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-faint)]">
              Looking that up…
            </div>
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-[var(--color-border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. run a check on MOMO"
          className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
        />
        <Button type="submit" disabled={sendMessage.isPending || !input.trim()} className="px-3">
          <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Button>
      </form>
    </div>
  );
}
