import {WorldLabel as Text} from './WorldLabel';
import React, { useState, useRef, useEffect } from 'react';
import { RigidBody, interactionGroups } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Gltf, Float, MeshDistortMaterial, Edges, Grid } from '@react-three/drei';
import * as THREE from 'three';

import { useEscapeStore } from './escapeStore';

export const Wall = ({ position, args, color = '#3d3d3d' }: any) => {
  return (
    <RigidBody type="fixed" position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.1} />
      </mesh>
    </RigidBody>
  );
};

export const Floor = ({ args }: any) => {
  return (
    <RigidBody type="fixed" position={[0, -0.5, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={args || [200, 1, 200]} />
        {/* Realistic mud/dirt ground */}
        <meshStandardMaterial color="#2d2a26" roughness={1} metalness={0} />
      </mesh>
    </RigidBody>
  );
};

export const Hazard = ({ position, args = [2, 0.2, 2], onCollide, type, damage, message }: any) => {
  const isWater = type === 'water' || type === 'current';
  const isMud = type === 'mud';
  const isWire = type === 'wire';

  return (
    <RigidBody type="fixed" position={position} sensor onIntersectionEnter={() => onCollide?.()} userData={{ hazardDamage: damage, hazardMessage: message }}>
      <mesh receiveShadow position={[0, isWater ? 0.4 : 0.6, 0]}>
        <boxGeometry args={[args[0], 0.4, args[2]]} />
        {isWater ? (
          <MeshDistortMaterial color="#3a3d2e" speed={2} distort={0.2} transparent opacity={0.9} roughness={0.1} metalness={0.2} />
        ) : isMud ? (
          <meshStandardMaterial color="#4a3b2c" roughness={1} />
        ) : isWire ? (
          <meshStandardMaterial color="#f1c40f" emissive="#f39c12" emissiveIntensity={1} />
        ) : (
          <meshStandardMaterial color="#ff7675" emissive="#d63031" emissiveIntensity={0.5} />
        )}
      </mesh>
      {isWater && (
        <Text position={[0, 1.2, 0]} fontSize={0.4} color="#00cec9" anchorY="bottom" outlineColor="#000" outlineWidth={0.05}>
          ÁGUA
        </Text>
      )}
      {isWire && (
        <Text position={[0, 1.2, 0]} fontSize={0.4} color="#f1c40f" anchorY="bottom" outlineColor="#000" outlineWidth={0.05}>
          ELETRIFICADO
        </Text>
      )}
    </RigidBody>
  );
};

export const Key = ({ position, onCollect, collected, itemId }: any) => {
  if (collected) return null;
  const isMedkit = itemId?.includes('medkit') || itemId?.includes('mochila');
  const isFlashlight = itemId?.includes('flashlight');
  const isCrowbar = itemId?.includes('crowbar') || itemId?.includes('lever');
  const isValve = itemId?.includes('valve');

  return (
    <RigidBody type="fixed" position={position} userData={{ onInteract: onCollect }}>
      <Float speed={4} rotationIntensity={2} floatIntensity={2}>
        <group position={[0, 1, 0]}>
          {isMedkit && (
            <group>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.6, 0.4, 0.4]} />
                <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.1} />
              </mesh>
              {/* Red Cross */}
              <mesh position={[0, 0, 0.21]}>
                <planeGeometry args={[0.1, 0.3]} />
                <meshBasicMaterial color="#d63031" />
              </mesh>
              <mesh position={[0, 0, 0.21]}>
                <planeGeometry args={[0.3, 0.1]} />
                <meshBasicMaterial color="#d63031" />
              </mesh>
            </group>
          )}
          {isFlashlight && (
             <group>
               <mesh rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.08, 0.08, 0.4, 16]} />
                 <meshStandardMaterial color="#2d3436" roughness={0.8} />
               </mesh>
               <mesh position={[0, 0, 0.25]} rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.12, 0.08, 0.2, 16]} />
                 <meshStandardMaterial color="#2d3436" roughness={0.8} />
               </mesh>
               <mesh position={[0, 0, 0.36]} rotation={[Math.PI/2, 0, 0]}>
                 <circleGeometry args={[0.1, 16]} />
                 <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={2} />
               </mesh>
             </group>
          )}
          {isCrowbar && (
             <group rotation={[0, 0, Math.PI / 4]}>
               <mesh>
                 <cylinderGeometry args={[0.04, 0.04, 0.8, 8]} />
                 <meshStandardMaterial color="#b2bec3" metalness={0.9} roughness={0.4} />
               </mesh>
               <mesh position={[0.05, 0.4, 0]} rotation={[0, 0, Math.PI/4]}>
                 <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
                 <meshStandardMaterial color="#d63031" metalness={0.5} roughness={0.8} />
               </mesh>
             </group>
          )}
          {isValve && (
             <group>
               <mesh rotation={[Math.PI/2, 0, 0]}>
                 <torusGeometry args={[0.3, 0.06, 16, 32]} />
                 <meshStandardMaterial color="#d63031" metalness={0.8} roughness={0.4} />
               </mesh>
               <mesh rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
                 <meshStandardMaterial color="#d63031" metalness={0.8} roughness={0.4} />
               </mesh>
               <mesh rotation={[Math.PI/2, 0, Math.PI/2]}>
                 <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
                 <meshStandardMaterial color="#d63031" metalness={0.8} roughness={0.4} />
               </mesh>
             </group>
          )}
          {!isMedkit && !isFlashlight && !isCrowbar && !isValve && (
            <mesh castShadow receiveShadow>
              <octahedronGeometry args={[0.3, 0]} />
              <meshStandardMaterial color="#ffeaa7" emissive="#f39c12" emissiveIntensity={1} />
            </mesh>
          )}
        </group>
        {/* Holographic Ring around the item */}
        <mesh position={[0, 1, 0]} rotation={[Math.PI/2, 0, 0]}>
          <torusGeometry args={[0.8, 0.02, 16, 64]} />
          <meshBasicMaterial color={isMedkit ? "#ff7675" : "#ffeaa7"} transparent opacity={0.6} />
        </mesh>
      </Float>
    </RigidBody>
  );
};

