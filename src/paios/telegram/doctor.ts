import type { FetchLike } from "../http-fetch.js";
import { resolveSynthesisConfig, resolveTelegramConfig } from "./config.js";

/**
 * Phase 2 readiness diagnostics, mirroring the Phase 1 `doctor` pattern. Reports
 * whether the bot token, allowlist, local Ollama runtime, and the configured
 * model are present. The summary never includes secret values.
 */
export interface TelegramDoctorResult {
  tokenConfigured: boolean;
  allowlistCount: number;
  ollamaReachable: boolean;
  modelPresent: boolean;
  ready: boolean;
  summary: string[];
}

function extractModelNames(payload: unknown): string[] {
  if (typeof payload === "object" && payload !== null) {
    const models = (payload as { models?: unknown }).models;
    if (Array.isArray(models)) {
      return models
        .map((entry) =>
          typeof entry === "object" && entry !== null
            ? (entry as { name?: unknown }).name
            : undefined,
        )
        .filter((name): name is string => typeof name === "string");
    }
  }
  return [];
}

export async function collectTelegramDiagnostics(
  env: Record<string, string | undefined>,
  fetch: FetchLike,
): Promise<TelegramDoctorResult> {
  let tokenConfigured = false;
  let allowlistCount = 0;
  try {
    const config = resolveTelegramConfig(env);
    tokenConfigured = true;
    allowlistCount = config.allowedChatIds.size;
  } catch {
    tokenConfigured = false;
  }

  const synthesis = resolveSynthesisConfig(env);
  let ollamaReachable = false;
  let modelPresent = false;
  try {
    const response = await fetch(`${synthesis.ollamaHost}/api/tags`);
    if (response.ok) {
      ollamaReachable = true;
      modelPresent = extractModelNames(await response.json()).includes(
        synthesis.model,
      );
    }
  } catch {
    ollamaReachable = false;
  }

  const ready =
    tokenConfigured && allowlistCount > 0 && ollamaReachable && modelPresent;
  const summary = [
    `Telegram token: ${tokenConfigured ? "configured" : "missing (set TELEGRAM_BOT_TOKEN)"}`,
    `Allowlist: ${allowlistCount} chat id(s)`,
    `Ollama (${synthesis.ollamaHost}): ${ollamaReachable ? "reachable" : "unreachable (run 'ollama serve')"}`,
    `Model ${synthesis.model}: ${modelPresent ? "present" : `not pulled (run 'ollama pull ${synthesis.model}')`}`,
    `Assistant: ${ready ? "ready" : "not ready"}`,
  ];

  return {
    tokenConfigured,
    allowlistCount,
    ollamaReachable,
    modelPresent,
    ready,
    summary,
  };
}
