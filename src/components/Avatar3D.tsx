import React, { useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Sparkles, useGLTF, useAnimations } from '@react-three/drei';
import { motion } from 'motion/react';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarState, AvatarGender } from '../types';
import { avatarCameraFrame, avatarModelPath, avatarMouthScale, avatarPrefersReducedMotion, avatarStaticPoseTime, bindAvatarContextLoss, bindAvatarReducedMotion, isAvatarMouthTrack, resolveAvatarState, selectAvatarAnimation } from '../lib/avatarAnimation';
import * as THREE from 'three';

interface AvatarProps {
  state?: AvatarState;
  isSpeaking?: boolean;
  isListening?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showSubtitle?: boolean;
  onStateChange?: (state: AvatarState) => void;
  gender?: AvatarGender;
  animationEnabled?: boolean;
  onModelReady?: () => void;
}

interface ModelProps extends Pick<AvatarProps, 'state' | 'isSpeaking' | 'isListening' | 'gender'> {
  emotionProp?: string;
  modelUrl?: string;
  reducedMotion?: boolean;
  normalize?: boolean;
  onModelReady?: () => void;
}

export const PremiumAvatarModel: React.FC<ModelProps> = ({
  state = 'idle', isSpeaking = false, isListening = false, emotionProp,
  modelUrl, gender = 'female', reducedMotion = false, normalize = false, onModelReady,
}) => {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelUrl || avatarModelPath(gender));
  useEffect(() => { onModelReady?.(); }, [scene, onModelReady]);
  const clonedScene = useMemo(() => {
    // SkeletonUtils also isolates bones when a user supplies a skinned model.
    // Cached geometries/materials remain shared and are not disposed per canvas.
    const copy = cloneSkeleton(scene);
    copy.traverse(object => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return copy;
  }, [scene]);
  const framing = useMemo(() => {
    // World-space consumers keep their own original positioning and scale.
    if (!normalize) return { scale: 1, position: [0, 0, 0] as [number, number, number] };
    clonedScene.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = box.getCenter(new THREE.Vector3());
    const height = box.getSize(new THREE.Vector3()).y;
    const scale = height > 0 ? 3.2 / height : 1;
    return {
      scale,
      position: [-center.x * scale, -1.6 - box.min.y * scale, -center.z * scale] as [number, number, number],
    };
  }, [clonedScene, normalize]);
  const mouth = useMemo(() => normalize ? clonedScene.getObjectByName('Mouth') : undefined, [clonedScene, normalize]);
  const gestureClips = useMemo(() => mouth ? animations.map(clip => {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter(track => !isAvatarMouthTrack(track.name));
    return copy;
  }) : animations, [animations, mouth]);
  const { actions, names, mixer } = useAnimations(gestureClips, group);
  const invalidate = useThree(frame => frame.invalidate);
  const speakingTime = useRef(0);
  useFrame((_frame, delta) => {
    if (!mouth) return;
    speakingTime.current = isSpeaking && !reducedMotion ? speakingTime.current + Math.min(delta, 0.1) : 0;
    mouth.scale.y = avatarMouthScale(speakingTime.current, isSpeaking, reducedMotion);
  });
  useEffect(() => {
    if (mouth && (!isSpeaking || reducedMotion)) { speakingTime.current = 0; mouth.scale.y = 1; invalidate(); }
  }, [mouth, isSpeaking, reducedMotion, invalidate]);
  const currentState = resolveAvatarState(state, isSpeaking, isListening);
  const animationName = selectAvatarAnimation(currentState, names, emotionProp);

  useEffect(() => {
    const action = animationName ? actions[animationName] : undefined;
    if (!action) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity);
    if (reducedMotion) {
      // Show a stable pose while still reflecting the chosen expression.
      mixer.stopAllAction();
      action.play();
      action.time = avatarStaticPoseTime(action.getClip().duration);
      mixer.update(0);
      action.paused = true;
      invalidate();
    } else {
      action.paused = false;
      action.fadeIn(0.3).play();
    }
    return () => { reducedMotion ? action.stop() : action.fadeOut(0.3); };
  }, [animationName, actions, mixer, reducedMotion, invalidate]);

  // Gesture clips own head and neck movement; playback alone owns the mouth.
  return (
    <group ref={group} dispose={null}>
      <group scale={framing.scale} position={framing.position}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
};

interface CoreProps extends ModelProps {
  onClick?: () => void;
  size: 'sm' | 'md' | 'lg';
}

const HolographicCore: React.FC<CoreProps> = ({ state, isSpeaking, isListening, onClick, gender, size, reducedMotion, onModelReady }) => {
  const groupRef = useRef<THREE.Group>(null);
  const floatRef = useRef<THREE.Group>(null);
  const invalidate = useThree(frame => frame.invalidate);
  useLayoutEffect(() => {
    if (!reducedMotion) return;
    // Demand rendering cannot gradually damp a previous pointer tilt. Reset
    // both the outer tilt and Drei's last floating matrix before the next draw.
    groupRef.current?.rotation.set(0, 0, 0);
    floatRef.current?.rotation.set(0, 0, 0);
    floatRef.current?.position.set(0, 0, 0);
    floatRef.current?.updateMatrix();
    invalidate();
  }, [reducedMotion, invalidate]);
  useFrame((frame, delta) => {
    if (!groupRef.current || reducedMotion) return;
    const x = frame.pointer.x * Math.PI / 24;
    const y = -frame.pointer.y * Math.PI / 32;
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, x, 3, delta);
    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, y, 3, delta);
  });
  const glowColor = gender === 'male' ? '#0984e3' : '#f59e0b';
  return (
    <group ref={groupRef} onClick={onClick}>
      <Float ref={floatRef} speed={reducedMotion ? 0 : 1.5} rotationIntensity={0} floatIntensity={reducedMotion ? 0 : 0.08}>
        <PremiumAvatarModel state={state} isSpeaking={isSpeaking} isListening={isListening} gender={gender} reducedMotion={reducedMotion} onModelReady={onModelReady} normalize />
        {!reducedMotion && size !== 'sm' && <Sparkles count={20} scale={4} size={1.5} speed={0.1} color={glowColor} opacity={0.3} />}
        {!reducedMotion && size !== 'sm' && (state === 'speaking' || state === 'listening') && (
          <Sparkles count={14} scale={3.6} size={2.5} speed={0.3} color={glowColor} opacity={0.5} />
        )}
      </Float>
    </group>
  );
};

