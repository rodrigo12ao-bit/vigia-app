import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, ArrowRight, Sparkles } from 'lucide-react';
import { LevelData } from '../../types';

interface TrueFalseGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const TrueFalseGame: React.FC<TrueFalseGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const questions = level.content.questions as any[];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);

  const q = questions[currentIdx];

  const handleAnswer = (answer: boolean) => {
    setSelectedAnswer(answer);
    const correct = answer === q.isTrue;
    setIsCorrect(correct);
    setFeedback(q.explanation);

    if (correct) {
      setScore((prev) => prev + 25);
      if (onSpeak) onSpeak(`Muito bem! ${q.explanation}`);
    } else {
      if (onSpeak) onSpeak(`Quase lá! ${q.explanation}`);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setFeedback(null);
      setIsCorrect(null);
    } else {
      const stars = score >= 50 ? 3 : score >= 25 ? 2 : 1;
      onComplete(stars, Math.max(30, score));
    }
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-indigo-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-indigo-700 tracking-wider bg-indigo-100 px-3 py-1 rounded-full">
            ✔️❌ Verdadeiro ou Falso
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <span className="text-sm font-black text-indigo-600">
          {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Question Card */}
      <div className="bg-gradient-to-b from-indigo-50 to-purple-50 border-2 border-indigo-200 p-6 rounded-3xl mb-6 shadow-sm">
        <p className="text-base sm:text-lg font-bold text-slate-800 leading-relaxed text-center">
          "{q.statement}"
        </p>
      </div>

      {/* Answer Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => handleAnswer(true)}
          disabled={selectedAnswer !== null}
          className={`p-5 rounded-2xl border-4 font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 ${
            selectedAnswer === true
              ? isCorrect
                ? 'bg-emerald-500 text-white border-emerald-600'
                : 'bg-red-500 text-white border-red-600'
              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}
        >
          <CheckCircle2 className="w-8 h-8" />
          <span>VERDADEIRO</span>
        </button>

        <button
          onClick={() => handleAnswer(false)}
          disabled={selectedAnswer !== null}
          className={`p-5 rounded-2xl border-4 font-black text-base sm:text-lg flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 ${
            selectedAnswer === false
              ? isCorrect
                ? 'bg-emerald-500 text-white border-emerald-600'
                : 'bg-red-500 text-white border-red-600'
              : 'bg-red-50 hover:bg-red-100 text-red-800 border-red-300'
          }`}
        >
          <XCircle className="w-8 h-8" />
          <span>FALSO</span>
        </button>
      </div>

      {/* Feedback & Next */}
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-2xl mb-6 text-xs sm:text-sm font-bold flex items-start gap-2.5"
        >
          <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </motion.div>
      )}

      {selectedAnswer !== null && (
        <div className="text-right">
          <button
            onClick={handleNext}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>{currentIdx < questions.length - 1 ? 'Próxima Afirmação' : 'Concluir Fase'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
