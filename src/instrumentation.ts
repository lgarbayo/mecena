// Runs once when the Next server starts (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Starts the in-process daily refresh of the shared BDNS catalogue (src/features/calls-ingest/scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startCallsRefreshScheduler } = await import("@/features/calls-ingest/scheduler");
  startCallsRefreshScheduler();
}
