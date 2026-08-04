import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshTransmissionMaterial, Environment, ContactShadows, Sparkles, useTexture, Billboard, Html, useGLTF, useAnimations, Bounds } from '@react-three/drei';
import { motion } from 'motion/react';
import { AvatarState, AvatarGender } from '../types';
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
}

// ----------------------------------------------------------------------
// PREMIUM 3D AVATAR MODEL (GLTF/GLB LOADER)
// ----------------------------------------------------------------------
export const PremiumAvatarModel = ({ state, isSpeaking, isListening, emotionProp, modelUrl, gender }: any) => {
  // CONFIGURAÇÃO FUTURA DO MODELO 3D
  // Quando possuir o modelo, altere hasModel para true e descomente a lógica abaixo.
  const hasModel = true; 

  const group = useRef<THREE.Group>(null);
  // useGLTF carrega o modelo otimizado. Suporta masculino e feminino.
  const modelPath = modelUrl || (gender === 'male' ? '/model/avatar_2.glb' : '/model/avatar_1.glb');
  const { scene, animations } = useGLTF(modelPath);
  
  // Clone da cena para evitar contaminação do WebGL context quando o Canvas desmonta/remonta
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    // Máquina de estados das animações
    let actionName = 'Idle';
    
    if (isSpeaking) actionName = 'Happy';
    else if (isListening) actionName = 'Alert';
    else if (state === 'thinking') actionName = 'LookAround';
    else if (emotionProp === 'sad') actionName = 'Sad';
    
    // Tenta tocar a animação se existir com esse nome no arquivo
    if (actions && actions[actionName]) {
       // Transição suave (crossfade) de 0.5 segundos entre as animações
       actions[actionName].reset().fadeIn(0.5).play();
       return () => { actions[actionName]?.fadeOut(0.5); }
    } else if (actions && Object.keys(actions).length > 0) {
       // Fallback: Toca a primeira animação disponível se o nome não for encontrado
       const fallbackAction = Object.keys(actions)[0];
       actions[fallbackAction]?.reset().fadeIn(0.5).play();
       return () => { actions[fallbackAction]?.fadeOut(0.5); }
    }
  }, [state, isSpeaking, isListening, emotionProp, actions]);
  
  useFrame((stateObj) => {
     // Lógica de LookAt (Autonomia Orgânica)
     const neckBone = clonedScene.getObjectByName('NeckBone') || clonedScene.getObjectByName('Neck') || clonedScene.getObjectByName('Head'); 
     if (neckBone) {
        // Exemplo: Rotacionar levemente o pescoço baseado no tempo
        const targetX = Math.sin(stateObj.clock.elapsedTime) * 0.1;
        neckBone.rotation.y = THREE.MathUtils.lerp(neckBone.rotation.y, targetX, 0.05);
     }
  });

  if (hasModel) {
    return (
      <group ref={group} dispose={null}>
        {/* Adiciona sombra ao modelo clonado para este contexto WebGL específico */}
        <primitive object={clonedScene} castShadow receiveShadow />
      </group>
    );
  }

  // FALLBACK VISUAL (Enquanto o modelo não é inserido)
  return (
    <group position={[0, 0, 0]}>
       {/* Hologram Box - Placeholder */}
       <mesh position={[0, 0.2, 0]}>
         <boxGeometry args={[0.4, 0.6, 0.4]} />
         <meshStandardMaterial color="#00cec9" wireframe emissive="#00cec9" emissiveIntensity={0.5} />
       </mesh>
       <mesh position={[0, 0.6, 0.1]}>
         <sphereGeometry args={[0.2, 16, 16]} />
         <meshStandardMaterial color="#a29bfe" wireframe emissive="#a29bfe" emissiveIntensity={0.5} />
       </mesh>
       
       {/* Aviso Flutuante UI */}
       <Html position={[0, 1.2, 0]} center transform sprite>
         <div style={{ 
            color: '#00cec9', fontFamily: 'monospace', textAlign: 'center', 
            background: 'rgba(0,20,30,0.85)', padding: '15px', borderRadius: '8px', 
            border: '1px solid #00cec9', boxShadow: '0 0 10px #00cec9',
            width: '280px', pointerEvents: 'none'
         }}>
           <h3 style={{ margin: '0 0 10px 0', textTransform: 'uppercase', fontSize: '14px' }}>Asset Premium Ausente</h3>
           <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4' }}>
             O código do modelo 3D AAA está pronto e aguardando o arquivo.<br/><br/>
             Salve seu arquivo como:<br/>
             <b style={{color: '#fff'}}>/public/model/avatar_1.glb (Feminino)</b><br/>
             <b style={{color: '#fff'}}>/public/model/avatar_2.glb (Masculino)</b><br/><br/>
             E ative <b>hasModel = true</b> no arquivo Avatar.tsx.
           </p>
         </div>
       </Html>
    </group>
  );
};

