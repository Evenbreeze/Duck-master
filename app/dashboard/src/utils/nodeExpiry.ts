export function isNodeExpired(
  expireAt: number | null | undefined
): boolean {
  if (expireAt == null) return false;
  return expireAt * 1000 <= Date.now();
}
