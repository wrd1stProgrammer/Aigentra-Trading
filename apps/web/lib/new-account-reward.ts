export const NEW_ACCOUNT_REWARD_STORAGE_KEY = "aigentra:new-account-reward";

export function markNewAccountRewardPending(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(NEW_ACCOUNT_REWARD_STORAGE_KEY, normalizeEmail(email));
  } catch (error) {
    if (isDomException(error)) return;
    throw error;
  }
}

export function isNewAccountRewardPending(email: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(NEW_ACCOUNT_REWARD_STORAGE_KEY) === normalizeEmail(email);
  } catch (error) {
    if (isDomException(error)) return false;
    throw error;
  }
}

export function acknowledgeNewAccountReward(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NEW_ACCOUNT_REWARD_STORAGE_KEY);
  } catch (error) {
    if (isDomException(error)) return;
    throw error;
  }
}

function isDomException(error: unknown): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
