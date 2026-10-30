import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { getSettings, type Effort } from "../settings";

export const MODEL = "claude-opus-5-5";

// If a safety classifier declines a request, the API retries it on Anthropic's recommended model.
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

function client(): Anthropic {
  const { apiKey } = getSettings();
  if (!apiKey) throw new Error("Add your Claude API key in Settings first.");
  // The key belongs to the student and stays on their device; requests go straight to Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 10 * 60 * 1000 });
}

export function friendlyError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check it in Settings.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited. Wait a moment and try again.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (error instanceof Anthropic.InternalServerError) return "Claude is having trouble right now. Try again in a minute.";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status ?? ""}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export interface ChatResult {
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: string | null;
  text: string;
}

/** One tutoring turn. The full content (including thinking blocks) is returned so it can be replayed unchanged. */
export async function chat(
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  effort: Effort = getSettings().effort,
): Promise<ChatResult> {
  const response = await client().beta.messages.create({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort },
    // Cache the system prompt and conversation so follow-up turns cost less.
    cache_control: { type: "ephemeral" },
    system,
    messages,
  });
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return { content: response.content, stopReason: response.stop_reason, text };
}

/** A request whose answer must match a schema (used to extract and link problems). */
export async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
  effort: Effort = "medium",
): Promise<z.infer<T>> {
  const response = await client().beta.messages.parse({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to process this content.");
  if (response.stop_reason === "max_tokens") throw new Error("The response was too long. Try fewer pages at once.");
  if (!response.parsed_output) throw new Error("Claude's response couldn't be read.");
  return response.parsed_output as z.infer<T>;
}
