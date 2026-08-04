import React, { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, InstancedRigidBodies } from '@react-three/rapier';
import { KeyboardControls, PointerLockControls, Environment, Text, Sparkles, SoftShadows } from '@react-three/drei';
import { PlayerController } from './PlayerController';
import { CompanionDrone } from './CompanionDrone';
import { FirstPersonBody } from './FirstPersonBody';
import { Floor, Hazard, Key, SafeZone, HighGround, Gate, Switch, VigiaTip, PushableCrate, ThrowableItem } from './MapElements';
import { useEscapeStore } from './escapeStore';
import { escapeAudio } from './sound';
import { LevelData } from './types';

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
  { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
  { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
  { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
  { name: 'crouch', keys: ['Control', 'c', 'C'] },
  { name: 'prone', keys: ['z', 'Z'] },
];

interface EscapeEngineProps {
  levelData?: LevelData;
  onGameOver?: () => void;
  onVictory?: () => void;
  onSpeak?: (text: string) => void;
}

export const EscapeEngine = ({ levelData, onGameOver, onVictory, onSpeak }: EscapeEngineProps) => {
  const { phase, health, setHealth, inventory, addToInventory, unlockedGates, unlockGate, activeSwitches, activateSwitch, setMessage, setPhase, score, thrownItems } = useEscapeStore();
  const [levelComplete, setLevelComplete] = useState(false);

  const handleHazard = (damage: number, message: string) => {
    setHealth(health - damage);
    escapeAudio.playDamage();
    setMessage(message);
    if (health - damage <= 0) {
      onGameOver?.();
    }
  };

  const handleItemCollect = (itemId: string, itemType: string, message: string) => {
    if (inventory.find(i => i.id === itemId)) return; // Already collected
    addToInventory({
      id: itemId,
      name: itemType,
      type: 'keycard', 
      icon: '🎒',
      description: itemType
    });
    setMessage(message);
    escapeAudio.playPickup();
    onSpeak?.(message);
  };

  const handleGateCollision = (gate: any) => {
    if (gate.requiredKeyId && !inventory.some(i => i.id === gate.requiredKeyId)) {
      setMessage(gate.message);
    } else {
      unlockGate(gate.id);
      escapeAudio.playGateOpen();
      setMessage(`Portão ${gate.name} aberto!`);
    }
  };

  const handleSwitchCollision = (sw: any) => {
    if (sw.requiredItemId && !inventory.some(i => i.id === sw.requiredItemId)) {
      setMessage(`Falta o item: ${sw.requiredItemId.replace('item_', '')}`);
      return;
    }
    activateSwitch(sw.id);
    escapeAudio.playSwitch();
    setMessage(sw.message);
    onSpeak?.(sw.message);
  };

  const handleSafeZone = () => {
    if (!levelComplete) {
      if (phase === 1 && score < 40) {
        setMessage("Você precisa coletar mais suprimentos e XP antes de avançar!");
        return;
      }

      setLevelComplete(true);
      setMessage("Área segura alcançada! Próxima fase...");
      
      // Auto-advance after 3 seconds
      setTimeout(() => {
        setPhase(phase + 1);
        setLevelComplete(false);
      }, 3000);
    }
  };

  // Convert map elements
  const mapElements = useMemo(() => {
    const elements: any[] = [];
    if (!levelData) return elements;

    const tileSize = 2; 
    const unitRatio = tileSize / 64; // Scale 64px grid to 2 units
    const offsetX = (levelData.width / 64 * tileSize) / 2;
    const offsetZ = (levelData.height / 64 * tileSize) / 2;

    const getPos = (x: number, y: number) => {
      return [(x * unitRatio) - offsetX, (y * unitRatio) - offsetZ];
    };

    const wallPositions: [number, number, number][] = [];

    // 1. Grid Tiles
    levelData.tiles.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (!tile) return;
        
        const px = x * tileSize - offsetX;
        const pz = y * tileSize - offsetZ;

        if (tile.type === 'wall') {
          wallPositions.push([px, 1, pz]);
        } else if (tile.type === 'highground') {
          elements.push(<HighGround key={`hg-${x}-${y}`} position={[px, 1, pz]} args={[tileSize, 2, tileSize]} />);
        } else if (tile.type === 'water' || tile.type === 'mud') {
          elements.push(<Hazard key={`haz-${x}-${y}`} type={tile.type} position={[px, 0.5, pz]} args={[tileSize, 0.2, tileSize]} onCollide={() => handleHazard(10, `Você pisou em ${tile.type}!`)} />);
        } else if (tile.type === 'crate') {
          elements.push(<PushableCrate key={`crate-${x}-${y}`} position={[px, 1.5, pz]} args={[tileSize * 0.9, tileSize * 0.9, tileSize * 0.9]} />);
        } else if (tile.type === 'item') {
          const isCollected = inventory.some(i => i.id === tile.itemId);
          elements.push(<Key key={`item-${x}-${y}`} position={[px, 0.5, pz]} itemId={tile.itemId} collected={isCollected} onCollect={() => handleItemCollect(tile.itemId!, tile.itemType!, tile.message!)} />);
        }
      });
    });

    if (wallPositions.length > 0) {
      elements.push(
        <InstancedRigidBodies key="walls-instanced" positions={wallPositions} colliders="cuboid" type="fixed">
          <instancedMesh args={[undefined as any, undefined as any, wallPositions.length]} castShadow receiveShadow>
            <boxGeometry args={[tileSize, 2, tileSize]} />
            <meshStandardMaterial color="#3d3d3d" roughness={0.9} metalness={0.1} />
          </instancedMesh>
        </InstancedRigidBodies>
      );
    }

    // 2. Area Hazards
    levelData.hazards?.forEach((haz) => {
      // Check if disabled by a switch
      const switchDisablingThis = levelData.switches?.find(sw => sw.targetHazardId === haz.id);
      const isDeactivated = switchDisablingThis && activeSwitches.includes(switchDisablingThis.id);
      
      if (!isDeactivated) {
        const [px, pz] = getPos(haz.x + haz.w/2, haz.y + haz.h/2); // Center of hazard
        elements.push(<Hazard key={haz.id} type={haz.type} position={[px, 0.5, pz]} args={[haz.w * unitRatio, 0.2, haz.h * unitRatio]} onCollide={() => handleHazard(haz.damage || 20, haz.message)} />);
      }
    });

    // 3. Gates
    levelData.gates?.forEach((gate) => {
      // Check if unlocked by switch or key
      const switchOpeningThis = levelData.switches?.find(sw => sw.targetGateId === gate.id);
      const unlockedBySwitch = switchOpeningThis && activeSwitches.includes(switchOpeningThis.id);
      const isLocked = !unlockedGates.includes(gate.id) && !unlockedBySwitch;
      
      const [px, pz] = getPos(gate.x + gate.w/2, gate.y + gate.h/2);
      elements.push(
        <Gate 
          key={gate.id} 
          position={[px, 1, pz]} 
          args={[gate.w * unitRatio, 2, gate.h * unitRatio]} 
          isLocked={isLocked}
          name={gate.name}
          onCollide={() => handleGateCollision(gate)} 
        />
      );
    });

    // 4. Switches
    levelData.switches?.forEach((sw) => {
      const isActivated = activeSwitches.includes(sw.id);
      const [px, pz] = getPos(sw.x, sw.y);
      elements.push(
        <Switch 
          key={sw.id} 
          position={[px, 0.5, pz]} 
          isActivated={isActivated}
          name={sw.name}
          onCollide={() => handleSwitchCollision(sw)}
        />
      );
    });

    // 5. Vigia Tips
    levelData.vigiaTips?.forEach((tip, idx) => {
      const [px, pz] = getPos(tip.x, tip.y);
      elements.push(
        <VigiaTip 
          key={`tip-${idx}`}
          position={[px, 0.5, pz]}
          title={tip.title}
          onEnter={() => {
            setMessage(tip.message);
            onSpeak?.(tip.message);
          }}
        />
      );
    });

    // 6. Safe Zone
    if (levelData.safeZone) {
      const [szX, szZ] = getPos(levelData.safeZone.x + levelData.safeZone.w/2, levelData.safeZone.y + levelData.safeZone.h/2);
      elements.push(
        <SafeZone 
          key="safezone" 
          position={[szX, 0.5, szZ]} 
          args={[levelData.safeZone.w * unitRatio, 0.2, levelData.safeZone.h * unitRatio]} 
          onEnter={handleSafeZone} 
        />
      );
    }

    // 7. Thrown Items
    thrownItems.forEach(tItem => {
      elements.push(
        <ThrowableItem key={tItem.id} position={tItem.position} velocity={tItem.velocity} itemId={tItem.itemId} />
      );
    });

    return elements;
  }, [levelData, inventory, unlockedGates, activeSwitches, phase, levelComplete, thrownItems]);

  // Calculate starting position
  const startPos = useMemo(() => {
    if (!levelData) return [0, 5, 0];
    const tileSize = 2;
    const offsetX = (levelData.width / 64 * tileSize) / 2;
    const offsetZ = (levelData.height / 64 * tileSize) / 2;
    return [(levelData.startX / 64) * tileSize - offsetX, 5, (levelData.startY / 64) * tileSize - offsetZ];
  }, [levelData]);

  return (
    <div className="w-full h-full bg-slate-900 relative cursor-crosshair">
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows camera={{ fov: 60 }}>
          <SoftShadows size={20} samples={10} focus={0.5} />
          {/* Iluminação Natural e Tempestade */}
          <color attach="background" args={['#0a0f14']} />
          <fog attach="fog" args={['#0a0f14', 5, 30]} />
          <ambientLight intensity={0.2} color="#4b6584" />
          <directionalLight castShadow position={[10, 50, 10]} intensity={1.5} color="#d1d8e0">
            <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30, 0.1, 100]} />
          </directionalLight>
          
          {/* Efeito de Chuva / Tempestade */}
          <Sparkles count={8000} scale={[200, 50, 200]} size={3} speed={2} opacity={0.6} color="#82ccdd" position={[0, 20, 0]} />
          
          <Environment preset="night" />
          
          <Suspense fallback={
            <Text position={[0, 2, -5]} color="white">Carregando Mundo 3D...</Text>
          }>
            <Physics gravity={[0, -9.81, 0]}>
              <PlayerController startPosition={startPos} />
              <FirstPersonBody />
              <CompanionDrone />
              
              <Floor args={[200, 1, 200]} />
              
              {mapElements}
            </Physics>
            
          </Suspense>
          
          <PointerLockControls />
        </Canvas>
      </KeyboardControls>
      
      {/* Click to start overlay for PointerLock */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded pointer-events-none text-center">
        Clique na tela para focar e jogar<br/><span className="text-sm text-slate-300">W, A, S, D para mover. Espaço para pular. ESC para pausar.</span>
      </div>
    </div>
  );
};
