// Throttled, deduplicating sender for the own-client description.
//
// The profile style token rides inside the TeamSpeak client description,
// written with clientedit. TeaSpeak flood-protects that command: a burst of
// writes earns BanFlooding errors and then the server closes the connection.
// Two call sites can burst — the profile editor fires on every tweak (color
// inputs and sliders stream changes), and the snapshot sync re-checks the
// token on every server snapshot. Every description write therefore goes
// through this funnel: identical values are dropped, sends are spaced by
// minIntervalMs, and a burst collapses to its latest value on the trailing
// edge. Local preview state is unaffected — only the server write is paced.

export interface DescriptionSync {
  request: (description: string) => void;
  reset: () => void;
}

export interface DescriptionSyncOptions {
  minIntervalMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export function createDescriptionSync(
  send: (description: string) => void,
  options: DescriptionSyncOptions = {},
): DescriptionSync {
  const minIntervalMs = options.minIntervalMs ?? 2500;
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel =
    options.cancel ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let lastSent: string | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: string | null = null;
  let timer: unknown = null;

  const flush = () => {
    timer = null;
    if (pending === null) return;
    const value = pending;
    pending = null;
    lastSent = value;
    lastSentAt = now();
    send(value);
  };

  const request = (description: string) => {
    if (description === lastSent || description === pending) return;
    const wait = lastSentAt + minIntervalMs - now();
    if (wait <= 0 && timer === null) {
      lastSent = description;
      lastSentAt = now();
      send(description);
      return;
    }
    pending = description;
    if (timer === null) {
      timer = schedule(flush, Math.max(0, wait));
    }
  };

  const reset = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    pending = null;
    lastSent = null;
    lastSentAt = Number.NEGATIVE_INFINITY;
  };

  return { request, reset };
}
