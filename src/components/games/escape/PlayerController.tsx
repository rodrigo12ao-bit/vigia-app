import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier, interactionGroups } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import { Vector3 } from 'three';
import { useEscapeStore } from './escapeStore';
import { escapeAudio } from './sound';

const BASE_SPEED = 6;
const RUN_SPEED = 12;
const CROUCH_SPEED = 3;
const PRONE_SPEED = 1.5;

const direction = new Vector3();
const camDir = new Vector3();
const camRight = new Vector3();

interface PlayerControllerProps {
  startPosition?: number[];
}

export const PlayerController = ({ startPosition = [0, 5, 0] }: PlayerControllerProps) => {
  const ref = useRef<any>(null);
  const lightRef = useRef<any>(null);
  const lastFootstep = useRef(0);
  const lastDamageTime = useRef(0);
  const { camera } = useThree();
  const isPaused = useEscapeStore((state) => state.isPaused);
  const setPunching = useEscapeStore((state) => state.setPunching);
  const heldItem = useEscapeStore((state) => state.heldItem);
  const setHeldItem = useEscapeStore((state) => state.setHeldItem);
  const throwItem = useEscapeStore((state) => state.throwItem);
  const removeFromInventory = useEscapeStore((state) => state.removeFromInventory);
  const [, get] = useKeyboardControls();
  const { rapier, world } = useRapier();

  // Handle interactions
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (isPaused) return;

      // Left click: Punch or Grab
      if (e.button === 0) {
        setPunching(true);
        setTimeout(() => setPunching(false), 300);

        // Physics Raycast
        const rayOrigin = camera.position;
        const rayDir = new Vector3();
        camera.getWorldDirection(rayDir);
        
        const ray = new rapier.Ray(rayOrigin, rayDir);
        const hit = world.castRay(ray, 3.0, true); // max distance 3
        
        if (hit) {
          const collider = hit.collider;
          const rigidBody = collider.parent();
          if (rigidBody) {
            const userData = rigidBody.userData as any;
            if (userData && typeof userData.onInteract === 'function') {
              userData.onInteract();
            } else {
              // Try to check the mesh userData directly in case it's not a rigidbody but a mesh wrapper
              // (If needed in future)
            }
          }
        }
      }
      
      // Right click: Throw
      if (e.button === 2 && heldItem) {
        const throwDir = new Vector3();
        camera.getWorldDirection(throwDir);
        throwDir.multiplyScalar(15); // throw speed
        throwDir.y += 3; // arc

        const pos = camera.position.clone().add(camera.getWorldDirection(new Vector3()).multiplyScalar(1));
        
        throwItem({
           id: 'thrown_' + Date.now(),
           itemId: heldItem,
           position: [pos.x, pos.y, pos.z],
           velocity: [throwDir.x, throwDir.y, throwDir.z]
        });
        
        // Remove from inventory and hand
        removeFromInventory(heldItem);
        setHeldItem(null);
        escapeAudio.playUseItem();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [isPaused, camera, world, rapier, heldItem, setPunching]);

  useEffect(() => {
    if (ref.current) {
      ref.current.setTranslation({ x: startPosition[0], y: startPosition[1], z: startPosition[2] }, true);
    }
  }, [startPosition]);

  useFrame((state, delta) => {
    if (!ref.current || isPaused) return;

    // Flashlight Battery Drain
    if (useEscapeStore.getState().isFlashlightOn) {
      useEscapeStore.getState().setFlashlightBattery((prev) => prev - delta * 2);
    }

    // Hazard Damage Over Time (DOT) Raycast
    const origin = ref.current.translation();
    const rayDir = new Vector3(0, -1, 0);
    const ray = new rapier.Ray(origin, rayDir);
    const hit = world.castRay(ray, 1.0, true);
    if (hit) {
      const userData = hit.collider.parent()?.userData as any;
      if (userData && userData.hazardDamage) {
        const now = performance.now();
        if (now - lastDamageTime.current > 1000) { // 1 sec cooldown
           useEscapeStore.getState().setHealth(useEscapeStore.getState().health - userData.hazardDamage);
           useEscapeStore.getState().setMessage(userData.hazardMessage);
           escapeAudio.playDamage();
           lastDamageTime.current = now;
        }
      }
    }

    const { forward, backward, left, right, jump, run, crouch, prone } = get();
    const velocity = ref.current.linvel();
    
    // Define current stance and physics adjustments
    let currentSpeed = BASE_SPEED;
    let targetCamHeight = 1.5;

    if (prone) {
      currentSpeed = PRONE_SPEED;
      targetCamHeight = 0.3;
    } else if (crouch) {
      currentSpeed = CROUCH_SPEED;
      targetCamHeight = 0.8;
    } else if (run && forward) {
      currentSpeed = RUN_SPEED;
    }

    const forwardMove = Number(forward) - Number(backward);
    const rightMove = Number(right) - Number(left);

    direction.set(0, 0, 0);

    if (forwardMove !== 0 || rightMove !== 0) {
      camera.getWorldDirection(camDir);
      camDir.y = 0;
      camDir.normalize();

      camRight.set(-camDir.z, 0, camDir.x);

      direction.addScaledVector(camDir, forwardMove);
      direction.addScaledVector(camRight, rightMove);
      direction.normalize().multiplyScalar(currentSpeed);
    }

    ref.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    if (jump && Math.abs(velocity.y) < 0.1 && !crouch && !prone) {
      ref.current.setLinvel({ x: velocity.x, y: 7, z: velocity.z }, true);
      escapeAudio.playJump();
    }

    // Footsteps
    const isMoving = Math.abs(velocity.x) > 0.5 || Math.abs(velocity.z) > 0.5;
    if (isMoving && Math.abs(velocity.y) < 0.1) {
       const now = performance.now();
       const stepDelay = currentSpeed === RUN_SPEED ? 300 : 500;
       if (now - lastFootstep.current > stepDelay) {
          escapeAudio.playFootstep();
          lastFootstep.current = now;
       }
    }

    // Update camera position to follow player (head height lerps smoothly)
    const { x, y, z } = ref.current.translation();
    camera.position.x = x;
    camera.position.z = z;
    // Lerp the Y position for smooth crouching transition
    camera.position.y += ((y + targetCamHeight) - camera.position.y) * 0.1;
    
    // Update Flashlight to follow camera exactly
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position);
      lightRef.current.rotation.copy(camera.rotation);
    }
  });

  return (
    <RigidBody ref={ref} colliders={false} mass={1} type="dynamic" position={startPosition as [number, number, number]} enabledRotations={[false, false, false]} collisionGroups={interactionGroups(1, [0])}>
      <CapsuleCollider args={[0.75, 0.5]} />
      {/* A luz precisa ficar fora do corpo para girar com a câmera no useFrame */}
      <spotLight 
        ref={lightRef}
        castShadow
        color="white"
        intensity={2}
        distance={20}
        angle={0.6}
        penumbra={0.5}
        decay={1.5}
      />
    </RigidBody>
  );
};
