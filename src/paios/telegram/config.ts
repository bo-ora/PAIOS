/** Phase 2 configuration resolution (ADR-0005, ADR-0006). */

export class TelegramConfigError extends Error {}

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: ReadonlySet<string>;
}

export interface SynthesisConfig {
  ollamaHost: string;
  model: string;
}

export const defaultOllamaHost = "http://127.0.0.1:11434";
export const defaultSynthesisModel = "llama3.1:8b";

export const telegramBotTokenEnvironment = "TELEGRAM_BOT_TOKEN";
export const telegramAllowlistEnvironment = "TELEGRAM_ALLOWED_CHAT_IDS";
export const ollamaHostEnvironment = "OLLAMA_HOST";
export const synthesisModelEnvironment = "PAIOS_SYNTHESIS_MODEL";

export function resolveTelegramConfig(
  env: Record<string, string | undefined>,
): TelegramConfig {
  const botToken = env[telegramBotTokenEnvironment]?.trim();
  if (botToken === undefined || botToken.length === 0) {
    throw new TelegramConfigError(
      `${telegramBotTokenEnvironment} is not set; add it to .local/secrets.env.`,
    );
  }
  const allowedChatIds = new Set(
    (env[telegramAllowlistEnvironment] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  if (allowedChatIds.size === 0) {
    throw new TelegramConfigError(
      `${telegramAllowlistEnvironment} must list at least one chat/user id.`,
    );
  }
  return { botToken, allowedChatIds };
}

export function resolveSynthesisConfig(
  env: Record<string, string | undefined>,
): SynthesisConfig {
  const ollamaHost = env[ollamaHostEnvironment]?.trim();
  const model = env[synthesisModelEnvironment]?.trim();
  return {
    ollamaHost:
      ollamaHost === undefined || ollamaHost.length === 0
        ? defaultOllamaHost
        : ollamaHost,
    model: model === undefined || model.length === 0 ? defaultSynthesisModel : model,
  };
}
