import type { ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  provider: 'google' | 'apple';
};

/** Keep provider artwork intact; PiiiN colors belong to the surrounding surface. */
export function SsoButton({ provider, className = '', ...props }: Props) {
  const google = provider === 'google';
  return <button {...props} type="button" className={`account-sso account-sso--${provider} ${className}`}>
    <img className="account-sso-logo" src={google ? '/identity/google-g.png' : '/identity/apple-sign-in.svg'} alt="" aria-hidden="true" />
    <span>{google ? 'Google でログイン' : 'Apple でサインイン'}</span>
  </button>;
}
