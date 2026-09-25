import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useSendChatMessage } from "../hooks/useChat";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "Hi — I'm a keyword-matched assistant over this platform's own data, not a language model. Ask me about endpoint status, outages, or latency rankings, or try one of the suggestions below.",
};

const SUGGESTIONS = ["What's down?", "Summary", "Outages today", "Slowest APIs", "Most unstable"];

function MessageBubble({ message }: { message: ChatMessage }) {
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
      <div
        className={`max-w-[75%] whitespace-pre-line rounded-xl px-3.5 py-2.5 text-sm ${
          isUser
            ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white"
            : "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

export function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const sendMessage = useSendChatMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendMessage.isPending) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);
    setInput("");

    sendMessage.mutate(trimmed, {
      onSuccess: (result) => {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: result.reply }]);
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", text: "Something went wrong reaching the assistant. Try again." },
        ]);
      },
    });
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-400" />
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Assistant</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Ask questions about your monitored endpoints in plain language.
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
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

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => submit(suggestion)}
              className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. is MOMO up?"
            className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          <Button type="submit" disabled={sendMessage.isPending || !input.trim()}>
            <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
