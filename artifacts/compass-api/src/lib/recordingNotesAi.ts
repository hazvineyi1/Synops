import { sanitizeText } from "./agendaAi";

/**
 * Recording-to-notes: transcribe an uploaded meeting recording (speech-to-text)
 * and draft clean meeting notes from the transcript.
 *
 * Like agendaAi, the OpenAI client and audio helpers are imported dynamically so
 * a missing AI integration never throws at module load. The two steps degrade
 * independently:
 *   - When AI is not configured at all, the caller gets `ai_unavailable` and can
 *     surface a clear "not configured" message (HTTP 503).
 *   - When transcription itself fails (bad/undecodable audio, transcode error,
 *     or a transcription API error), the caller gets `decode_failed` (HTTP 422).
 *   - When transcription succeeds but the draft step fails, the transcript is
 *     still returned with `draftNotes: null` so a slow transcription is never
 *     thrown away just because note drafting failed.
 *
 * All generated text is sanitized to honor the project's copy rules: no em
 * dashes, no emojis.
 */

const DRAFT_MODEL = "gpt-5.4";
// Cap the transcript handed to the draft model and the stored draft so a very
// long recording cannot blow past sane request/response sizes.
const TRANSCRIPT_DRAFT_LIMIT = 24000;
const MAX_DRAFT_CHARS = 12000;

export type TranscribeOutcome =
  | { status: "ok"; transcript: string; draftNotes: string | null }
  | { status: "ai_unavailable" }
  | { status: "decode_failed" };

export interface RecordingNotesMeta {
  recordingTitle: string;
  projectTitle: string | null;
}

interface AudioModule {
  speechToText: (buf: Buffer, format?: "wav" | "mp3" | "webm") => Promise<string>;
  detectAudioFormat: (buf: Buffer) => "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";
  ensureCompatibleFormat: (buf: Buffer) => Promise<{ buffer: Buffer; format: "wav" | "mp3" }>;
}

export function isRecordingAiConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

async function getAudio(): Promise<AudioModule | null> {
  if (!isRecordingAiConfigured()) return null;
  try {
    const mod = await import("@workspace/compass-openai/audio");
    return {
      speechToText: mod.speechToText,
      detectAudioFormat: mod.detectAudioFormat,
      ensureCompatibleFormat: mod.ensureCompatibleFormat,
    };
  } catch {
    return null;
  }
}

async function getOpenAI() {
  if (!isRecordingAiConfigured()) return null;
  try {
    const mod = await import("@workspace/compass-openai");
    return mod.openai;
  } catch {
    return null;
  }
}

async function transcribeBuffer(audio: Buffer, mod: AudioModule): Promise<string> {
  const detected = mod.detectAudioFormat(audio);
  // webm/wav/mp3 are accepted by the transcription endpoint directly, which
  // avoids an ffmpeg transcode for the common Chrome (webm) recording. Other
  // containers (mp4 from Safari, ogg, or unknown) are transcoded to wav first.
  if (detected === "webm" || detected === "wav" || detected === "mp3") {
    return mod.speechToText(audio, detected);
  }
  const compat = await mod.ensureCompatibleFormat(audio);
  return mod.speechToText(compat.buffer, compat.format);
}

async function draftNotesFromTranscript(
  transcript: string,
  meta: RecordingNotesMeta,
): Promise<string | null> {
  const client = await getOpenAI();
  if (!client) return null;

  const clipped = transcript.slice(0, TRANSCRIPT_DRAFT_LIMIT);
  const system =
    "You turn a raw meeting transcript into clean, well-structured meeting notes for an " +
    "instructional-design consulting project. Write plain text using simple labelled sections " +
    "and hyphen bullets. Organize the notes into: Summary, Decisions, Discussion, and Action " +
    "items. Put each action item on its own line prefixed with a hyphen, and name an owner when " +
    "the transcript makes it clear. Be faithful to the transcript and do not invent facts. " +
    "Do not use em dashes. Do not use emojis.";
  const user =
    `Project: ${meta.projectTitle ?? "unknown"}\n` +
    `Recording: ${meta.recordingTitle}\n\n` +
    `Transcript:\n${clipped}`;

  try {
    const resp = await client.chat.completions.create({
      model: DRAFT_MODEL,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = resp.choices[0]?.message?.content;
    if (!content) return null;
    const clean = sanitizeText(content).slice(0, MAX_DRAFT_CHARS);
    return clean.length > 0 ? clean : null;
  } catch {
    return null;
  }
}

/**
 * Transcribe the audio and draft notes from it. Never logs the audio or the
 * transcript. Returns a discriminated outcome the route maps to HTTP status.
 */
export async function transcribeAndDraftNotes(
  audio: Buffer,
  meta: RecordingNotesMeta,
): Promise<TranscribeOutcome> {
  const audioMod = await getAudio();
  if (!audioMod) return { status: "ai_unavailable" };

  let rawTranscript: string;
  try {
    rawTranscript = await transcribeBuffer(audio, audioMod);
  } catch {
    return { status: "decode_failed" };
  }

  const transcript = sanitizeText(rawTranscript ?? "");
  if (transcript.length === 0) {
    return { status: "decode_failed" };
  }

  const draftNotes = await draftNotesFromTranscript(transcript, meta);
  return { status: "ok", transcript, draftNotes };
}
