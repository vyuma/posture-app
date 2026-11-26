import { WidgetTimerText } from '../work/WidgetTimerText';
/** Static timer artwork for LP mockups; it never starts a measurement. */
export function LandingWidgetTimer() {
  return <div className="work-widget-bar" aria-hidden="true">
    <span className="work-widget-time"><WidgetTimerText time="15:23" /></span>
    <img className="work-widget-toggle" src="/figma/measure-pause.svg" alt="" />
    <img className="work-widget-stop" src="/figma/measure-stop.svg" alt="" />
    <progress value={90} max={148} />
  </div>;
}
