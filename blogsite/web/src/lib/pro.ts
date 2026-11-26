import { leaveSite } from './ads';
import { apiRequest } from './api';

/** Opens Dodo's checkout for a Member Pro plan (an id from pricing.json); it brings the buyer back to /videos/?pro=pending. */
export async function startProCheckout(plan: string, token: string): Promise<void> {
  const { url } = await apiRequest<{ url: string }>('/api/pro/checkout', { method: 'POST', body: { plan }, token });
  leaveSite(url);
}

// The Pro plan a Member picked before the videos site's captcha, for this tab, so checkout opens for it on the way back.
const CHOSEN_PLAN_KEY = 'quillwood-pro-plan';

export function rememberProPlan(plan: string) {
  try {
    sessionStorage.setItem(CHOSEN_PLAN_KEY, plan);
  } catch { /* storage blocked: the plans open instead */ }
}

/** The remembered plan, read once. */
export function takeProPlan(): string {
  try {
    const plan = sessionStorage.getItem(CHOSEN_PLAN_KEY) || '';
    sessionStorage.removeItem(CHOSEN_PLAN_KEY);
    return plan;
  } catch {
    return '';
  }
}

export type ProPaymentStatus = 'paid' | 'pending' | 'unpaid' | 'failed';

/** Has the server ask Dodo how the checkout `ref` went; "paid" means the account is Pro now. */
export async function confirmProPayment(ref: string, token: string): Promise<ProPaymentStatus> {
  const { status } = await apiRequest<{ status: ProPaymentStatus }>('/api/pro/confirm', { method: 'POST', body: { ref }, token });
  return status;
}
