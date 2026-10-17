import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AvatarGenderContext } from '../lib/avatarSettings';
import { avatarPreviewPath, canAnimateAvatar, resolveAvatarState } from '../lib/avatarAnimation';
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
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadedGender, setLoadedGender] = useState<AvatarGender | null>(null);
  const [visible, setVisible] = useState(true);
  const contextGender = React.useContext(AvatarGenderContext);
  const gender = props.gender || contextGender;
  const modelReady = useCallback(() => setLoadedGender(gender), [gender]);
  const currentState = resolveAvatarState(props.state, props.isSpeaking, props.isListening);
  const animated = canAnimateAvatar(props.size, props.interactive3D);
  // First paint and the conversation controls remain independent of the model
  // download. Start a visible avatar during idle time, without an extra click.
  useEffect(() => {
    if (!animated || !container.current) return;
    let onScreen = typeof IntersectionObserver === 'undefined', cancelled = false;
    let idle: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const cancelStart = () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      idle = undefined; timer = undefined;
    };
    const update = () => {
      const next = onScreen && document.visibilityState !== 'hidden';
      setVisible(next);
      if (!next) { cancelStart(); return; }
      if (ready || idle !== undefined || timer !== undefined) return;
      const start = () => { idle = undefined; timer = undefined; if (!cancelled) setReady(true); };
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(start, { timeout: 750 });
      else timer = setTimeout(start, 80);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      onScreen = entries.some(entry => entry.isIntersecting); update();
    });
    observer?.observe(container.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { cancelled = true; cancelStart(); observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [animated, ready]);
  useEffect(() => { props.onStateChange?.(currentState); }, [currentState, props.onStateChange]);
  const use3D = ready && animated;
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
    <div ref={container} className={`absolute inset-0 flex items-center justify-center ${currentState === 'speaking' ? 'vigia-avatar-speaking' : currentState === 'listening' ? 'vigia-avatar-listening' : ''}`}>
      {use3D ? (
        <AvatarBoundary key={gender} fallback={preview}>
          {loadedGender !== gender && preview}
          <Suspense fallback={<span role="status" className="sr-only">Carregando avatar…</span>}>
            <Avatar3D {...props} onStateChange={undefined} onModelReady={modelReady} gender={gender} animationEnabled={visible} />
          </Suspense>
        </AvatarBoundary>
      ) : preview}
    </div>
  );
});
