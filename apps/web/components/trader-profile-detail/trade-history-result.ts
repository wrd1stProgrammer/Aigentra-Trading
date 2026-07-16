const PARTIAL_RISK_REDUCTION_ACTIONS = new Set([
  "POSITION_REDUCED_BY_AI",
  "REDUCE_SIZE",
  "REDUCE_RISK"
]);

export function isPartialRiskReductionAction(action: string): boolean {
  const normalized = action.trim().replace(/[-\s]+/g, "_").toUpperCase();
  return PARTIAL_RISK_REDUCTION_ACTIONS.has(normalized);
}
