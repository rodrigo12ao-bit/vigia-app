import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, AlertTriangle, CheckCircle2, Sparkles, RefreshCw, Star, ArrowRight } from 'lucide-react';
import { LevelData } from '../../types';

interface HazardFinderGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const HazardFinderGame: React.FC<HazardFinderGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const content = level.content;
  const hotspots = content.hotspots as any[];

  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [activeHotspot, setActiveHotspot] = useState<any | null>(null);

  const handleHotspotClick = (hs: any) => {
    if (!foundIds.includes(hs.id)) {
      setFoundIds((prev) => [...prev, hs.id]);
    }
    setActiveHotspot(hs);

    const speakMsg = hs.isHazard
      ? `Atenção! ${hs.title}. ${hs.explanation}`
      : `Muito bem! ${hs.title}. ${hs.explanation}`;

    if (onSpeak) {
      onSpeak(speakMsg);
    }
  };

  const isFinished = foundIds.length === hotspots.length;

  const handleFinish = () => {
    // Determine stars: all found = 3 stars, >= 4 = 2 stars, else 1 star
    const stars = foundIds.length === hotspots.length ? 3 : foundIds.length >= 4 ? 2 : 1;
    const score = foundIds.length * 20;
    onComplete(stars, score);
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-cyan-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-cyan-700 tracking-wider bg-cyan-100 px-3 py-1 rounded-full">
            🔍 {content.scenarioTitle}
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 block">Progresso</span>
          <span className="text-lg font-black text-cyan-600">
            {foundIds.length} / {hotspots.length} Descobertos
          </span>
        </div>
      </div>

      <p className="text-sm font-bold text-slate-600 mb-4 bg-cyan-50/80 p-3 rounded-2xl border border-cyan-200">
        💡 {content.instructions}
      </p>

      {/* Interactive Visual Scenario Board */}
      <div className="relative bg-gradient-to-b from-sky-200 via-blue-100 to-amber-100 rounded-3xl p-6 sm:p-8 border-4 border-sky-300 min-h-[320px] flex flex-wrap items-center justify-center gap-4 sm:gap-6 shadow-inner overflow-hidden">
        {/* Scenario Background Rain Details */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:16px_16px]" />

        {hotspots.map((hs) => {
          const isDiscovered = foundIds.includes(hs.id);
          return (
            <motion.button
              key={hs.id}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleHotspotClick(hs)}
              className={`relative p-4 sm:p-5 rounded-3xl border-4 transition-all shadow-lg flex flex-col items-center justify-center gap-2 max-w-[150px] text-center ${
                isDiscovered
                  ? hs.isHazard
                    ? 'bg-red-50 border-red-400 text-red-900 shadow-red-200'
                    : 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-emerald-200'
                  : 'bg-white/90 hover:bg-white border-amber-300 text-slate-800 hover:border-amber-500 animate-pulse'
              }`}
            >
              <span className="text-3xl sm:text-4xl">{hs.icon}</span>
              <span className="text-xs font-extrabold leading-tight">{hs.title}</span>

              {isDiscovered && (
                <span className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md">
                  {hs.isHazard ? (
                    <AlertTriangle className="w-5 h-5 text-red-600 fill-red-100" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                  )}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Active Hotspot Explanation Modal / Card */}
      <AnimatePresence>
        {activeHotspot && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mt-5 p-4 sm:p-5 rounded-3xl border-2 shadow-md ${
              activeHotspot.isHazard
                ? 'bg-red-50 border-red-300 text-red-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white rounded-2xl shadow-sm shrink-0 text-2xl">
                {activeHotspot.isHazard ? '⚠️' : '🛡️'}
              </div>
              <div className="flex-1">
                <span className="text-xs font-black uppercase tracking-wider block opacity-75">
                  {activeHotspot.isHazard ? 'Situação de Risco Encontrada' : 'Atitude Segura Recomendada'}
                </span>
                <h4 className="text-base font-extrabold">{activeHotspot.title}</h4>
                <p className="text-xs sm:text-sm font-semibold mt-1 leading-relaxed">
                  {activeHotspot.explanation}
                </p>
                <p className="text-xs font-black mt-2 text-orange-700 flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-500" /> {activeHotspot.praise}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Complete Button */}
      {isFinished && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-6 text-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-5 rounded-3xl shadow-xl"
        >
          <div className="flex justify-center gap-1 mb-2">
            {[1, 2, 3].map((star) => (
              <Star key={star} className="w-8 h-8 fill-amber-300 text-amber-200 animate-bounce" />
            ))}
          </div>
          <h4 className="text-xl font-black">Sensacional! Você encontrou todos os pontos!</h4>
          <p className="text-xs font-bold text-emerald-100 mt-1 mb-4">
            Você aprendeu a diferenciar atitudes perigosas e seguras em enchentes!
          </p>

          <button
            onClick={handleFinish}
            className="bg-white text-emerald-800 hover:bg-emerald-50 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>Concluir Fase e Ganhar Estrelas</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </div>
  );
};
