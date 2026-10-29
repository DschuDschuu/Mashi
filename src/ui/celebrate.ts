/** Ereignis „gerade gekocht“ – die Feiertagsdeko feiert mit (HalloweenDeko.tsx), sonst hört niemand zu. */
export const CELEBRATE = 'mashi-celebrate';

export const celebrate = () => window.dispatchEvent(new Event(CELEBRATE));
