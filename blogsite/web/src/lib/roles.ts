export const ROLES = ['member', 'member-lite', 'member-pro'] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'member';

export const ROLE_LABELS: Record<Role, string> = {
  member: 'Member',
  'member-lite': 'Member Lite',
  'member-pro': 'Member Pro',
};

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

/** Member Lite comes only from an account created through the videos site; Member Pro is set by an admin. */
export const canWatchVideos = (role: Role) => role !== 'member';

/** Pro that ends (a bought week or month) can be extended; Pro with no end date (lifetime, or set by an admin) can't. */
export function proPlan(account: { role: Role; proUntil: string | null }): 'timed' | 'lifetime' | null {
  if (account.role !== 'member-pro') return null;
  return account.proUntil ? 'timed' : 'lifetime';
}
