// Instagram-style count abbreviation: exact below 1000, truncated (not
// rounded) to one decimal above that, e.g. 1999 -> "1.9K", not "2.0K".
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const isMillions = n >= 1_000_000;
  const divisor = isMillions ? 100_000 : 100;
  const truncated = Math.floor(n / divisor) / 10;
  const formatted = truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(1);
  return `${formatted}${isMillions ? "M" : "K"}`;
}
