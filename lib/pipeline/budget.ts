import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const deadlines = new AsyncLocalStorage<number>();
const requestDeadlines = new AsyncLocalStorage<number>();
export class DeadlineError extends Error {
  constructor() { super("Execution budget exhausted."); }
}
export function remainingTime(): number {
  return Math.min(deadlines.getStore() ?? Infinity, requestDeadlines.getStore() ?? Infinity) - Date.now();
}
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
export function withinRequestBudget<T>(deadline: number, work: () => Promise<T>): Promise<T> {
  return requestDeadlines.run(Math.min(deadline, requestDeadlines.getStore() ?? Infinity), work);
}
/** Cleanup bypasses the work-phase deadline, but never the enclosing request deadline. */
export function withoutBudget<T>(work: () => Promise<T>): Promise<T> {
  return deadlines.run(Infinity, work);
}
