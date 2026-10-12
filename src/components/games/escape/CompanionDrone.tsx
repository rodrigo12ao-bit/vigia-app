import {WorldLabel as Text} from './WorldLabel';
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Sparkles, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { PremiumAvatarModel } from '../../Avatar3D';
import { useEscapeStore } from './escapeStore';

export const CompanionDrone = () => {
  const groupRef = useRef<THREE.Group>(null);
  const { isSpeaking } = useEscapeStore();

  useFrame((state) => {
    // Rotação suave da câmera em torno do palco para apresentação
    if (groupRef.current) {
       groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[0, -2.5, -3]} scale={[2.5, 2.5, 2.5]}>
      {/* Iluminação Cinematográfica (Studio Setup) */}
      <ambientLight intensity={0.2} />
      {/* Key Light (Luz Principal Suave) */}
      <spotLight position={[2, 4, 3]} angle={0.4} penumbra={0.6} intensity={5} color="#ffffff" castShadow />
      {/* Fill Light (Preenchimento das sombras) */}
      <spotLight position={[-3, 2, 2]} angle={0.5} penumbra={0.8} intensity={2} color="#a29bfe" />
      {/* Rim Light (Recorte azul/ciano vindo de trás) */}
      <spotLight position={[0, 3, -4]} angle={0.6} penumbra={0.5} intensity={8} color="#00cec9" />

      {/* Personagem Premium */}
      <group position={[0, 0, 0]} scale={[1.5, 1.5, 1.5]}>
         <PremiumAvatarModel state="idle" isSpeaking={isSpeaking} isListening={!isSpeaking} />
      </group>
    </group>
  );
};
