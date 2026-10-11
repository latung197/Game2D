export class GameEventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<(payload: unknown) => void>>();

  on<Key extends keyof Events>(type: Key, listener: (payload: Events[Key]) => void): () => void {
    let group = this.listeners.get(type);
    if (!group) {
      group = new Set();
      this.listeners.set(type, group);
    }
    const handler = listener as (payload: unknown) => void;
    group.add(handler);
    return () => {
      group?.delete(handler);
      if (group?.size === 0) this.listeners.delete(type);
    };
  }

  emit<Key extends keyof Events>(type: Key, payload: Events[Key]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
