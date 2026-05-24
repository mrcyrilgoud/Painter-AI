import { describe, it, expect } from "vitest";
import { GenerateQueue, GENERATION_QUEUE_FULL } from "../server/src/routes/generateQueue";

describe("GenerateQueue", () => {
  it("runs tasks immediately when under concurrency limit", async () => {
    const queue = new GenerateQueue(2, 2);
    const results = await Promise.all([
      queue.run(async () => 1),
      queue.run(async () => 2),
    ]);
    expect(results).toEqual([1, 2]);
  });

  it("rejects when the queue is full", async () => {
    const queue = new GenerateQueue(1, 0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const active = queue.run(async () => {
      await gate;
      return "done";
    });

    await expect(queue.run(async () => "blocked")).rejects.toThrow(GENERATION_QUEUE_FULL);

    release();
    await expect(active).resolves.toBe("done");
  });

  it("removes aborted pending tasks from the queue", async () => {
    const queue = new GenerateQueue(1, 2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const active = queue.run(async () => {
      await gate;
      return "done";
    });

    const ctrl = new AbortController();
    const pending = queue.run(async () => "never", ctrl.signal);
    ctrl.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });

    release();
    await expect(active).resolves.toBe("done");
  });
});
