import React, { Suspense, useState } from 'react';
import { AvatarGenderContext } from '../lib/avatarSettings';
import { avatarPreviewPath, resolveAvatarState } from '../lib/avatarAnimation';
import type { AvatarState, AvatarGender } from '../types';

const Avatar3D = React.lazy(() => import('./Avatar3D').then(module => ({ default: module.Avatar })));

interface Props {
  interactive3D?: boolean;
  state?: AvatarState;
  isSpeaking?: boolean;
  isListening?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showSubtitle?: boolean;
  onStateChange?: (state: AvatarState) => void;
  gender?: AvatarGender;
}

class AvatarBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <>{this.props.fallback}<span role="status" className="sr-only">A imagem da Vigia continua disponível.</span></>
      : this.props.children;
  }
}

export const Avatar = React.memo((props: Props) => {
  const [active, setActive] = useState(false);
  const contextGender = React.useContext(AvatarGenderContext);
  const gender = props.gender || contextGender;
  const currentState = resolveAvatarState(props.state, props.isSpeaking, props.isListening);
  const use3D = active && props.interactive3D !== false;
  const preview = (
    <img
      src={avatarPreviewPath(gender, props.size)}
      onError={event => {
        event.currentTarget.onerror = null;
        if (!event.currentTarget.src.endsWith('/icons/icon.svg')) event.currentTarget.src = '/icons/icon.svg';
      }}
      alt={gender === 'male' ? 'Vigia, tutor de prevenção' : 'Vigia, tutora de prevenção'}
      className="w-3/4 h-3/4 object-contain"
    />
  );
  return (
    <div className={`absolute inset-0 flex items-center justify-center ${currentState === 'speaking' ? 'vigia-avatar-speaking' : currentState === 'listening' ? 'vigia-avatar-listening' : ''}`}>
      {use3D ? (
        <AvatarBoundary key={gender} fallback={preview}>
          <Suspense fallback={<>{preview}<span role="status" className="sr-only">Carregando avatar…</span></>}>
            <Avatar3D {...props} gender={gender} />
          </Suspense>
        </AvatarBoundary>
      ) : preview}
      {props.interactive3D !== false && (
        <button
          type="button"
          onClick={() => setActive(value => !value)}
          aria-label={use3D ? 'Usar imagem do avatar' : 'Ativar avatar 3D'}
          aria-pressed={use3D}
          style={props.size === 'sm' ? { fontSize: 8, lineHeight: 1, padding: '2px 4px' } : undefined}
          className="absolute bottom-0 right-0 z-30 rounded bg-slate-700 text-white text-xs px-2 py-1"
        >
          {use3D ? '2D' : '3D'}
        </button>
      )}
    </div>
  );
});