export const SafeZone = ({ position, args, onEnter }: any) => {
  return (
    <RigidBody type="fixed" position={position} sensor onIntersectionEnter={() => onEnter?.()}>
      <mesh receiveShadow position={[0, 0.1, 0]}>
        <boxGeometry args={args || [4, 0.2, 4]} />
        <meshStandardMaterial color="#00b894" emissive="#55efc4" emissiveIntensity={1.5} transparent opacity={0.8} />
      </mesh>
      <Text position={[0, 2, 0]} fontSize={0.6} color="#55efc4" anchorY="bottom" outlineColor="#000" outlineWidth={0.05}>
        PONTO SEGURO
      </Text>
      <mesh position={[0, 1, 0]}>
         <cylinderGeometry args={[(args[0]/2)*0.9, (args[0]/2)*0.9, 2, 32, 1, true]} />
         <meshBasicMaterial color="#55efc4" transparent opacity={0.2} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </RigidBody>
  );
};

export const HighGround = ({ position, args }: any) => {
  return (
    <RigidBody type="fixed" position={position}>
      <group>
        {/* Base dirt/concrete */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[args[0], args[1], args[2]]} />
          <meshStandardMaterial color="#5c4a3d" metalness={0.1} roughness={1} />
        </mesh>
        {/* Top layer grass/concrete */}
        <mesh receiveShadow position={[0, args[1]/2 + 0.01, 0]}>
          <boxGeometry args={[args[0], 0.02, args[2]]} />
          <meshStandardMaterial color="#27ae60" metalness={0} roughness={1} />
        </mesh>
      </group>
    </RigidBody>
  );
};

