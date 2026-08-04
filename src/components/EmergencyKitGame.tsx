import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Droplet,
  Flashlight,
  Volume2,
  Cross,
  Radio,
  FileText,
  Apple,
  CloudRain,
  Gamepad2,
  Tv,
  Sparkles,
  Smile,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Award,
  Briefcase,
  Star,
} from 'lucide-react';
import { EMERGENCY_KIT_ITEMS } from '../data/emergencyKit';
import { KitItem } from '../types';

interface EmergencyKitGameProps {
  onUnlockBadge: (badgeId: string) => void;
  onAddStars: (points: number) => void;
  onSpeak: (text: string) => void;
}

export const EmergencyKitGame: React.FC<EmergencyKitGameProps> = ({
  onUnlockBadge,
  onAddStars,
  onSpeak,
}) => {
  const [packedIds, setPackedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'info';
  } | null>({
    text: 'Clique nos objetos para colocar na mochila de emergência! Precisamos de 8 itens essenciais.',
    type: 'info',
  });
  const [isCompleted, setIsCompleted] = useState(false);

  const totalEssentialCount = EMERGENCY_KIT_ITEMS.filter((i) => i.category === 'essential').length;

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Droplet':
        return <Droplet className="w-6 h-6 text-cyan-600" />;
      case 'Flashlight':
        return <Flashlight className="w-6 h-6 text-amber-500" />;
      case 'Volume2':
        return <Volume2 className="w-6 h-6 text-orange-500" />;
      case 'Cross':
        return <Cross className="w-6 h-6 text-red-600" />;
      case 'Radio':
        return <Radio className="w-6 h-6 text-emerald-600" />;
      case 'FileText':
        return <FileText className="w-6 h-6 text-blue-600" />;
      case 'Apple':
        return <Apple className="w-6 h-6 text-rose-500" />;
      case 'CloudRain':
        return <CloudRain className="w-6 h-6 text-sky-600" />;
      case 'Gamepad2':
        return <Gamepad2 className="w-6 h-6 text-purple-600" />;
      case 'Tv':
        return <Tv className="w-6 h-6 text-slate-600" />;
      case 'Sparkles':
        return <Sparkles className="w-6 h-6 text-yellow-500" />;
      default:
        return <Smile className="w-6 h-6 text-indigo-600" />;
    }
  };

  const handleItemClick = (item: KitItem) => {
    if (packedIds.includes(item.id)) {
      // Remove item
      const updated = packedIds.filter((id) => id !== item.id);
      setPackedIds(updated);
      setFeedback({
        text: `Você tirou "${item.name}" da mochila.`,
        type: 'info',
      });
      return;
    }

    if (item.category === 'essential') {
      const nextPacked = [...packedIds, item.id];
      setPackedIds(nextPacked);
      onAddStars(10);

      const isWin = nextPacked.length === totalEssentialCount;

      if (isWin) {
        setIsCompleted(true);
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });
        onUnlockBadge('b_kit');
        onAddStars(100);
        const winMsg = 'PARABÉNS! Você montou a mochila de emergência perfeita! Ganhou o emblema Mestre da Mochila e 100 estrelas!';
        setFeedback({
          text: winMsg,
          type: 'success',
        });
        onSpeak(winMsg);
      } else {
        const msg = `Excelente escolha! ${item.name}: ${item.whyNeeded}`;
        setFeedback({
          text: msg,
          type: 'success',
        });
        onSpeak(`Item certo! ${item.name}`);
      }
    } else {
      const warnMsg = `Atenção! ${item.whyNeeded}`;
      setFeedback({
        text: warnMsg,
        type: 'warning',
      });
      onSpeak(warnMsg);
    }
  };

  const handleReset = () => {
    setPackedIds([]);
    setIsCompleted(false);
    setFeedback({
      text: 'Mochila esvaziada! Vamos montar tudo de novo?',
      type: 'info',
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6">
      {/* Title Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-900 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-2">
          <Briefcase className="w-4 h-4" />
          Jogo 1: Mochila de Emergência
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
          Monte a Mochila do Defensor Mirim! 🎒
        </h2>
        <p className="text-slate-600 font-medium text-sm sm:text-base mt-1 max-w-lg mx-auto">
          Sua missão é escolher os <span className="text-purple-600 font-extrabold">{totalEssentialCount} itens essenciais</span> que não podem faltar para proteger sua família em emergências.
        </p>
      </div>

      {/* Progress & Feedback Banner */}
      <div className="bg-white border-2 border-purple-200 rounded-3xl p-4 sm:p-5 shadow-lg mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-700">Mochila:</span>
            <span className="text-base font-extrabold text-purple-700 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200">
              {packedIds.length} / {totalEssentialCount} Itens
            </span>
          </div>

          <div className="w-full sm:w-48 bg-slate-100 h-3.5 rounded-full overflow-hidden border border-slate-200">
            <motion.div
              className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(packedIds.length / totalEssentialCount) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar
          </button>
        </div>

        {/* Feedback Bar */}
        {feedback && (
          <motion.div
            key={feedback.text}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                : feedback.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border border-amber-300'
                : 'bg-purple-50 text-purple-900 border border-purple-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : feedback.type === 'warning' ? (
              <XCircle className="w-5 h-5 text-amber-600 shrink-0" />
            ) : (
              <Sparkles className="w-5 h-5 text-purple-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </motion.div>
        )}
      </div>

      {/* Completion Modal Celebration */}
      {isCompleted && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 text-white p-6 sm:p-8 rounded-3xl shadow-2xl mb-8 text-center relative overflow-hidden"
        >
          <Award className="w-16 h-16 mx-auto mb-2 text-yellow-200 animate-bounce" />
          <h3 className="text-2xl sm:text-3xl font-black mb-2">
            🏆 MESTRE DA MOCHILA DESBLOQUEADO!
          </h3>
          <p className="font-bold text-sm sm:text-base max-w-md mx-auto opacity-95">
            Você é um verdadeiro herói da Defesa Civil! Sua mochila de emergência está pronta e equipada com tudo o que é vital para salvar o dia!
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/40 font-extrabold text-sm">
            <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
            +100 Estrelas de Bônus Conquistadas!
          </div>
        </motion.div>
      )}

      {/* Items Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {EMERGENCY_KIT_ITEMS.map((item) => {
          const isPacked = packedIds.includes(item.id);

          return (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleItemClick(item)}
              className={`p-4 rounded-3xl border-3 text-left transition-all relative flex flex-col justify-between h-44 shadow-md ${
                isPacked
                  ? 'bg-purple-500 text-white border-purple-600 shadow-purple-500/30 ring-4 ring-purple-200'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`p-2.5 rounded-2xl ${
                    isPacked ? 'bg-white/20 text-white' : 'bg-slate-100'
                  }`}
                >
                  {renderIcon(item.icon)}
                </div>

                {isPacked && (
                  <span className="bg-white text-purple-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow">
                    Na Mochila ✓
                  </span>
                )}
              </div>

              <div>
                <h4
                  className={`font-black text-sm sm:text-base leading-tight ${
                    isPacked ? 'text-white' : 'text-slate-800'
                  }`}
                >
                  {item.name}
                </h4>
                <p
                  className={`text-[11px] font-medium mt-1 line-clamp-2 ${
                    isPacked ? 'text-purple-100' : 'text-slate-500'
                  }`}
                >
                  {item.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
