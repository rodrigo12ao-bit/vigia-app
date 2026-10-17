import type { AvatarGender, AvatarState } from '../types';

export function avatarModelPath(gender: AvatarGender = 'female'): string {
  return gender === 'male' ? '/model/avatar_2.glb' : '/model/vigia-original.glb';
}

export function avatarPreviewPath(gender: AvatarGender = 'female', size?: 'sm' | 'md' | 'lg'): string {
  return gender === 'male'
    ? '/model/avatar-preview-male.png'
    : size === 'sm' ? '/model/vigia-original-head.png' : '/model/vigia-original-preview.png';
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
