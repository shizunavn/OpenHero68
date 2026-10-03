import { HERO68_KEY_POSITIONS } from "../src/protocol/hero68/keyPositions";
export type HallSubscription = {
  id: string;
  keys: readonly string[];
  hz: number;
};
/** Registry only: deadlines and I/O belong to the native scheduler. */
export class HallBroker {
  private subscriptions = new Map<string, HallSubscription>();
  subscribe(subscription: HallSubscription) {
    this.update(subscription);
    return () => this.unsubscribe(subscription.id);
  }
  update({ id, keys, hz }: HallSubscription) {
    if (
      !id ||
      !Number.isFinite(hz) ||
      hz < 1 ||
      hz > 200 ||
      keys.some((key) => HERO68_KEY_POSITIONS[key] === undefined)
    )
      throw Error("Invalid Hall subscription");
    if (!keys.length) {
      this.unsubscribe(id);
      return;
    }
    this.subscriptions.set(id, { id, keys: [...new Set(keys)], hz });
  }
  unsubscribe(id: string) {
    this.subscriptions.delete(id);
  }
  get consumers() {
    return [...this.subscriptions.values()];
  }
  get demands() {
    const result = new Map<string, number>();
    for (const sub of this.subscriptions.values())
      for (const key of sub.keys)
        result.set(key, Math.max(result.get(key) ?? 0, sub.hz));
    return result;
  }
  command(excludePrefix = "") {
    const demands = new Map<string, number>();
    for (const sub of this.subscriptions.values())
      if (!excludePrefix || !sub.id.startsWith(excludePrefix))
        for (const key of sub.keys)
          demands.set(key, Math.max(demands.get(key) ?? 0, sub.hz));
    return (
      "hall-config:" +
      [...demands]
        .map(([key, hz]) => `${HERO68_KEY_POSITIONS[key]},${hz}`)
        .join("|")
    );
  }
}
