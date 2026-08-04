import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Shield, Check, Lock } from 'lucide-react';
import { ACCESSORIES } from '../../data/learningJourneyData';
import { AccessoryItem } from '../../types';

interface AvatarClosetModalProps {
  isOpen: boolean;
  onClose: () => void;
  userXp: number;
  unlockedAccessories: string[];
  equippedAccessory?: string;
  onEquipAccessory: (id: string | undefined) => void;
}

export const AvatarClosetModal: React.FC<AvatarClosetModalProps> = ({
  isOpen,
  onClose,
  userXp,
  unlockedAccessories,
  equippedAccessory,
  onEquipAccessory,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl border-4 border-amber-300 p-5 sm:p-6 max-w-xl w-full shadow-2xl relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-amber-100 rounded-2xl text-2xl">🪖</div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  Armário de Acessórios da Vigia
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  Desbloqueie equipamentos conforme ganha XP e conquista fases!
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User XP Stat */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-2xl mb-4 flex items-center justify-between shadow-md">
            <div>
              <span className="text-xs font-black uppercase text-amber-100 tracking-wider block">
                Seu XP Total
              </span>
              <span className="text-2xl font-black">{userXp} XP</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-amber-100 block">Equipamento Atual</span>
              <span className="text-sm font-black">
                {equippedAccessory
                  ? ACCESSORIES.find((a) => a.id === equippedAccessory)?.name || 'Nenhum'
                  : 'Nenhum (Padrão)'}
              </span>
            </div>
          </div>

          {/* Accessories Grid */}
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {ACCESSORIES.map((acc) => {
              const isUnlocked = unlockedAccessories.includes(acc.id) || userXp >= acc.requiredXp;
              const isEquipped = equippedAccessory === acc.id;

              return (
                <div
                  key={acc.id}
                  className={`p-3.5 rounded-2xl border-2 flex items-center justify-between gap-3 transition-all ${
                    isEquipped
                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                      : isUnlocked
                      ? 'bg-white border-slate-200 hover:border-amber-300'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-3xl p-2 bg-slate-100 rounded-xl shrink-0">
                      {acc.icon}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">{acc.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{acc.description}</p>
                      <span className="text-[10px] font-bold text-amber-700 block mt-0.5">
                        {isUnlocked ? '🔓 Desbloqueado' : `🔒 Requisito: ${acc.unlockRequirement}`}
                      </span>
                    </div>
                  </div>

                  <div>
                    {isUnlocked ? (
                      <button
                        onClick={() =>
                          onEquipAccessory(isEquipped ? undefined : acc.id)
                        }
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-transform active:scale-95 flex items-center gap-1 ${
                          isEquipped
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        {isEquipped ? (
                          <>
                            <Check className="w-4 h-4" /> Equipado
                          </>
                        ) : (
                          'Equipar'
                        )}
                      </button>
                    ) : (
                      <div className="p-2 bg-slate-200 text-slate-500 rounded-xl">
                        <Lock className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-900 text-white font-black text-xs px-6 py-2.5 rounded-xl shadow-sm"
            >
              Fechar Armário
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
