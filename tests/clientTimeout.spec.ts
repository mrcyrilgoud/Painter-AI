import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { codexClient, TimeoutError, fetchAbortKind } from "../src/ai/codex/client";

describe("fetchAbortKind", () => {
  it("returns timeout when only the timeout signal aborted", () => {
    const timeout = AbortSignal.timeout(1);
    return new Promise<void>((resolve) => {
      timeout.addEventListener("abort", () => {
        expect(fetchAbortKind(timeout)).toBe("timeout");
        resolve();
      });
    });
  });

  it("returns user-cancel when the user signal aborted", () => {
    const timeout = AbortSignal.timeout(60_000);
    const user = new AbortController();
    user.abort();
    expect(fetchAbortKind(timeout, user.signal)).toBe("user-cancel");
  });

  it("prefers user-cancel when both signals aborted", () => {
    const timeout = AbortSignal.timeout(1);
    const user = new AbortController();
    return new Promise<void>((resolve) => {
      timeout.addEventListener("abort", () => {
        user.abort();
        expect(fetchAbortKind(timeout, user.signal)).toBe("user-cancel");
        resolve();
      });
    });
  });
});

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const ctrl = new AbortController();
      setTimeout(
        () => ctrl.abort(new DOMException("Timed out", "TimeoutError")),
        20,
      );
      return ctrl.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              // Mirror browser behavior for AbortSignal.timeout().
              const reason = (signal as AbortSignal & { reason?: unknown }).reason;
              if (reason instanceof DOMException && reason.name === "TimeoutError") {
                reject(reason);
              } else {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              }
            },
            { once: true },
          );
        });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws TimeoutError (not raw DOMException) when the wall clock expires", async () => {
    const err = codexClient.segment({}, { signal: undefined });
    await expect(err).rejects.toBeInstanceOf(TimeoutError);
    await expect(err).rejects.toThrow(
      "Generation timed out — try a smaller area or simpler prompt",
    );
  });
});
