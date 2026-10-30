/** Saved video lengths. Stub: the analysis core replaces this with an IndexedDB cache. */
export async function cacheStats(): Promise<{ videos: number; oldestFetchedAt: number | null }> {
  return { videos: 0, oldestFetchedAt: null };
}

export async function clearCache(): Promise<void> {}
