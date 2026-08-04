import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  Award,
  RotateCcw,
  Star,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { QUIZ_QUESTIONS } from '../data/quizzes';

interface QuizGameProps {
  onUnlockBadge: (badgeId: string) => void;
  onAddStars: (points: number) => void;
  onSpeak: (text: string) => void;
}

export const QuizGame: React.FC<QuizGameProps> = ({
  onUnlockBadge,
  onAddStars,
  onSpeak,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const currentQ = QUIZ_QUESTIONS[currentIndex];

  const handleSelectOption = (optIdx: number) => {
    if (isAnswered) return;

    setSelectedOption(optIdx);
    setIsAnswered(true);

    const isCorrect = optIdx === currentQ.correctIndex;

    if (isCorrect) {
      const newScore = score + 1;
      setScore(newScore);
      onAddStars(20);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });

      if (newScore === 3) {
        onUnlockBadge('b_quiz_bronze');
      }

      onSpeak(currentQ.praiseMessage);
    } else {
      onSpeak('Ops! Não foi dessa vez. Veja a explicação e aprenda a resposta certa!');
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < QUIZ_QUESTIONS.length) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
      if (score === QUIZ_QUESTIONS.length) {
        onUnlockBadge('b_quiz_gold');
        onAddStars(100);
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.5 },
        });
        onSpeak('Incrível! Você gabaritou o Quiz e ganhou o Emblema Ouro da Defesa Civil!');
      } else {
        onSpeak(`Parabéns! Você completou o quiz com ${score} acertos de ${QUIZ_QUESTIONS.length}!`);
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setIsFinished(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6">
      {/* Title Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-900 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-2">
          <HelpCircle className="w-4 h-4" />
          Jogo 2: Quiz da Defesa Civil
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
          Quiz do Defensor Mirim! 🧠⭐
        </h2>
        <p className="text-slate-600 font-medium text-sm sm:text-base mt-1">
          Teste seus conhecimentos de prevenção, acerte as perguntas e ganhe emblemas heroicos!
        </p>
      </div>

      {!isFinished ? (
        <div className="bg-white border-2 border-blue-200 rounded-3xl p-5 sm:p-7 shadow-xl relative overflow-hidden">
          {/* Progress Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <span className="text-xs font-extrabold text-blue-700 uppercase tracking-wide">
              Pergunta {currentIndex + 1} de {QUIZ_QUESTIONS.length}
            </span>
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full text-xs font-black">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              <span>{score} Acertos</span>
            </div>
          </div>

          {/* Category Tag */}
          <span className="bg-blue-100 text-blue-800 text-[11px] font-extrabold px-3 py-1 rounded-full inline-block mb-3">
            Tema: {currentQ.topic}
          </span>

          {/* Question Text */}
          <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-6 leading-snug">
            {currentQ.question}
          </h3>

          {/* Options Grid */}
          <div className="space-y-3 mb-6">
            {currentQ.options.map((opt, optIdx) => {
              const isSelected = selectedOption === optIdx;
              const isCorrect = optIdx === currentQ.correctIndex;

              let btnStyle =
                'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-blue-300';

              if (isAnswered) {
                if (isCorrect) {
                  btnStyle = 'bg-emerald-500 text-white border-emerald-600 font-bold shadow-lg shadow-emerald-500/20';
                } else if (isSelected) {
                  btnStyle = 'bg-rose-500 text-white border-rose-600 font-bold';
                } else {
                  btnStyle = 'bg-slate-50 text-slate-400 border-slate-200 opacity-50';
                }
              }

              return (
                <button
                  key={optIdx}
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all font-semibold text-sm sm:text-base flex items-center justify-between shadow-sm ${btnStyle}`}
                >
                  <span className="flex-1 pr-2">{opt}</span>
                  {isAnswered && isCorrect && <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />}
                  {isAnswered && isSelected && !isCorrect && <XCircle className="w-5 h-5 shrink-0 text-white" />}
                </button>
              );
            })}
          </div>

          {/* Answer Explanation & Praise Banner */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-2xl mb-6 text-xs sm:text-sm font-bold ${
                  selectedOption === currentQ.correctIndex
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                    : 'bg-amber-50 text-amber-900 border border-amber-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-sm font-black">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  {selectedOption === currentQ.correctIndex
                    ? currentQ.praiseMessage
                    : 'Aprendendo com a DC Assistente:'}
                </div>
                <p className="font-medium">{currentQ.explanation}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Next Button */}
          {isAnswered && (
            <button
              onClick={handleNext}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black py-3.5 px-6 rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-transform active:scale-98"
            >
              <span>{currentIndex + 1 === QUIZ_QUESTIONS.length ? 'Ver Resultado Final' : 'Próxima Pergunta'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      ) : (
        /* Quiz Summary / Completion Screen */
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white border-2 border-blue-200 rounded-3xl p-6 sm:p-8 text-center shadow-2xl"
        >
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center text-white shadow-xl mb-4">
            <Award className="w-10 h-10" />
          </div>

          <h3 className="text-2xl sm:text-3xl font-black text-slate-800 mb-2">
            Quiz Concluído com Sucesso! 🌟
          </h3>

          <p className="text-slate-600 font-bold text-base sm:text-lg mb-4">
            Você acertou <span className="text-blue-600 font-black">{score}</span> de{' '}
            <span className="text-blue-600 font-black">{QUIZ_QUESTIONS.length}</span> perguntas!
          </p>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl max-w-md mx-auto mb-6 text-sm text-slate-700 font-medium">
            {score === QUIZ_QUESTIONS.length ? (
              <p className="text-emerald-800 font-bold flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Pontuação Máxima! Você conquistou o Emblema Ouro da Defesa Civil!
              </p>
            ) : score >= 3 ? (
              <p className="text-blue-800 font-bold">
                Excelente resultado! Você já garantiu o Emblema Defensor Mirim Aprendiz!
              </p>
            ) : (
              <p className="text-slate-700 font-semibold">
                Muito bom esforço! Que tal tentar de novo para gabaritar e ganhar todos os emblemas?
              </p>
            )}
          </div>

          <button
            onClick={handleRestart}
            className="bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black py-3.5 px-8 rounded-2xl shadow-lg shadow-orange-500/30 inline-flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Jogar Quiz Novamente
          </button>
        </motion.div>
      )}
    </div>
  );
};
