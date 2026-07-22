export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real checks/loads often resolve in well under 100ms, which makes loading
// states flash by unreadably. Hold them visible for at least this long so
// the user can actually perceive that something happened.
export async function withMinDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  const start = Date.now();
  try {
    return await promise;
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < ms) await wait(ms - elapsed);
  }
}
