import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Sparkles, User, Shield } from 'lucide-react';
import { PLAYER_AVATARS, PlayerAvatarOption } from '../../data/playerAvatarsData';
import { gameAudio } from '../../utils/gameAudio';

interface PlayerAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAvatarId: string;
  playerNickname: string;
  onSaveAvatar: (avatarId: string, nickname: string) => void;
}

export const PlayerAvatarModal: React.FC<PlayerAvatarModalProps> = ({
  isOpen,
  onClose,
  selectedAvatarId,
  playerNickname,
  onSaveAvatar,
}) => {
  const [currentId, setCurrentId] = useState(selectedAvatarId || 'hero_shield');
  const [nickname, setNickname] = useState(playerNickname || 'Heroi Mirim');

  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    gameAudio.playClick();
    setCurrentId(id);
  };

  const handleSave = () => {
    gameAudio.playCorrect();
    onSaveAvatar(currentId, nickname);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl relative overflow-hidden"
      >
        {/* Decorative ambient lights */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-lg shadow-orange-500/20 text-slate-950 font-black">
              👤
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Avatar de Videogame
              </span>
              <h3 className="text-xl font-black text-white mt-0.5">
                Escolha seu Heroi das Missões
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hero Nickname Input */}
        <div className="mb-5 relative z-10">
          <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span>Seu Nome de Jogador</span>
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ex: Guardião Leo"
            maxLength={20}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
          />
        </div>

        {/* Avatar Options Grid */}
        <div className="mb-6 relative z-10">
          <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Selecione a Classe de Heroi</span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
            {PLAYER_AVATARS.map((av: PlayerAvatarOption) => {
              const isSelected = av.id === currentId;

              return (
                <button
                  key={av.id}
                  onClick={() => handleSelect(av.id)}
                  className={`p-3 rounded-2xl border transition-all text-left flex flex-col items-center justify-between cursor-pointer active:scale-95 relative ${
                    isSelected
                      ? 'bg-gradient-to-b from-slate-800 to-indigo-950 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${av.bgColor} flex items-center justify-center text-2xl shadow-md my-1`}>
                    {av.icon}
                  </div>

                  <span className="font-black text-xs text-white text-center block mt-1 line-clamp-1">
                    {av.name}
                  </span>

                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border mt-1 ${av.badgeBg}`}>
                    {av.title}
                  </span>

                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save CTA */}
        <div className="flex justify-end gap-3 relative z-10 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-xs shadow-lg shadow-orange-500/20 hover:from-amber-300 hover:to-orange-400 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Salvar Avatar</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
