export const CONSENT_VERSION = '2026-11-09-v2';
export const CONTACT_EMAIL = 'piiin.contact@gmail.com';
export type AppLanguage = 'ja' | 'ko' | 'en';
export type SexAtBirth = 'female' | 'male' | 'other';
export type ProfileSource = 'user' | 'google_prefill' | null;
export type AnalysisProfile = {
  analysisId: string; revision: number; surveyStatus: 'pending' | 'completed' | 'skipped';
  sexAtBirth: SexAtBirth | null; ageYears: number | null; language: AppLanguage;
  observedAt: number | null; sexSource: ProfileSource; ageSource: ProfileSource;
};
