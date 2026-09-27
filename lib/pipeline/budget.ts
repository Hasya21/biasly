import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const deadlines = new AsyncLocalStorage<number>();
export class DeadlineError extends Error {
  constructor() { super("Execution budget exhausted."); }
}
export function remainingTime(): number { return (deadlines.getStore() ?? Infinity) - Date.now(); }
export function requireTime(milliseconds = 5_000): void {
  if (remainingTime() < milliseconds) throw new DeadlineError();
}
export function budgetSignal(timeout: number): AbortSignal {
  requireTime(1);
  return AbortSignal.timeout(Math.max(1, Math.min(timeout, Math.floor(remainingTime()))));
}
export function withinBudget<T>(deadline: number, work: () => Promise<T>): Promise<T> {
  return deadlines.run(Math.min(deadline, deadlines.getStore() ?? Infinity), work);
}
/** Final state writes need a small reserve after provider work has stopped. */
export function withoutBudget<T>(work: () => Promise<T>): Promise<T> {
  return deadlines.run(Infinity, work);
}
