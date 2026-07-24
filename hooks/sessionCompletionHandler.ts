export type WorkoutSessionCompletionHandler = (
  sessionId: number,
) => Promise<unknown> | unknown;

let completionHandler: WorkoutSessionCompletionHandler | null = null;

export function registerWorkoutSessionCompletionHandler(
  handler: WorkoutSessionCompletionHandler | null,
) {
  completionHandler = handler;
}

export async function runWorkoutSessionCompletionHandler(sessionId: number) {
  if (!completionHandler) return;
  await completionHandler(sessionId);
}
