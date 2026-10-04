// How a score is printed: P&L with a sign and up to 2 decimals, points as is.
export function fmtScore(x: number, money: boolean): string {
  const v = Math.round(x * 100) / 100;
  if (!money) return String(v);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
