// A tiny typed signal: the part of the `typed-signals` package the legacy ScrollBox used (`connect`, `emit`), so the framework needs
// no new dependency. `connect` returns the connection, whose `disconnect()` removes the listener.
export type SignalConnection = { disconnect(): void };

export class Signal<F extends (...args: never[]) => void> {
  private readonly listeners = new Set<F>();

  connect(listener: F): SignalConnection {
    this.listeners.add(listener);
    return { disconnect: () => void this.listeners.delete(listener) };
  }

  emit(...args: Parameters<F>): void {
    for (const l of [...this.listeners]) l(...args);
  }

  disconnectAll(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
