import { config } from "../config.js";

let queue = Promise.resolve();
let isFirstCall = true;

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (!isFirstCall) await delay(config.requestDelayMs);
    isFirstCall = false;
    return fn();
  };
  const next = queue.then(run);
  queue = next;
  return next;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