// ----------------------------------------------------------------------
// HOLOGRAPHIC NEON CAPSULE & PEDESTAL
// ----------------------------------------------------------------------
const HolographicCore = ({ state, isSpeaking, isListening, onClick, gender, size }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((stateObj, delta) => {
    if (groupRef.current) {
      const targetX = (stateObj.pointer.x * Math.PI) / 12; // Movimento muito mais suave
      const targetY = (stateObj.pointer.y * Math.PI) / 12;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetX, 0.02);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -targetY, 0.02);
    }
  });

  const isMale = gender === 'male';
  const glowColor = isMale ? '#0984e3' : '#6c5ce7';

  return (
    <group ref={groupRef} onClick={onClick}>
      
      {/* O Avatar 3D Centralizado - Bounds calcula o tamanho APENAS do robô/cachorro, ignorando partículas */}
      <Float speed={1.5} rotationIntensity={0.01} floatIntensity={0.1} position={[0, 0, 0]}>
        
        <Bounds fit observe margin={size === 'sm' ? 1.5 : 1.1}>
          <group scale={isMale ? [4.0, 4.0, 4.0] : [2.2, 2.2, 2.2]}>
            <PremiumAvatarModel state={state} isSpeaking={isSpeaking} isListening={isListening} gender={gender} />
          </group>
        </Bounds>

        {/* Partículas sutis e elegantes que combinam com o gênero do avatar */}
        <Sparkles count={50} scale={4} size={2} speed={0.1} color={glowColor} opacity={0.6} />
        
        {/* Anel de destaque extra quando está falando ou ouvindo */}
        {(state === 'speaking' || state === 'listening') && (
          <Sparkles count={30} scale={3} size={4} speed={0.4} color={glowColor} opacity={0.8} />
        )}
      </Float>
    </group>
  );
};

// ----------------------------------------------------------------------
// MAIN WRAPPER
// ----------------------------------------------------------------------
export const AvatarComponent: React.FC<AvatarProps> = ({
  state = 'idle',
  isSpeaking = false,
  isListening = false,
  size = 'lg',
  onClick,
  showSubtitle = true,
  onStateChange,
  gender,
}) => {
  const actualGender = gender || (localStorage.getItem('dc_avatar_gender') as AvatarGender) || 'female';

  let currentState: AvatarState = 'idle';
  if (state) currentState = state as AvatarState;
  else if (isSpeaking) currentState = 'speaking';
  else if (isListening) currentState = 'listening';

  useEffect(() => {
    try {
      if (onStateChange) onStateChange(currentState);
    } catch (e) {}
  }, [currentState, onStateChange]);

  const sizeClasses = {
    sm: 'w-full h-full',
    md: 'w-full h-full',
    lg: 'w-full h-full',
  };

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
      case 'celebrating':
        return { text: 'Parabéns!', bg: 'bg-amber-500/20 border-amber-400/50 text-amber-300' };
      case 'serious':
      case 'alert':
        return { text: 'Alerta Vigia', bg: 'bg-rose-500/20 border-rose-400/50 text-rose-300' };
      default:
        return { text: actualGender === 'male' ? 'Vigia (Tutor)' : 'Vigia (Tutora)', bg: 'bg-slate-700/40 border-slate-600/50 text-slate-300' };
    }
  };

  const badgeInfo = getStateBadge();

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center select-none" style={{ pointerEvents: 'auto' }}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 45 }}
        gl={{
          powerPreference: 'high-performance',
          antialias: true,
          alpha: true,
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          const domElem = gl.domElement;
          const handleContextLost = (event: Event) => {
            event.preventDefault();
            console.warn('[Avatar 3D] WebGL context lost. Prevenindo crash...');
          };
          domElem.addEventListener('webglcontextlost', handleContextLost, false);
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        
        <React.Suspense fallback={null}>
          <HolographicCore 
            state={currentState} 
            isSpeaking={isSpeaking} 
            isListening={isListening} 
            onClick={onClick}
            gender={actualGender} 
            size={size}
          />
        </React.Suspense>
        
        <ContactShadows position={[0, -2.2, 0]} opacity={0.5} scale={6} blur={2} far={4} />
      </Canvas>

      {showSubtitle && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`absolute bottom-4 ${badgeInfo.bg} backdrop-blur-md px-4 py-1.5 rounded-full border shadow-lg z-20 flex items-center gap-2 max-w-[80%]`}
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              state === 'speaking' || state === 'listening' || state === 'processing' 
                ? 'bg-current' 
                : 'hidden'
            }`}></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
          </span>
          <span className="text-xs sm:text-sm font-bold truncate">
            {badgeInfo.text}
          </span>
        </motion.div>
      )}
    </div>
  );
};

// Preload preventivo dos modelos GLTF para evitar atraso de carregamento
try {
  useGLTF.preload('/model/avatar_1.glb');
  useGLTF.preload('/model/avatar_2.glb');
} catch (e) {
  // Ignora caso o ambiente não tenha suporte a preloading estático
}

export const Avatar = React.memo(AvatarComponent, (prev, next) => {
  return (
    prev.state === next.state &&
    prev.isSpeaking === next.isSpeaking &&
    prev.isListening === next.isListening &&
    prev.size === next.size &&
    prev.showSubtitle === next.showSubtitle &&
    prev.gender === next.gender
  );
});
