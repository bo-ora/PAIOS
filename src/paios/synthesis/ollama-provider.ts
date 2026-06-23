import type { FetchLike } from "../http-fetch.js";
import type { SynthesisConfig } from "../telegram/config.js";
import {
  buildSynthesisPrompt,
  extractCitations,
  type AnswerSynthesisProvider,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider.js";

/**
 * Local Ollama answer-synthesis adapter (ADR-0006). Uses the chat HTTP API via
 * the built-in fetch boundary; no runtime dependency. Personal content stays
 * local because the runtime is local. Errors never include the answer body,
 * retrieved content, or host secrets.
 */
export interface OllamaProviderOptions {
  config: SynthesisConfig;
  fetch: FetchLike;
}

function extractContent(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const message = (payload as { message?: { content?: unknown } }).message;
    if (typeof message?.content === "string") {
      return message.content;
    }
  }
  return "";
}

export function createOllamaProvider(
  options: OllamaProviderOptions,
): AnswerSynthesisProvider {
  return {
    async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
      if (request.records.length === 0) {
        return { outcome: "no-sources", answer: "", citedRecordIds: [] };
      }
      const prompt = buildSynthesisPrompt(request);
      const response = await options.fetch(
        `${options.config.ollamaHost}/api/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: options.config.model,
            stream: false,
            options: { temperature: 0.1 },
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Answer synthesis failed: model runtime returned status ${response.status}.`,
        );
      }
      const answer = extractContent(await response.json()).trim();
      return {
        outcome: answer.length === 0 ? "refused" : "answered",
        answer,
        citedRecordIds: extractCitations(answer, request.records),
      };
    },
  };
}
