import { isAbsolute, join, resolve } from "node:path";

export const knowledgeDataRootEnvironment = "PAIOS_DATA_ROOT";
export const ffmpegPathEnvironment = "PAIOS_FFMPEG_PATH";
export const whisperCliPathEnvironment = "PAIOS_WHISPER_CLI_PATH";
export const whisperModelPathEnvironment = "PAIOS_WHISPER_MODEL_PATH";

export interface KnowledgeConfigurationInput {
  repositoryRoot: string;
  commandDataRoot?: string;
  environmentDataRoot?: string;
}

function resolveConfiguredPath(repositoryRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(repositoryRoot, value);
}

export function resolveKnowledgeDataRoot(
  input: KnowledgeConfigurationInput,
): string {
  if (input.commandDataRoot !== undefined) {
    return resolveConfiguredPath(input.repositoryRoot, input.commandDataRoot);
  }
  if (input.environmentDataRoot !== undefined) {
    return resolveConfiguredPath(input.repositoryRoot, input.environmentDataRoot);
  }
  return join(input.repositoryRoot, ".local", "paios", "knowledge");
}

export interface AudioToolConfiguration {
  ffmpeg: {
    command: string;
    source: "configured" | "path";
  };
  whisperCli: {
    command: string;
    source: "configured" | "path";
  };
  whisperModelPath: string | null;
}

export function resolveAudioToolConfiguration(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>>,
): AudioToolConfiguration {
  const configuredFfmpeg = environment[ffmpegPathEnvironment]?.trim();
  const configuredWhisperCli =
    environment[whisperCliPathEnvironment]?.trim();
  const configuredModel = environment[whisperModelPathEnvironment]?.trim();

  return {
    ffmpeg:
      configuredFfmpeg === undefined || configuredFfmpeg.length === 0
        ? { command: "ffmpeg", source: "path" }
        : {
            command: resolveConfiguredPath(repositoryRoot, configuredFfmpeg),
            source: "configured",
          },
    whisperCli:
      configuredWhisperCli === undefined || configuredWhisperCli.length === 0
        ? { command: "whisper-cli", source: "path" }
        : {
            command: resolveConfiguredPath(
              repositoryRoot,
              configuredWhisperCli,
            ),
            source: "configured",
          },
    whisperModelPath:
      configuredModel === undefined || configuredModel.length === 0
        ? null
        : resolveConfiguredPath(repositoryRoot, configuredModel),
  };
}
