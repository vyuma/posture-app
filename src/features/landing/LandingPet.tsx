import type { CSSProperties } from 'react';
import { WidgetPetRig } from '../work/WidgetPetRig';
import { WidgetSpeech } from '../work/WidgetSpeech';
import { speechGeometry, widgetGeometry, type WidgetPose } from '../work/widgetPresentation';
import type { SpeechEvent } from '../posture/feedbackSpeech';
import { LandingWidgetTimer } from './LandingWidgetTimer';
import '../work/widget.css';

export function landingPetGeometry(pose: WidgetPose, growth: number, height: number, speech?: SpeechEvent | null) {
  return speechGeometry(widgetGeometry(pose, growth, height), speech?.text ?? '');
}

/** The product's rig, mask, shadow, shake and timer; no measurement or native window. */
export function LandingPet({ pose, geometry, speech = null, playing = true, reduced = false }: {
  pose: WidgetPose; geometry: ReturnType<typeof widgetGeometry>; speech?: SpeechEvent | null; playing?: boolean; reduced?: boolean;
}) {
  const variables = Object.fromEntries(Object.entries(geometry).map(([key, value]) => [`--widget-${key}`, `${value}${key === 'growth' ? '' : key === 'bubbleAngle' ? 'deg' : 'px'}`]));
  return <div className={`work-widget lp-demo-widget is-${pose}${playing ? '' : ' is-scene-paused'}`} style={variables as CSSProperties}>
    <div className="work-widget-character">
      <div className="work-widget-character-shadow"><div className="work-widget-mask"><div className="work-widget-shake"><WidgetPetRig pose={pose} /></div></div></div>
      <WidgetSpeech bad={pose === 'bad'} event={speech} reduced={reduced} />
    </div>
    <LandingWidgetTimer />
  </div>;
}
