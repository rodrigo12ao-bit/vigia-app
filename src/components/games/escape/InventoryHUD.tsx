import React, { useEffect } from 'react';
import { useEscapeStore } from './escapeStore';
import { motion, AnimatePresence } from 'motion/react';

export const InventoryHUD = () => {
  const { inventory, health, setHealth, removeFromInventory, toggleFlashlight, isFlashlightOn, setMessage } = useEscapeStore();

  const slots = [0, 1, 2, 3]; // Slots 1, 2, 3, 4

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent acting if typing in a chat box
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const key = e.key;
      if (['1', '2', '3', '4'].includes(key)) {
        const index = parseInt(key) - 1;
        const item = inventory[index];
        if (!item) return;

        // Use Item Logic
        if (item.id === 'item_medkit') {
          if (health >= 100) {
            setMessage('Sua saúde já está no máximo!');
            return;
          }
          setHealth(health + 50);
          removeFromInventory(item.id);
          setMessage('Kit Médico usado! +50 HP');
        } else if (item.id === 'item_mochila') {
          toggleFlashlight();
          setMessage(isFlashlightOn ? 'Lanterna da mochila desligada.' : 'Lanterna da mochila ligada!');
        } else {
          setMessage(`O item ${item.name} é usado automaticamente nos lugares corretos.`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inventory, health, isFlashlightOn]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none">
      {slots.map(index => {
        const item = inventory[index];
        return (
          <div key={index} className={`w-14 h-14 bg-slate-800/80 border-2 rounded-lg flex flex-col items-center justify-center relative shadow-lg backdrop-blur-sm
            ${item && item.id === 'item_mochila' && isFlashlightOn ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-slate-600'}
          `}>
            <span className="absolute top-1 left-1 text-[10px] text-slate-400 font-bold">{index + 1}</span>
            <AnimatePresence>
              {item && (
                <motion.div 
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="text-2xl"
                  title={item.name}
                >
                  {item.icon || '📦'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
