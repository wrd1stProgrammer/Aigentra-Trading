export type AccessGatePhase = "pending" | "locked" | "unlocked";

export type AccessGateChildPolicyInput = {
  phase: AccessGatePhase;
  deferLockedChildren: boolean;
};

export function shouldRenderProtectedGateChildren({
  phase,
  deferLockedChildren
}: AccessGateChildPolicyInput) {
  return phase === "unlocked" || !deferLockedChildren;
}