const AvatarCamera: React.FC<{ size: 'sm' | 'md' | 'lg' }> = ({ size }) => {
  const { camera, gl, size: viewport } = useThree();
  useLayoutEffect(() => {
    const frame = avatarCameraFrame(size, viewport.width / Math.max(1, viewport.height));
    camera.position.set(0, frame.targetY, frame.distance);
    camera.lookAt(0, frame.targetY, 0);
    camera.updateProjectionMatrix();
    // Renderer-level clipping is exclusive to this canvas. Materials remain
    // untouched, including cached models used by the world-space companion.
    const previous = gl.clippingPlanes;
    gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -frame.clipY)];
    return () => { gl.clippingPlanes = previous; };
  }, [camera, gl, size, viewport.width, viewport.height]);
  return null;
};

export const AvatarComponent: React.FC<AvatarProps> = ({
  state = 'idle', isSpeaking = false, isListening = false, size = 'lg',
  onClick, showSubtitle = true, onStateChange, gender = 'female', animationEnabled = true, onModelReady,
}) => {
  const currentState = resolveAvatarState(state, isSpeaking, isListening);
  const [reducedMotion, setReducedMotion] = useState(avatarPrefersReducedMotion);
  useEffect(() => bindAvatarReducedMotion(setReducedMotion), []);
  const [contextCanvas, setContextCanvas] = useState<HTMLCanvasElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    if (contextCanvas) return bindAvatarContextLoss(contextCanvas, () => setContextLost(true));
  }, [contextCanvas]);
  useEffect(() => { onStateChange?.(currentState); }, [currentState, onStateChange]);

  // Runtime context loss is an event, not a render exception. Forward it to
  // AvatarBoundary, which restores the lightweight image and lets 3D be retried.
  if (contextLost) throw new Error('Avatar WebGL context unavailable');

  const getStateBadge = () => {
    switch (currentState) {
      case 'listening':
        return { text: 'Estou ouvindo...', bg: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' };
      case 'thinking':
        return { text: 'Processando...', bg: 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300' };
      case 'speaking':
        return { text: 'Falando...', bg: 'bg-sky-500/20 border-sky-400/50 text-sky-300' };
      case 'explaining':
        return { text: 'Explicando...', bg: 'bg-blue-500/20 border-blue-400/50 text-blue-300' };
      case 'asking':
        return { text: 'Vamos conversar?', bg: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300' };
      case 'celebrating':
        return { text: 'Parabéns!', bg: 'bg-amber-500/20 border-amber-400/50 text-amber-300' };
      case 'serious':
      case 'alert':
        return { text: 'Alerta Vigia', bg: 'bg-rose-500/20 border-rose-400/50 text-rose-300' };
      default:
        return { text: gender === 'male' ? 'Vigia (Tutor)' : 'Vigia (Tutora)', bg: 'bg-slate-700/40 border-slate-600/50 text-slate-300' };
    }
  };
  const badgeInfo = getStateBadge();
  const initialFrame = avatarCameraFrame(size);

  return (
    <div data-avatar-framing={size === 'sm' ? 'head' : 'bust'} data-avatar-speaking={String(isSpeaking)} className="absolute inset-0 w-full h-full flex items-center justify-center select-none">
      <Canvas
        role="img"
        aria-label={gender === 'male' ? 'Vigia, tutor de prevenção animado' : 'Vigia, tutora de prevenção animada'}
        frameloop={!animationEnabled ? 'never' : reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, initialFrame.targetY, initialFrame.distance], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ powerPreference: 'low-power', antialias: true, alpha: true, failIfMajorPerformanceCaveat: false }}
        onCreated={({ gl }) => setContextCanvas(gl.domElement)}
      >
        <AvatarCamera size={size} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[3, 5, 5]} intensity={2} />
        <directionalLight position={[-3, 2, -4]} intensity={0.6} color="#c7ddff" />
        <React.Suspense fallback={null}>
          <HolographicCore state={currentState} isSpeaking={isSpeaking} isListening={isListening} onClick={onClick} gender={gender} size={size} reducedMotion={reducedMotion} onModelReady={onModelReady} />
        </React.Suspense>
      </Canvas>
      {showSubtitle && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`absolute bottom-4 ${badgeInfo.bg} backdrop-blur-md px-4 py-1.5 rounded-full border shadow-lg z-20 flex items-center gap-2 max-w-[80%] pointer-events-none`}
        >
          <span className="relative flex h-2 w-2">
            {!reducedMotion && ['speaking', 'listening', 'thinking'].includes(currentState) && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
          </span>
          <span className="text-xs sm:text-sm font-bold truncate">{badgeInfo.text}</span>
        </motion.div>
      )}
    </div>
  );
};

// The default comparison includes callbacks, so changed handlers cannot go stale.
export const Avatar = React.memo(AvatarComponent);
