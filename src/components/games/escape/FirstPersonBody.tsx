import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEscapeStore } from './escapeStore';

export const FirstPersonBody = () => {
  const { camera } = useThree();
  const armsRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const [, get] = useKeyboardControls();
  const isPunching = useEscapeStore(state => state.isPunching);
  const isFlashlightOn = useEscapeStore(state => state.isFlashlightOn);
  
  // Animation state
  const clock = useRef(new THREE.Clock());

  useFrame(() => {
    if (!armsRef.current || !legsRef.current) return;
    
    const { forward, backward, left, right, run, crouch, prone } = get();
    const time = clock.current.getElapsedTime();
    
    // 1. Position arms relative to camera
    armsRef.current.position.copy(camera.position);
    armsRef.current.rotation.copy(camera.rotation);

    // 2. Position legs below the camera (fixed Y rotation based on camera)
    legsRef.current.position.copy(camera.position);
    // Legs should be lower depending on stance
    const legOffset = prone ? -0.2 : crouch ? -0.7 : -1.4;
    legsRef.current.position.y += legOffset;
    
    // Legs should only rotate on Y axis to face where camera faces
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    
    if (prone) {
      // In prone, legs lay flat behind the player
      legsRef.current.rotation.set(-Math.PI / 2, euler.y, 0, 'YXZ');
      // Offset so the legs trail behind
      const offset = new THREE.Vector3(0, 0, 1.2).applyEuler(new THREE.Euler(0, euler.y, 0));
      legsRef.current.position.add(offset);
    } else {
      legsRef.current.rotation.set(0, euler.y, 0);
    }

    // 3. Bobbing animation when moving
    const isMoving = forward || backward || left || right;
    let bobSpeed = 0;
    let bobAmp = 0;

    if (isMoving) {
      if (run) {
        bobSpeed = 15;
        bobAmp = 0.05;
      } else if (crouch) {
        bobSpeed = 6;
        bobAmp = 0.02;
      } else if (prone) {
        bobSpeed = 3;
        bobAmp = 0.01;
      } else {
        bobSpeed = 10;
        bobAmp = 0.03;
      }
    }

    // Apply bobbing to arms group
    const bob = isMoving ? Math.sin(time * bobSpeed) * bobAmp : 0;
    armsRef.current.position.y += bob;
    
    // Arm swinging and Punching
    if (leftArmRef.current && rightArmRef.current) {
      if (isPunching) {
        // Punch animation override for right arm
        rightArmRef.current.position.z = THREE.MathUtils.lerp(rightArmRef.current.position.z, -1.0, 0.4);
        rightArmRef.current.position.y = THREE.MathUtils.lerp(rightArmRef.current.position.y, -0.2, 0.4);
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, Math.PI / 8, 0.4);
      } else {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.2);
        rightArmRef.current.position.y = THREE.MathUtils.lerp(rightArmRef.current.position.y, -0.4, 0.2);
      }

      if (isMoving && !prone) {
        const swing = Math.sin(time * bobSpeed * 0.5) * (run ? 0.4 : 0.2);
        leftArmRef.current.position.z = -0.5 + swing;
        if (!isPunching) {
          rightArmRef.current.position.z = -0.5 - swing;
        }
      } else if (prone) {
        // Crawling pose: arms up and bent
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -Math.PI / 4, 0.2);
        leftArmRef.current.position.y = THREE.MathUtils.lerp(leftArmRef.current.position.y, -0.2, 0.2);
        leftArmRef.current.position.x = THREE.MathUtils.lerp(leftArmRef.current.position.x, -0.25, 0.2);
        
        if (!isPunching) {
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -Math.PI / 4, 0.2);
          rightArmRef.current.position.y = THREE.MathUtils.lerp(rightArmRef.current.position.y, -0.2, 0.2);
          rightArmRef.current.position.x = THREE.MathUtils.lerp(rightArmRef.current.position.x, 0.25, 0.2);
        }

        // Crawling animation
        if (isMoving) {
          const crawlSwing = Math.sin(time * bobSpeed * 1.5) * 0.3;
          leftArmRef.current.position.z = -0.6 + crawlSwing;
          if (!isPunching) {
            rightArmRef.current.position.z = -0.6 - crawlSwing;
          }
        } else {
          leftArmRef.current.position.z = THREE.MathUtils.lerp(leftArmRef.current.position.z, -0.6, 0.1);
          if (!isPunching) {
            rightArmRef.current.position.z = THREE.MathUtils.lerp(rightArmRef.current.position.z, -0.6, 0.1);
          }
        }
      } else {
        // Idle (standing/crouching)
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, 0.2);
        leftArmRef.current.position.y = THREE.MathUtils.lerp(leftArmRef.current.position.y, -0.4, 0.2);
        leftArmRef.current.position.x = THREE.MathUtils.lerp(leftArmRef.current.position.x, -0.35, 0.2);
        
        leftArmRef.current.position.z = THREE.MathUtils.lerp(leftArmRef.current.position.z, -0.5, 0.1);
        
        if (!isPunching) {
          rightArmRef.current.position.x = THREE.MathUtils.lerp(rightArmRef.current.position.x, 0.35, 0.2);
          rightArmRef.current.position.z = THREE.MathUtils.lerp(rightArmRef.current.position.z, -0.5, 0.1);
        }
      }
    }
  });

  return (
    <>
      {/* ARMS ATTACHED TO CAMERA */}
      <group ref={armsRef}>
        
        {/* Flashlight Target & Light */}
        <object3D ref={targetRef} position={[0, 0, -10]} />
        {isFlashlightOn && (
          <spotLight
            position={[0.3, -0.2, 0]}
            target={targetRef.current || undefined}
            angle={0.4}
            penumbra={0.6}
            intensity={5}
            distance={40}
            castShadow
            color="#f5f6fa"
          />
        )}

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.35, -0.4, -0.5]}>
          {/* Sleeve (Orange/Civil Defense) */}
          <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.5, 16]} />
            <meshStandardMaterial color="#e67e22" roughness={0.8} />
          </mesh>
          {/* Glove (Black) */}
          <mesh position={[0, 0, -0.15]}>
            <boxGeometry args={[0.1, 0.12, 0.15]} />
            <meshStandardMaterial color="#2d3436" roughness={0.9} />
          </mesh>
        </group>

        {/* Right Arm */}
        <group ref={rightArmRef} position={[0.35, -0.4, -0.5]}>
          {/* Sleeve */}
          <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.5, 16]} />
            <meshStandardMaterial color="#e67e22" roughness={0.8} />
          </mesh>
          {/* Glove */}
          <mesh position={[0, 0, -0.15]}>
            <boxGeometry args={[0.1, 0.12, 0.15]} />
            <meshStandardMaterial color="#2d3436" roughness={0.9} />
          </mesh>
        </group>
      </group>

      {/* LEGS ATTACHED TO BODY (Y-axis only) */}
      <group ref={legsRef}>
        {/* Left Leg */}
        <group position={[-0.2, 0, 0]}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.12, 0.1, 0.8, 16]} />
            <meshStandardMaterial color="#2c3e50" roughness={0.9} />
          </mesh>
          {/* Boot */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.15, 0.15, 0.25]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
        </group>

        {/* Right Leg */}
        <group position={[0.2, 0, 0]}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.12, 0.1, 0.8, 16]} />
            <meshStandardMaterial color="#2c3e50" roughness={0.9} />
          </mesh>
          {/* Boot */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.15, 0.15, 0.25]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
        </group>
      </group>
    </>
  );
};
