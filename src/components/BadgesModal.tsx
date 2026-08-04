import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  X,
  Award,
  Briefcase,
  Crown,
  MessageCircle,
  ShieldCheck,
  Lock,
  CheckCircle2,
  Star,
  Sparkles,
} from 'lucide-react';
import { Badge } from '../types';

interface BadgesModalProps {
  isOpen: boolean;
  onClose: () => void;
  badges: Badge[];
  starsScore: number;
}

export const BadgesModal: React.FC<BadgesModalProps> = ({
  isOpen,
  onClose,
  badges,
  starsScore,
}) => {
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  const fireConfetti = () => {
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'],
      });
    } catch {
      // Fallback if confetti context unavailable
    }
  };

  useEffect(() => {
    if (isOpen && unlockedCount > 0) {
      fireConfetti();
    }
  }, [isOpen, unlockedCount]);

  if (!isOpen) return null;

  const renderBadgeIcon = (iconName: string) => {
    switch (iconName) {
      case 'Briefcase':
        return <Briefcase className="w-8 h-8" />;
      case 'Crown':
        return <Crown className="w-8 h-8" />;
      case 'MessageCircle':
        return <MessageCircle className="w-8 h-8" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-8 h-8" />;
      default:
        return <Award className="w-8 h-8" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white border-4 border-orange-400 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-md">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  Galeria de Emblemas Mirins
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  {unlockedCount} de {badges.length} Conquistas Desbloqueadas
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stars Score Banner */}
          <div className="my-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between px-4">
            <div className="flex items-center gap-2 font-black text-sm">
              <Star className="w-5 h-5 fill-yellow-300 text-yellow-300 animate-spin" />
              <span>Pontuação Total:</span>
            </div>
            <span className="text-xl font-black">{starsScore} Estrelas</span>
          </div>

          {/* Badges List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 my-2">
            {badges.map((b) => (
              <div
                key={b.id}
                onClick={() => b.unlocked && fireConfetti()}
                className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
                  b.unlocked
                    ? 'bg-orange-50/70 border-orange-300 text-slate-800 shadow-sm cursor-pointer hover:bg-orange-100/70 active:scale-98'
                    : 'bg-slate-50 border-slate-200 opacity-60 text-slate-500'
                }`}
                title={b.unlocked ? 'Clique para comemorar!' : 'Conclua os desafios para desbloquear'}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                    b.unlocked
                      ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {renderBadgeIcon(b.icon)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-black text-base text-slate-800">{b.title}</h4>
                    {b.unlocked ? (
                      <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-xs">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Conquistado! <Sparkles className="w-3 h-3 text-amber-500" />
                      </span>
                    ) : (
                      <span className="bg-slate-200 text-slate-600 font-bold text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Bloqueado
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-600 mt-1">{b.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Close */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <button
              onClick={onClose}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition-colors"
            >
              Fechar Galeria
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
