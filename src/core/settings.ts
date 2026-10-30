const API_KEY = "yws.apiKey";

/** The user's YouTube Data API key, kept on this computer only. */
export function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY, key.trim());
    else localStorage.removeItem(API_KEY);
  } catch {
    // Storage unavailable: the key lasts for this session only.
  }
}
