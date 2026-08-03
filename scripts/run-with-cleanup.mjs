export async function runWithCleanup(task, cleanups, message) {
  const failures = [];
  try {
    await task();
  } catch (error) {
    failures.push(error);
  }
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, message);
}

export function closePlaywrightSession(context, browser, label) {
  return runWithCleanup(() => {}, [
    async () => { if (context) await context.close(); },
    async () => {
      if (!browser) return;
      await browser.close();
      if (browser.isConnected()) throw new Error(`${label} remained connected`);
    },
  ], `${label} cleanup failed`);
}
