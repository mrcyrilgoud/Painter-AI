import { abortError } from "../abort.js";

type QueueEntry<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export const GENERATION_QUEUE_FULL = "generation queue is full";

export class GenerateQueue {
  private active = 0;
  private pending: QueueEntry<unknown>[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxPending: number,
  ) {}

  snapshot() {
    return {
      active: this.active,
      pending: this.pending.length,
      maxActive: this.concurrency,
      maxPending: this.maxPending,
    };
  }

  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      const entry: QueueEntry<T> = { run: task, resolve, reject, signal };

      const onAbort = () => {
        const idx = this.pending.indexOf(entry as QueueEntry<unknown>);
        if (idx >= 0) {
          this.pending.splice(idx, 1);
          reject(abortError());
        }
      };

      if (signal) {
        entry.onAbort = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }

      if (this.active < this.concurrency) {
        this.start(entry);
        return;
      }

      if (this.pending.length >= this.maxPending) {
        if (entry.onAbort && signal) {
          signal.removeEventListener("abort", entry.onAbort);
        }
        reject(new Error(GENERATION_QUEUE_FULL));
        return;
      }

      this.pending.push(entry as QueueEntry<unknown>);
    });
  }

  private start<T>(entry: QueueEntry<T>): void {
    this.active++;
    if (entry.onAbort && entry.signal) {
      entry.signal.removeEventListener("abort", entry.onAbort);
      entry.onAbort = undefined;
    }

    entry
      .run()
      .then(entry.resolve)
      .catch(entry.reject)
      .finally(() => {
        this.active--;
        this.drain();
      });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift()!;
      if (next.signal?.aborted) {
        next.reject(abortError());
        continue;
      }
      this.start(next);
    }
  }
}
