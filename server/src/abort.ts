/** Construct the standard AbortError used across server abort paths. */
export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === "AbortError";
}
