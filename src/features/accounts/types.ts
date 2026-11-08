export const CONSENT_VERSION = '2026-11-08-v1';
export type Consent = { version: string; generation: number; grantedAt: string; active: boolean };
export type AnalysisTicket = {
  ownerId: string; installationId: string; platform: 'web' | 'macos' | 'windows';
  channel: 'web' | 'direct' | 'mac-app-store' | 'microsoft-store'; appVersion: string; timeZone: string;
  mode: 'automatic' | 'manual'; consent: Consent;
  status: 'pending' | 'sent' | 'blocked'; sentAt?: string; error?: string;
  metadataBasis?: 'recorded' | 'reconstructed';
};
export type Provenance = Pick<AnalysisTicket,'installationId'|'platform'|'channel'|'appVersion'|'timeZone'|'metadataBasis'>;
export type LocalProfile = { space: string; name?: string; consent?: Consent; lastSentAt?: string; importSpaces?: string[]; pendingStop?: boolean };
export type LocalAccounts = { revision: number; installationId: string; ownerId: string; profiles: Record<string, LocalProfile> };
export function initialAccounts(): LocalAccounts {
  return { revision: 0, installationId: crypto.randomUUID(), ownerId: 'guest', profiles: { guest: { space: 'legacy' } } };
}
export type AccountInfo = { user: { id: string; name: string } | null; consent: Consent | null; providers: string[]; googleProfileEnabled: boolean; appleEnabled: boolean };
