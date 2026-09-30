import { Request, Response } from "express";
import { z } from "zod";
import { answer } from "../services/chat.service";
import { answerWithGemini, isGeminiConfigured } from "../services/llmChatGemini.service";

const chatSchema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .max(20)
    .optional(),
});

// Uses Gemini when configured, falling back to the rule-based engine on any
// error so an API outage or a missing key never takes the assistant down —
// the rule-based engine has no external dependency. history lets Gemini
// resolve follow-ups like "run a check on it"; the rule-based engine ignores
// it since keyword matching has no notion of conversation context anyway.
export const chatController = {
  async message(req: Request, res: Response) {
    const { message, history } = chatSchema.parse(req.body);

    if (isGeminiConfigured()) {
      try {
        res.json(await answerWithGemini(message, history));
        return;
      } catch (err) {
        console.error("Gemini chat failed, falling back:", err);
      }
    }

    res.json(await answer(message));
  },
};
