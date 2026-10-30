import type { ApiKeyProblem } from "../core/types";

// Turns whatever analyzeHistory or testApiKey throws into one of a few friendly states.
// The core tags its errors with a `reason` and writes their messages for people; anything
// untagged is classified from its message and treated as technical.

export type UiErrorKind =
  | "not-history"
  | "empty"
  | "dates"
  | "bad-zip"
  | "missing-key"
  | "key"
  | "quota"
  | "network"
  | "unexpected";

export interface UiError {
  kind: UiErrorKind;
  /** The key problem behind a "key" error, when known. */
  reason?: ApiKeyProblem;
  message: string;
  /** The message was written for people (a tagged core error), so it can be shown as is. */
  friendly: boolean;
}

const KEY_PROBLEMS: ApiKeyProblem[] = ["invalid", "api-not-enabled", "wrong-api", "referrer-blocked"];

const TAG_KINDS: Record<string, UiErrorKind> = {
  "not-history": "not-history",
  "empty": "empty",
  "dates": "dates",
  "bad-zip": "bad-zip",
  "quota": "quota",
  "network": "network",
  "unknown": "unexpected",
  "missing-key": "missing-key",
  "no-key": "missing-key",
};

function tags(err: unknown): string[] {
  if (!err || typeof err !== "object") return [];
  const e = err as Record<string, unknown>;
  return [e.reason, e.code, e.kind].filter((v): v is string => typeof v === "string");
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function isAbortError(err: unknown): boolean {
  return (err instanceof DOMException || err instanceof Error) && err.name === "AbortError";
}

export function classifyError(err: unknown): UiError {
  const message = messageOf(err);
  for (const tag of tags(err)) {
    const problem = KEY_PROBLEMS.find((p) => p === tag);
    if (problem) return { kind: "key", reason: problem, message, friendly: true };
    const kind = TAG_KINDS[tag];
    if (kind) return { kind, message, friendly: true };
  }

  const m = message.toLowerCase();
  const plain = (kind: UiErrorKind, reason?: ApiKeyProblem): UiError => ({ kind, reason, message, friendly: false });
  if (/quota/.test(m)) return plain("quota");
  if (/(no|missing) (youtube )?api key|api key (is )?(missing|required|needed)/.test(m)) return plain("missing-key");
  if (/api[_ ]?key|key (is )?not valid|invalid key/.test(m)) return plain("key", "invalid");
  if (/accessnotconfigured|has not been used in project|is disabled/.test(m)) return plain("key", "api-not-enabled");
  if (/referer|referrer/.test(m)) return plain("key", "referrer-blocked");
  if (/failed to fetch|networkerror|network request|offline|err_internet/.test(m)) return plain("network");
  if (/watch.?history|not a .*history|unrecogni[sz]ed file|unsupported file/.test(m)) return plain("not-history");
  return plain("unexpected");
}

/** Plain-language explanation for each API key problem. */
export function keyProblemText(reason: ApiKeyProblem | undefined, message = ""): string {
  switch (reason) {
    case "invalid":
      return "Google doesn't recognise this key. Check that you copied all of it, with nothing extra.";
    case "api-not-enabled":
      return "YouTube Data API v3 isn't turned on for this key's project. Enable it in Google Cloud, wait a minute, then try again.";
    case "wrong-api":
      return "This key is limited to other APIs. In the key's settings, add YouTube Data API v3 under API restrictions.";
    case "referrer-blocked":
      return "The key's application restrictions block this app. In the key's settings, set Application restrictions to None.";
    case "quota":
      return "This key has used up today's free YouTube quota. It resets at midnight Pacific time.";
    case "network":
      return "Couldn't reach YouTube. Check your internet connection and try again.";
    default:
      return message ? `The key couldn't be checked: ${message}` : "The key couldn't be checked. Try again in a moment.";
  }
}
