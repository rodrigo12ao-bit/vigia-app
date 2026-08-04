import React, { useState } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { LevelData } from '../../types';

interface QuizChallengeGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const QuizChallengeGame: React.FC<QuizChallengeGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const questions = level.content.questions as any[];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);

  const q = questions[currentIdx];

  const handleOptionClick = (idx: number) => {
    setSelectedIdx(idx);
    const correct = idx === q.correctIndex;
    setIsCorrect(correct);
    setFeedback(q.explanation);

    if (correct) {
      setScore((prev) => prev + 30);
      if (onSpeak) onSpeak(`Muito bem! Resposta correta. ${q.explanation}`);
    } else {
      if (onSpeak) onSpeak(`Quase lá! ${q.explanation}`);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setSelectedIdx(null);
      setFeedback(null);
      setIsCorrect(null);
    } else {
      const stars = score >= 50 ? 3 : score >= 30 ? 2 : 1;
      onComplete(stars, Math.max(40, score));
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-blue-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-blue-700 tracking-wider bg-blue-100 px-3 py-1 rounded-full">
            🧠 Desafio Quiz
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <span className="text-sm font-black text-blue-600">
          {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Question */}
      <div className="bg-gradient-to-b from-blue-50 to-sky-50 border-2 border-blue-200 p-5 sm:p-6 rounded-3xl mb-6 shadow-sm">
        <p className="text-base sm:text-lg font-black text-slate-900 leading-relaxed flex items-start gap-2">
          <HelpCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
          <span>{q.question}</span>
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3 mb-6">
        {q.options.map((opt: string, idx: number) => {
          const isSelected = selectedIdx === idx;
          return (
            <button
              key={idx}
              onClick={() => handleOptionClick(idx)}
              disabled={selectedIdx !== null}
              className={`w-full text-left p-4 rounded-2xl border-2 font-bold text-xs sm:text-sm transition-all flex items-start gap-3 shadow-sm ${
                isSelected
                  ? isCorrect
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : 'bg-amber-500 text-white border-amber-600'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300'
              }`}
            >
              <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1 leading-snug">{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback & Next */}
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-50 border border-blue-200 text-blue-950 rounded-2xl mb-6 text-xs sm:text-sm font-bold flex items-start gap-2.5"
        >
          <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </motion.div>
      )}

      {selectedIdx !== null && (
        <div className="text-right">
          <button
            onClick={handleNext}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>{currentIdx < questions.length - 1 ? 'Próxima Pergunta' : 'Concluir Desafio'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
