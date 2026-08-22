/*
 * One place that turns a brand's display name into the demo's behaviour profile, so the guided practice
 * experience (field-focused coach popup, one credential at a time, warm/serious theming) can serve more
 * than one audience. Educator PD and PEJ Justice both get the guided UX; only the coach name, theme and
 * WhatsApp visibility differ. Everything is derived from the brand display name, no schema change needed.
 */
export type Audience = 'educator' | 'justice' | 'leadership';

export type DemoProfile = {
  isEducator: boolean;
  isPEJ: boolean;
  audience: Audience;
  guided: boolean;        // the guided practice UX (field popup, one-at-a-time, single column)
  coachName: string;      // Eve / Mira / Mutale
  themeClass: string;     // '' | 'theme-warm' | 'theme-serious'
  showWhatsApp: boolean;  // educator hides it; PEJ and leadership show it
};

export function demoProfile(displayName?: string | null): DemoProfile {
  const d = (displayName || '').toLowerCase();
  const isEducator = d.includes('educator');
  const isPEJ = d.includes('pej') || d.includes('justice');
  const audience: Audience = isEducator ? 'educator' : isPEJ ? 'justice' : 'leadership';
  const guided = isEducator || isPEJ;
  const coachName = isEducator ? 'Eve' : isPEJ ? 'Mira' : 'Mutale';
  const themeClass = isEducator ? 'theme-warm' : isPEJ ? 'theme-serious' : '';
  const showWhatsApp = !isEducator; // PEJ and leadership offer WhatsApp reflection; educator does not
  return { isEducator, isPEJ, audience, guided, coachName, themeClass, showWhatsApp };
}
