import { View } from 'react-native';

import type { BudgetState } from '@/budget/status';
import { cn } from '@/lib/cn';

/** Green while on track, amber from 80%, red once over: the same three colours everywhere. */
export const BUDGET_FILL: Record<BudgetState, string> = { ok: 'bg-success', near: 'bg-warning', over: 'bg-danger' };
export const BUDGET_TEXT: Record<BudgetState, 'success' | 'warning' | 'danger'> = { ok: 'success', near: 'warning', over: 'danger' };

/** Progress toward a budget; caps at full (the overspend is said in words beside it). */
export function BudgetBar({ used, state, thin, className }: { used: number; state: BudgetState; thin?: boolean; className?: string }) {
  return (
    <View
      className={cn('overflow-hidden rounded-full bg-fill', thin ? 'h-1' : 'h-2', className)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, used) * 100) }}>
      <View className={cn('h-full rounded-full', BUDGET_FILL[state])} style={{ width: `${Math.max(2, Math.min(1, used) * 100)}%` }} />
    </View>
  );
}
