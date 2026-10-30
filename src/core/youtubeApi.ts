import type { ApiKeyCheck } from "./types";

/** Makes one cheap lookup to tell whether the key works. Stub: the analysis core replaces this. */
export async function testApiKey(_apiKey: string): Promise<ApiKeyCheck> {
  return { ok: false, reason: "unknown", message: "Key testing is not implemented yet." };
}