export const Gate = ({ position, args, onCollide, isLocked, name }: any) => {
  if (!isLocked) return null;
  // A gate can be represented by multiple vertical bars
  const width = args[0];
  const height = args[1];
  
  const bars = [];
  const barCount = Math.floor(width / 0.4);
  const startX = -width / 2 + 0.2;
  
  for (let i = 0; i < barCount; i++) {
    bars.push(
      <mesh key={`bar-${i}`} position={[startX + i * 0.4, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, height, 8]} />
        <meshStandardMaterial color="#636e72" metalness={0.8} roughness={0.3} />
      </mesh>
    );
  }

  return (
    <RigidBody type="fixed" position={position} userData={{ onInteract: onCollide }}>
      <group>
        {bars}
        {/* Top bar */}
        <mesh position={[0, height / 2 - 0.1, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.08, 0.08, width, 8]} />
          <meshStandardMaterial color="#2d3436" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Bottom bar */}
        <mesh position={[0, -height / 2 + 0.1, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.08, 0.08, width, 8]} />
          <meshStandardMaterial color="#2d3436" metalness={0.8} roughness={0.3} />
        </mesh>
        
        {/* Warning Sign */}
        <mesh position={[0, 0, 0.1]}>
          <boxGeometry args={[1.5, 0.8, 0.05]} />
          <meshStandardMaterial color="#d63031" />
        </mesh>
      </group>
      <Text position={[0, height/2 + 0.5, 0]} fontSize={0.5} color="#ff7675" outlineColor="black" outlineWidth={0.05}>
        {name} (TRANCADO)
      </Text>
    </RigidBody>
  );
};

export const Switch = ({ position, onCollide, isActivated, name }: any) => {
  return (
    <RigidBody type="fixed" position={position} userData={{ onInteract: () => { if (!isActivated) onCollide?.(); } }}>
      <group position={[0, 0.6, 0]}>
        {/* Base Box */}
        <mesh castShadow>
          <boxGeometry args={[0.8, 1.2, 0.4]} />
          <meshStandardMaterial color={isActivated ? "#00b894" : "#d63031"} metalness={0.8} roughness={0.4} />
          <Edges scale={1.01} color="#ffffff" />
        </mesh>
        
        {/* Lever Hinge */}
        <mesh position={[0, 0, 0.2]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.2, 16]} />
          <meshStandardMaterial color="#2d3436" metalness={0.9} roughness={0.2} />
        </mesh>
        
        {/* Lever Handle */}
        <group position={[0, 0, 0.2]} rotation={[isActivated ? Math.PI/4 : -Math.PI/4, 0, 0]}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.6, 8]} />
            <meshStandardMaterial color="#b2bec3" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color={isActivated ? "#55efc4" : "#ff7675"} emissive={isActivated ? "#55efc4" : "#ff7675"} emissiveIntensity={2} />
          </mesh>
        </group>
      </group>
      <Text position={[0, 1.8, 0]} fontSize={0.4} color="white" outlineColor="black" outlineWidth={0.05}>
        {name}
      </Text>
    </RigidBody>
  );
};

export const VigiaTip = ({ position, onEnter, title }: any) => {
  const [triggered, setTriggered] = useState(false);
  
  return (
    <RigidBody type="fixed" position={position} sensor onIntersectionEnter={() => { if (!triggered) { setTriggered(true); onEnter?.(); } }}>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </RigidBody>
  );
};

// ----------------------------------------------------
// Pushable Crate (F�sica Din�mica Avan�ada)
// ----------------------------------------------------
export const PushableCrate = ({ position, args = [1.5, 1.5, 1.5] }: any) => {
  return (
    <RigidBody 
      type="dynamic" 
      position={position} 
      mass={5}
      friction={0.5}
      restitution={0.1}
      colliders="cuboid"
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
};

export const ThrowableItem = ({ position, velocity, itemId }: any) => {
  const ref = useRef<any>(null);
  
  useEffect(() => {
    if (ref.current) {
       ref.current.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
       ref.current.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true);
    }
  }, []); // Run only on mount to prevent boomerang bug!

  return (
    <RigidBody ref={ref} type="dynamic" mass={2} colliders="cuboid" collisionGroups={interactionGroups(2, [0])}>
      <mesh castShadow receiveShadow>
         <boxGeometry args={[0.4, 0.4, 0.4]} />
         <meshStandardMaterial color="#e17055" />
      </mesh>
    </RigidBody>
  );
};

