import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ArrowRight, CheckCircle2, AlertCircle, Star, Compass } from 'lucide-react';
import { LevelData } from '../../types';

interface PathChoiceGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const PathChoiceGame: React.FC<PathChoiceGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const scenarios = level.content.scenarios as any[];
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ isSafe: boolean; text: string } | null>(null);
  const [mistakesCount, setMistakesCount] = useState(0);

  const currentScenario = scenarios[currentStepIndex];

  const handleSelectOption = (idx: number, option: any) => {
    setSelectedOptionIndex(idx);
    setFeedback({ isSafe: option.isSafe, text: option.feedback });

    if (!option.isSafe) {
      setMistakesCount((prev) => prev + 1);
    }

    const speakTextMsg = option.isSafe
      ? `Muito bem! ${option.feedback}`
      : `Quase lá! ${option.feedback}`;

    if (onSpeak) {
      onSpeak(speakTextMsg);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < scenarios.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      setSelectedOptionIndex(null);
      setFeedback(null);
    } else {
      // Completed all stages!
      const stars = mistakesCount === 0 ? 3 : mistakesCount <= 2 ? 2 : 1;
      const score = Math.max(30, 80 - mistakesCount * 10);
      onComplete(stars, score);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-amber-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-amber-700 tracking-wider bg-amber-100 px-3 py-1 rounded-full">
            🗺️ Navegação de Segurança
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 block">Etapa</span>
          <span className="text-lg font-black text-amber-600">
            {currentStepIndex + 1} / {scenarios.length}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6 border border-slate-200">
        <div
          className="bg-amber-500 h-full transition-all duration-500"
          style={{ width: `${((currentStepIndex + 1) / scenarios.length) * 100}%` }}
        />
      </div>

      {/* Current Scenario Card */}
      <div className="bg-gradient-to-b from-amber-50 to-orange-50 border-2 border-amber-200 p-5 sm:p-6 rounded-3xl shadow-sm mb-6">
        <h4 className="text-base sm:text-lg font-black text-amber-950 mb-2 flex items-center gap-2">
          <Compass className="w-5 h-5 text-amber-600" />
          {currentScenario.stepTitle}
        </h4>
        <p className="text-sm font-bold text-slate-700 leading-relaxed">
          {currentScenario.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3 mb-6">
        {currentScenario.options.map((opt: any, idx: number) => {
          const isSelected = selectedOptionIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => handleSelectOption(idx, opt)}
              className={`w-full text-left p-4 rounded-2xl border-2 font-bold text-sm sm:text-base transition-all flex items-start gap-3 shadow-sm ${
                isSelected
                  ? opt.isSafe
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-300'
                    : 'bg-amber-100 border-amber-500 text-amber-950'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 hover:border-amber-400'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 mt-0.5 ${
                  isSelected
                    ? opt.isSafe
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {String.fromCharCode(65 + idx)}
              </div>
              <span className="flex-1 leading-snug">{opt.text}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback Banner */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 sm:p-5 rounded-3xl border-2 mb-6 shadow-sm ${
              feedback.isSafe
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white rounded-2xl shadow-sm text-2xl shrink-0">
                {feedback.isSafe ? '🎉' : '💡'}
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider block opacity-80">
                  {feedback.isSafe ? 'Excelente Atitude Segura!' : 'Dica da Vigia'}
                </span>
                <p className="text-sm font-bold mt-0.5 leading-relaxed">
                  {feedback.text}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Step Control */}
      {feedback && feedback.isSafe && (
        <div className="text-right">
          <button
            onClick={handleNextStep}
            className="bg-amber-500 hover:bg-amber-600 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>{currentStepIndex < scenarios.length - 1 ? 'Próxima Etapa' : 'Concluir Navegação'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
