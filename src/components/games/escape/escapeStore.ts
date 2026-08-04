import { create } from 'zustand';
import { InventoryItem, ThrownItem } from './types';

interface EscapeState {
  health: number;
  score: number;
  inventory: InventoryItem[];
  unlockedGates: string[];
  activeSwitches: string[];
  isPaused: boolean;
  phase: number;
  message: string;
  isSpeaking: boolean;
  isFlashlightOn: boolean;
  isPunching: boolean;
  heldItem: string | null;
  thrownItems: ThrownItem[];
  flashlightBattery: number;
  setHealth: (h: number) => void;
  addScore: (s: number) => void;
  addToInventory: (item: InventoryItem) => void;
  removeFromInventory: (itemId: string) => void;
  toggleFlashlight: () => void;
  setFlashlightBattery: (val: number | ((prev: number) => number)) => void;
  setPunching: (punching: boolean) => void;
  setHeldItem: (itemId: string | null) => void;
  throwItem: (item: ThrownItem) => void;
  unlockGate: (id: string) => void;
  activateSwitch: (id: string) => void;
  setIsPaused: (p: boolean) => void;
  setPhase: (p: number) => void;
  setMessage: (m: string) => void;
  setIsSpeaking: (s: boolean) => void;
  resetPhase: () => void;
}

export const useEscapeStore = create<EscapeState>((set) => ({
  health: 100, // Adjusted to match level1.ts hazards which deal 10-30 damage
  score: 0,
  inventory: [],
  unlockedGates: [],
  activeSwitches: [],
  isPaused: false,
  phase: 1,
  message: '',
  isSpeaking: false,
  isFlashlightOn: false,
  flashlightBattery: 100,
  isPunching: false,
  heldItem: null,
  thrownItems: [],
  setHealth: (h) => set({ health: Math.min(100, Math.max(0, h)) }),
  addScore: (s) => set((state) => ({ score: state.score + s })),
  addToInventory: (item) => set((state) => ({ inventory: [...state.inventory, item] })),
  removeFromInventory: (itemId) => set((state) => ({ inventory: state.inventory.filter(i => i.id !== itemId) })),
  toggleFlashlight: () => set((state) => ({ isFlashlightOn: state.flashlightBattery > 0 ? !state.isFlashlightOn : false })),
  setFlashlightBattery: (val) => set((state) => {
    const newVal = typeof val === 'function' ? val(state.flashlightBattery) : val;
    const newBattery = Math.max(0, Math.min(100, newVal));
    return { flashlightBattery: newBattery, isFlashlightOn: newBattery > 0 ? state.isFlashlightOn : false };
  }),
  setPunching: (punching) => set({ isPunching: punching }),
  setHeldItem: (itemId) => set({ heldItem: itemId }),
  throwItem: (item) => set((state) => {
    const newItems = [...state.thrownItems, item];
    if (newItems.length > 15) newItems.shift(); // Memory Leak fix: keep max 15
    return { thrownItems: newItems };
  }),
  unlockGate: (id) => set((state) => ({ unlockedGates: [...state.unlockedGates, id] })),
  activateSwitch: (id) => set((state) => ({ activeSwitches: [...state.activeSwitches, id] })),
  setIsPaused: (p) => set({ isPaused: p }),
  setPhase: (p) => set({ phase: p }),
  setMessage: (m) => set({ message: m }),
  setIsSpeaking: (s) => set({ isSpeaking: s }),
  resetPhase: () => set({ health: 100, inventory: [], unlockedGates: [], activeSwitches: [], isPaused: false, message: '', isSpeaking: false, isFlashlightOn: false }),
}));
