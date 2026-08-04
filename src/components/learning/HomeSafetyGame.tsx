import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Shield, Sparkles, ArrowRight, Eye } from 'lucide-react';
import { LevelData } from '../../types';
import { gameAudio } from '../../utils/gameAudio';

interface HomeSafetyGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const HomeSafetyGame: React.FC<HomeSafetyGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const defaultItems = [
    {
      id: 'hs1',
      title: 'Panela com Cabo para Fora do Fogão',
      icon: '🍳',
      isHazard: true,
      explanation: 'PERIGO! Crianças e animais podem esbarrar no cabo e virar líquidos quentes. O cabo deve ficar voltado para dentro.',
      praise: 'Atenção nota 10! Guarde os cabos de panelas para o lado de dentro do fogão!',
    },
    {
      id: 'hs2',
      title: 'Calha do Telhado Cheia de Folhas Secas',
      icon: '🍂🏠',
      isHazard: true,
      explanation: 'PERIGO! Folhas entopem as calhas e fazem a água da chuva vazar para dentro das paredes e teto, danificando a estrutura.',
      praise: 'Ótima inspeção! Manter calhas limpas evita infiltrações perigosas.',
    },
    {
      id: 'hs3',
      title: 'Tomada com Vários Benjamins (Tês) Conectados',
      icon: '🔌⚡',
      isHazard: true,
      explanation: 'PERIGO! Sobrecarga na tomada provoca curtos-circuitos e incêndios graves na casa.',
      praise: 'Mandou bem! Nunca ligue muitos aparelhos fortes na mesma tomada.',
    },
    {
      id: 'hs4',
      title: 'Vela Acesa Perto da Cortina do Quarto',
      icon: '🕯️🪟',
      isHazard: true,
      explanation: 'PERIGO EXTREMO! O vento pode encostar a cortina na chama da vela e iniciar um fogo em segundos.',
      praise: 'Excelente observação! Velas devem ficar em suportes fundos longe de tecidos.',
    },
    {
      id: 'hs5',
      title: 'Extintor de Incêndio Válido e Acessível',
      icon: '🧯',
      isHazard: false,
      explanation: 'ATITUDE SEGUIRA! Ter um extintor no local correto ajuda em pequenos focos de fogo.',
      praise: 'Muito bem! Equipamentos de segurança salvam vidas!',
    },
    {
      id: 'hs6',
      title: 'Porta de Saída de Emergência Livre sem Obstáculos',
      icon: '🚪✨',
      isHazard: false,
      explanation: 'ATITUDE SEGURA! Corredores e portas limpas garantem que todos consigam sair rápido em emergências.',
      praise: 'Parabéns! Passagens desimpedidas são prioridade máxima!',
    },
  ];

  const items = level.content?.items || defaultItems;

  const [discoveredIds, setDiscoveredIds] = useState<string[]>([]);
  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const handleInspect = (item: any) => {
    if (discoveredIds.includes(item.id)) {
      setActiveItem(item);
      return;
    }

    gameAudio.playClick();
    const newDiscovered = [...discoveredIds, item.id];
    setDiscoveredIds(newDiscovered);
    setActiveItem(item);

    if (item.isHazard) {
      gameAudio.playCorrect();
      setScore((prev) => prev + 20);
      if (onSpeak) onSpeak(item.praise);
    } else {
      gameAudio.playCorrect();
      setScore((prev) => prev + 15);
      if (onSpeak) onSpeak(item.praise);
    }

    if (newDiscovered.length === items.length) {
      setTimeout(() => {
        setIsFinished(true);
        gameAudio.playVictory();
      }, 1500);
    }
  };

  const handleFinish = () => {
    const calculatedStars = score >= 90 ? 3 : score >= 60 ? 2 : 1;
    onComplete(calculatedStars, score);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-4 sm:p-6 shadow-2xl max-w-4xl mx-auto my-2">
      {/* HUD Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl text-amber-400">
            🔍
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              Inspeção da Casa
            </span>
            <h3 className="text-xl font-black text-white">{level.title}</h3>
          </div>
        </div>

        <div className="bg-slate-800 px-3.5 py-1.5 rounded-2xl border border-slate-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-black text-amber-300">
            {discoveredIds.length} / {items.length} Inspecionados
          </span>
        </div>
      </div>

      {!isFinished ? (
        <div className="space-y-6">
          <p className="text-xs font-bold text-slate-300 text-center uppercase tracking-wide">
            Clique nos objetos da casa para inspecionar perigos e ações seguras!
          </p>

          {/* Grid of Inspectable Objects */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item: any) => {
              const isDiscovered = discoveredIds.includes(item.id);

              return (
                <button
                  key={item.id}
                  onClick={() => handleInspect(item)}
                  className={`p-4 rounded-2xl border transition-all text-center flex flex-col items-center justify-between h-36 relative shadow-lg cursor-pointer active:scale-95 ${
                    isDiscovered
                      ? item.isHazard
                        ? 'bg-rose-950/60 border-rose-500/60 text-white shadow-rose-900/20'
                        : 'bg-emerald-950/60 border-emerald-500/60 text-white shadow-emerald-900/20'
                      : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <span className="text-4xl my-auto animate-bounce-slow">
                    {item.icon}
                  </span>
                  <span className="text-xs font-black line-clamp-2 leading-snug">
                    {item.title}
                  </span>

                  {isDiscovered && (
                    <span
                      className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        item.isHazard
                          ? 'bg-rose-500 text-white'
                          : 'bg-emerald-500 text-white'
                      }`}
                    >
                      {item.isHazard ? 'Perigo' : 'Seguro'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Detailed Info Card for Selected Item */}
          <AnimatePresence>
            {activeItem && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-2xl border ${
                  activeItem.isHazard
                    ? 'bg-rose-950/80 border-rose-500/50 text-rose-100'
                    : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl shrink-0">{activeItem.icon}</span>
                  <div>
                    <h4 className="font-black text-sm mb-1 flex items-center gap-2">
                      <span>{activeItem.title}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/30">
                        {activeItem.isHazard ? '🚨 Risco Identificado' : '🛡️ Atitude Recomendada'}
                      </span>
                    </h4>
                    <p className="text-xs font-medium leading-relaxed">
                      {activeItem.explanation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Victory Screen */
        <div className="text-center py-8 space-y-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 mx-auto flex items-center justify-center text-5xl shadow-2xl shadow-orange-500/40"
          >
            🏠✨
          </motion.div>

          <div>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-500/40">
              Inspeção da Casa Concluída!
            </span>
            <h3 className="text-2xl font-black text-white mt-2">
              Você é um Inspetor de Casa Segura!
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto mt-1 font-medium">
              Identificar riscos domésticos com antecedência evita acidentes e protege quem você mais ama.
            </p>
          </div>

          <button
            onClick={handleFinish}
            className="bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black px-8 py-3.5 rounded-2xl shadow-xl transition-all active:scale-95 text-sm cursor-pointer"
          >
            Receber Recompensas e Continuar 🛡️
          </button>
        </div>
      )}
    </div>
  );
};
