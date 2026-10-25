/** Validate a fresh create acknowledgement before retaining or following its private link. */
export function createdEventPath(result: unknown): string {
  const path = result && typeof result === 'object' && !Array.isArray(result) ? (result as { path?: unknown }).path : undefined;
  if (typeof path !== 'string' || path.length !== 70 || !/^\/live\/[a-f0-9]{64}$/.test(path)) {
    throw new Error('The new event link could not be verified. Retry to recover the same event.');
  }
  return path;
}
