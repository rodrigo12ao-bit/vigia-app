import type { AvatarGender, AvatarState } from '../types';

export function avatarModelPath(gender: AvatarGender = 'female'): string {
  return gender === 'male' ? '/model/vigia-original-male.glb' : '/model/vigia-original.glb';
}

export function avatarPreviewPath(gender: AvatarGender = 'female', size?: 'sm' | 'md' | 'lg'): string {
  return gender === 'male'
    ? size === 'sm' ? '/model/vigia-original-male-head.png' : '/model/vigia-original-male-preview.png'
    : size === 'sm' ? '/model/vigia-original-head.png' : '/model/vigia-original-preview.png';
}

// Conversation canvases animate automatically; repeated small avatars in lists
// keep an inexpensive preview unless their caller explicitly opts in.
export function canAnimateAvatar(size: 'sm' | 'md' | 'lg' = 'lg', interactive3D?: boolean): boolean {
  return interactive3D !== false && (size !== 'sm' || interactive3D === true);
}

// Playback drives this cadence. Gesture clips must not make a silent character
// look as if it were speaking. This is a speech activity cue, not phoneme sync.
export function avatarMouthScale(seconds: number, speaking: boolean, reducedMotion = false): number {
  if (!speaking || reducedMotion || !Number.isFinite(seconds)) return 1;
  const phase = seconds * Math.PI * 2;
  const syllable = Math.max(0, Math.sin(phase * 4.8));
  const variation = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(phase * 1.35));
  return 1 + 2.7 * syllable * variation;
}

export function isAvatarMouthTrack(name: string): boolean {
  return /^Mouth\.(?:scale|position|quaternion)$/.test(name);
}

function avatarMotionQuery(): MediaQueryList | undefined {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  } catch { return undefined; }
}

export function avatarPrefersReducedMotion(): boolean {
  return !!avatarMotionQuery()?.matches;
}

// Subscribe to the device setting instead of sampling a motion-library hook
// once. An already mounted conversation must stop when the setting changes.
export function bindAvatarReducedMotion(onChange: (reduce: boolean) => void): () => void {
  const query = avatarMotionQuery();
  const changed = () => onChange(!!query?.matches);
  if (!query) { changed(); return () => {}; }
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', changed);
    changed();
    return () => query.removeEventListener('change', changed);
  }
  // Older Safari exposes only the legacy media-query listener methods.
  if (typeof query.addListener === 'function') {
    query.addListener(changed);
    changed();
    return () => query.removeListener(changed);
  }
  changed();
  return () => {};
}

export function avatarCameraFrame(size: 'sm' | 'md' | 'lg', aspect = 1) {
  const head = size === 'sm';
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = Math.max(head ? 0.98 : 1.85, (head ? 0.8 : 1.45) / safeAspect);
  return {
    targetY: head ? 1.23 : 0.83,
    // The nearest facial geometry is ~0.38 units in front of the scene center.
    distance: 0.4 + height / (2 * Math.tan(20 * Math.PI / 180)),
    clipY: head ? 0.78 : 0,
  };
}

export function avatarStaticPoseTime(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration * 0.35 : 0;
}

export function bindAvatarContextLoss(target: EventTarget, onLost: () => void): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  target.addEventListener('webglcontextlost', handler);
  return () => target.removeEventListener('webglcontextlost', handler);
}

// Activity flags reflect actual audio playback/capture, including when the caller
// has not yet replaced its previous conversational state.
export function resolveAvatarState(
  state: AvatarState = 'idle',
  isSpeaking = false,
  isListening = false,
): AvatarState {
  return isSpeaking ? 'speaking' : isListening ? 'listening' : state;
}

export function selectAvatarAnimation(
  state: AvatarState,
  availableNames: readonly string[],
  emotion?: string,
): string | undefined {
  let preferred = 'Idle';
  switch (state) {
    case 'speaking':
    case 'explaining':
    case 'celebrating':
      preferred = 'Happy';
      break;
    case 'listening':
    case 'asking':
    case 'alert':
      preferred = 'Alert';
      break;
    case 'thinking':
      preferred = 'LookAround';
      break;
    case 'serious':
      preferred = 'Sad';
      break;
    default:
      if (emotion === 'sad') preferred = 'Sad';
  }
  const match = (name: string) => availableNames.find(value => value.toLowerCase() === name.toLowerCase());
  return match(preferred) || match('Idle') || availableNames[0];
}
