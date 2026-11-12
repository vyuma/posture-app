import type { AppLanguage } from '../../../shared/account';
// The application's currently supported display language. The future language
// setting must update this accessor; provider/browser locale is not a substitute.
export function getAppLanguage(): AppLanguage { return 'ja'; }
