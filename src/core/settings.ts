const API_KEY = "yws.apiKey";

/** The user's YouTube Data API key, kept on this computer only. */
export function loadApiKey(): string {
  try {
    return cleanApiKey(localStorage.getItem(API_KEY) ?? "");
  } catch {
    return "";
  }
}

/**
 * The key as pasted, without spaces and invisible characters (zero-width spaces and the like,
 * which chat and note apps can add when copying). Real keys have neither.
 */
export function cleanApiKey(raw: string): string {
  return raw.replace(/[\s\p{Cf}]/gu, "");
}

export function saveApiKey(key: string): void {
  try {
    const clean = cleanApiKey(key);
    if (clean) localStorage.setItem(API_KEY, clean);
    else localStorage.removeItem(API_KEY);
  } catch {
    // Storage unavailable: the key lasts for this session only.
  }
}
