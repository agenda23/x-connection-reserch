import { config } from "../config.js";

let queue = Promise.resolve();

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn);
  queue = next.then(
    () => delay(config.requestDelayMs),
    () => delay(config.requestDelayMs),
  );
  return next;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
