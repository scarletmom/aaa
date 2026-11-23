import { apiRequest } from './api';

/** Opens Dodo's checkout for a Member Pro plan (an id from pricing.json); it brings the buyer back to /videos/?pro=pending. */
export async function startProCheckout(plan: string, token: string): Promise<void> {
  const { url } = await apiRequest<{ url: string }>('/api/pro/checkout', { method: 'POST', body: { plan }, token });
  window.location.assign(url);
}

export type ProPaymentStatus = 'paid' | 'pending' | 'unpaid' | 'failed';

/** Has the server ask Dodo how the checkout `ref` went; "paid" means the account is Pro now. */
export async function confirmProPayment(ref: string, token: string): Promise<ProPaymentStatus> {
  const { status } = await apiRequest<{ status: ProPaymentStatus }>('/api/pro/confirm', { method: 'POST', body: { ref }, token });
  return status;
}
