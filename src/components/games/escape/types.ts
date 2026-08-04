export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'keycard' | 'lever' | 'valve' | 'sandbag' | 'flashlight' | 'medkit' | 'radio' | 'whistle';
  icon: string;
  description: string;
  usableOn?: string[]; // IDs of targets this item can be used on
}

export interface ThrownItem {
  id: string;
  itemId: string;
  position: [number, number, number];
  velocity: [number, number, number];
}

export interface EscapeGameState {
  score: number;
  health: number;
  maxHealth: number;
  inventory: InventoryItem[];
  selectedItem: InventoryItem | null;
  objective: string;
  nearbyAction?: {
    type: 'switch' | 'gate' | 'item' | 'vigia' | 'hazard' | 'bridge';
    id: string;
    label: string;
    requiredItem?: string;
  } | null;
}

export type TileType = 
  | 'ground' 
  | 'wall' 
  | 'water' 
  | 'hazard' 
  | 'safezone' 
  | 'item'
  | 'switch'
  | 'gate'
  | 'highground'
  | 'mud'
  | 'building'
  | 'bridge'
  | 'crate';

export interface TileData {
  type: TileType;
  id?: string;
  itemId?: string;
  itemType?: string;
  message?: string;
  height?: number;
}

export interface InteractiveSwitch {
  id: string;
  x: number;
  y: number;
  z?: number;
  name: string;
  isActivated: boolean;
  requiredItemId?: string; // E.g., 'item_lever' needed before switch can be flipped
  targetGateId?: string;
  targetHazardId?: string;
  message: string;
}

export interface InteractiveGate {
  id: string;
  x: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  isLocked: boolean;
  requiredKeyId?: string; // E.g., 'item_keycard' or 'item_masterkey'
  name: string;
  message: string;
}

export interface HazardData {
  id: string;
  x: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  type: 'water' | 'current' | 'wire' | 'flood' | 'mud' | 'falling_debris';
  message: string;
  active: boolean;
  damage?: number;
  requiredItemToBypass?: string; // E.g., 'item_sandbag' to bridge water
}

export interface LevelData {
  id: string;
  name: string;
  subtitle: string;
  objective: string;
  width: number;
  height: number;
  gridSize: number;
  startX: number;
  startY: number;
  tiles: (TileData | null)[][];
  hazards: HazardData[];
  switches?: InteractiveSwitch[];
  gates?: InteractiveGate[];
  safeZone: { x: number; y: number; w: number; h: number };
  vigiaTips?: { x: number; y: number; message: string; title: string }[];
}

export interface FloatingText {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  createdAt: number;
}

