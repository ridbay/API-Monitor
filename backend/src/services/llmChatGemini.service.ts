import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type Content,
  type Part,
} from "@google/genai";
import { ChatEntity, ChatResponse } from "./chat.service";
import {
  SYSTEM_PROMPT,
  TOOL_SPECS,
  executeTool,
  dedupeEntities,
} from "./chatTools";

// gemini-3.8-flash's free tier is capped at 20 requests/DAY (confirmed live,
// not from docs — Google doesn't publish exact free-tier numbers). Flash-Lite
// tiers are built for high-volume free access and this task (simple intent
// routing + tool calls) doesn't need flagship-level reasoning, so this trades
// a little quality for a lot more headroom. Check ai.google.dev/gemini-api/docs/models
// if this ever 404s — Google renames/retires flash models periodically.
const MODEL = "gemini-3.5-flash-lite";
const MAX_TOOL_ROUNDS = 4;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  // No vertexai/enterprise flag set — this defaults to the Gemini Developer
  // API (a Google AI Studio key), not Vertex/GCP billing.
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}
console.log({ isGeminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const FUNCTION_DECLARATIONS = TOOL_SPECS.map((spec) => ({
  name: spec.name,
  description: spec.description,
  parametersJsonSchema: spec.schema,
}));

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export async function answerWithGemini(message: string, priorTurns: ChatTurn[] = []): Promise<ChatResponse> {
  const ai = getClient();
  const contents: Content[] = [
    ...priorTurns.map((turn) => ({ role: turn.role === "user" ? "user" : "model", parts: [{ text: turn.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const entities: ChatEntity[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
      },
    });

    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      return {
        intent: "llm",
        reply: response.text ?? "I'm not sure how to answer that.",
        entities: entities.length > 0 ? dedupeEntities(entities) : undefined,
      };
    }

    const modelTurn = response.candidates?.[0]?.content ?? {
      role: "model",
      parts: calls.map((call) => ({ functionCall: call })),
    };
    contents.push(modelTurn);

    const responseParts: Part[] = [];
    for (const call of calls) {
      const outcome = await executeTool(
        call.name ?? "",
        (call.args as Record<string, unknown>) ?? {},
      );
      if (outcome.entities) entities.push(...outcome.entities);
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { output: outcome.forModel },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    intent: "llm",
    reply:
      "That took more steps than I could follow — try asking more directly.",
    entities: entities.length > 0 ? dedupeEntities(entities) : undefined,
  };
}
