import type { FetchLike } from "../http-fetch.js";
import type { SynthesisConfig } from "../telegram/config.js";
import {
  buildAssistPrompt,
  buildSummaryPrompt,
  buildSynthesisPrompt,
  extractCitations,
  type AnswerSynthesisProvider,
  type ConverseRequest,
  type ConverseResult,
  type SummarizeRequest,
  type SummarizeResult,
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
  async function chat(
    messages: { role: string; content: string }[],
    failureLabel: string,
  ): Promise<string> {
    const response = await options.fetch(`${options.config.ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.config.model,
        stream: false,
        options: { temperature: 0.1 },
        messages,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `${failureLabel}: model runtime returned status ${response.status}.`,
      );
    }
    return extractContent(await response.json()).trim();
  }

  return {
    async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
      if (request.records.length === 0) {
        return { outcome: "no-sources", answer: "", citedRecordIds: [] };
      }
      const prompt = buildSynthesisPrompt(request);
      const answer = await chat(
        [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        "Answer synthesis failed",
      );
      return {
        outcome: answer.length === 0 ? "refused" : "answered",
        answer,
        citedRecordIds: extractCitations(answer, request.records),
      };
    },

    async summarize(request: SummarizeRequest): Promise<SummarizeResult> {
      const recordIds = request.records.map((record) => record.recordId);
      if (request.records.length === 0) {
        return { summary: "", recordIds };
      }
      const prompt = buildSummaryPrompt(request);
      const summary = await chat(
        [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        "Summary failed",
      );
      return { summary, recordIds };
    },

    async converse(request: ConverseRequest): Promise<ConverseResult> {
      const prompt = buildAssistPrompt(request);
      const reply = await chat(
        [{ role: "system", content: prompt.system }, ...prompt.messages],
        "Assist conversation failed",
      );
      return { reply };
    },
  };
}
