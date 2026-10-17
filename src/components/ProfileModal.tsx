import {AccountDataControls} from './AccountDataControls';
import {useDialog} from '../hooks/useDialog';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Star,
  Award,
  Gamepad2,
  LogOut,
  Trash2,
  Check,
  Edit2,
  ShieldCheck,
  User,
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { Badge } from '../types';

interface ProfileModalProps {
  userId?:string;userRole?:string;
  isOpen: boolean;
  onClose: () => void;
  userEmail: string | null;
  nickname: string;
  onUpdateNickname: (newNick: string) => void;
  starsScore: number;
  badges: Badge[];
  completedGamesCount: number;
  isGuest: boolean;
  onSignOut: () => void;
  onAccountDeleted:(deletedUid:string)=>void|Promise<void>;
  onResetProgress: () => void;
  onOpenBadges?:()=>void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  userId,userRole,
  isOpen,
  onClose,
  userEmail,
  nickname,
  onUpdateNickname,
  starsScore,
  badges,
  completedGamesCount,
  isGuest,
  onSignOut,
  onAccountDeleted,
  onResetProgress,
  onOpenBadges,
}) => {
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [tempNick, setTempNick] = useState(nickname);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const dialogRef=useDialog(isOpen,onClose);
  if (!isOpen) return null;

  const unlockedBadges = badges.filter((b) => b.unlocked);

  const handleSaveNick = () => {
    if (tempNick.trim()) {
      onUpdateNickname(tempNick.trim());
    }
    setIsEditingNick(false);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Meu perfil"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col my-auto max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-5 text-white relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                <User className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <h2 className="text-lg font-black">Meu Perfil de Protetor</h2>
                <p className="text-xs text-indigo-100 font-medium">
                  {isGuest ? 'Modo Visitante' : userEmail || 'Conta Conectada'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
              title="Fechar" aria-label="Fechar perfil"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto space-y-5">
            {/* Nickname & Avatar Section */}
            <div className="bg-gradient-to-br from-indigo-50 to-orange-50 border border-indigo-100 p-4 rounded-2xl flex items-center gap-4">
              <div className="shrink-0 relative w-16 h-16">
                <Avatar interactive3D={false} size="sm" state="idle" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 block mb-0.5">
                  Apelido do Aprendiz
                </span>

                {isEditingNick ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={tempNick}
                      onChange={(e) => setTempNick(e.target.value)}
                      className="px-2 py-1 text-xs font-black bg-white border border-indigo-300 rounded-lg text-slate-800 w-full focus:outline-none"
                    />
                    <button
                      onClick={handleSaveNick}
                      className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shrink-0"
                      title="Salvar"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base text-slate-900 truncate">{nickname}</h3>
                    <button
                      onClick={() => {
                        setTempNick(nickname);
                        setIsEditingNick(true);
                      }}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                      title="Editar Apelido"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="mt-1 inline-flex items-center gap-1 bg-white/80 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-black text-indigo-900">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Protetor Nível {Math.floor(starsScore / 100) + 1}</span>
                </div>
              </div>
            </div>

            {/* Stats Overview Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-center">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400 mx-auto mb-1" />
                <span className="block text-lg font-black text-amber-900">{starsScore}</span>
                <span className="text-[10px] font-extrabold text-amber-700 uppercase">XP</span>
              </div>

              <div className="bg-purple-50 border border-purple-200 p-3 rounded-2xl text-center">
                <Award className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <span className="block text-lg font-black text-purple-900">
                  {unlockedBadges.length}/{badges.length}
                </span>
                <span className="text-[10px] font-extrabold text-purple-700 uppercase">Medalhas</span>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center">
                <Gamepad2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <span className="block text-lg font-black text-emerald-900">{completedGamesCount}</span>
                <span className="text-[10px] font-extrabold text-emerald-700 uppercase">Atividades</span>
              </div>
            </div>

            {/* Unlocked Badges Preview */}
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase text-slate-600 block">
                Conquistas Desbloqueadas ({unlockedBadges.length})
              </span>

              <div className="flex flex-wrap gap-1.5">
                {unlockedBadges.map((b) => (
                  <div
                    key={b.id}
                    className="bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-xl text-xs font-black text-orange-900 flex items-center gap-1 shadow-2xs"
                  >
                    <span>🏅</span>
                    <span>{b.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {userId&&<AccountDataControls uid={userId} role={userRole||'infantil'} onDeleted={onAccountDeleted}/>}
            {onOpenBadges&&<button className="vigia-link" onClick={onOpenBadges}>Ver todas as medalhas</button>}
            {/* Reset Confirmation Box */}
            {showConfirmReset ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-900 font-black text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Deseja zerar o XP e as medalhas?</span>
                </div>
                <p className="text-[11px] text-rose-800 font-medium">
                  O XP e as medalhas serão zerados. As atividades concluídas permanecem registradas; repetir a mesma atividade não dá outro prêmio.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      onResetProgress();
                      setShowConfirmReset(false);
                    }}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs"
                  >
                    Sim, Zerar
                  </button>
                </div>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={onClose}
                className="w-full btn-vigia-primary py-3 px-4 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 touch-target-min"
              >
                <span>Continuar Aprendendo</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className="py-2.5 px-3 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer touch-target-min"
                >
                  <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Zerar XP e medalhas</span>
                </button>

                <button
                  onClick={onSignOut}
                  className="py-2.5 px-3 rounded-2xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer touch-target-min"
                >
                  <LogOut className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>{isGuest ? 'Trocar Conta' : 'Sair da Conta'}</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
