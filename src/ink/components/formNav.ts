/**
 * Pure "next active index" computation for `Form` (ADR-0001):
 * clamps to the field list bounds, used for both Tab/Shift+Tab and
 * Enter-advances. Kept in its own JSX-free `.ts` file (re-exported by
 * `Form.tsx`) so `yarn test` can import it natively (`node --test` strips
 * TypeScript types but cannot transform JSX, so a `.tsx` file can't be
 * imported without a build step — see ADR-0012's "no build step" rule
 * for the pure/tested layer).
 */
export function nextActiveIndex(current: number, fieldCount: number, delta: number): number {
  if (fieldCount <= 0) return 0
  return Math.max(0, Math.min(fieldCount - 1, current + delta))
}
