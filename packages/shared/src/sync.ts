import type { FieldValue } from "./types.js";

export function chooseFieldWinner<T>(current: FieldValue<T>, incoming: FieldValue<T>): FieldValue<T> {
  const byTime = current.modifiedAt.localeCompare(incoming.modifiedAt);
  if (byTime < 0) return incoming;
  if (byTime > 0) return current;
  return incoming.deviceId > current.deviceId ? incoming : current;
}
