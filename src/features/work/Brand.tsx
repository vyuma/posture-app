import './brand.css';

/** Shared header geometry, independent of a screen's content scaling. */
export function Brand() {
  return <img className="work-brand" src="/logo/logo_white.png" alt="PiiiN" draggable={false} />;
}
