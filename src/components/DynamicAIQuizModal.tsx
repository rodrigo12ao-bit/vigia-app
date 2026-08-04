import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  X,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  Star,
  RefreshCw,
  HelpCircle,
  Zap,
} from 'lucide-react';

interface AIQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  rewardStars: number;
}

interface DynamicAIQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStars: (stars: number) => void;
  onSpeak?: (text: string) => void;
}

const TOPIC_OPTIONS = [
  { id: 'Enchentes', label: '🌧️ Enchentes & Alagamentos' },
  { id: 'Tempestades', label: '⚡ Tempestades & Raios' },
  { id: 'Deslizamentos', label: '⛰️ Deslizamentos em Morros' },
  { id: 'Incendios', label: '🔥 Prevenção a Incêndios' },
  { id: 'Mochila', label: '🎒 Mochila de Emergência' },
  { id: 'Numeros', label: '📞 Números da Defesa Civil' },
];

export const DynamicAIQuizModal: React.FC<DynamicAIQuizModalProps> = ({
  isOpen,
  onClose,
  onAddStars,
  onSpeak,
}) => {
  const [selectedTopic, setSelectedTopic] = useState('Enchentes');
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState<AIQuizQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  if (!isOpen) return null;

  const handleGenerateQuiz = async (topicToUse?: string) => {
    const topic = topicToUse || selectedTopic;
    setLoading(true);
    setQuizData(null);
    setSelectedOption(null);
    setSubmitted(false);
    setIsCorrect(false);

    try {
      const resp = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          difficulty: 'médio',
        }),
      });

      const data: AIQuizQuestion = await resp.json();
      setQuizData(data);
      if (onSpeak && data.question) {
        onSpeak(data.question);
      }
    } catch (err) {
      console.error('Erro ao gerar quiz IA:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (idx: number) => {
    if (submitted || !quizData) return;
    setSelectedOption(idx);
    setSubmitted(true);

    const correct = idx === quizData.correctIndex;
    setIsCorrect(correct);

    if (correct) {
      const stars = quizData.rewardStars || 15;
      onAddStars(stars);
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#10b981', '#ec4899', '#3b82f6'],
        });
      } catch (e) {}
      if (onSpeak) {
        onSpeak(`Resposta certa! Você ganhou ${stars} Estrelas Protetoras!`);
      }
    } else {
      if (onSpeak) {
        onSpeak('Não foi dessa vez! Veja a explicação para aprender a resposta correta.');
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border-2 border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Modal Header */}
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-4 sm:p-5 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/30">
                <Zap className="w-6 h-6 text-amber-300 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  Gerador de Desafios IA
                  <span className="bg-amber-400 text-slate-950 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
                    Gere Quiz Infinito
                  </span>
                </h3>
                <p className="text-xs text-indigo-100 font-medium">
                  A Vigia cria perguntas dinâmicas e exclusivas para você testar seus conhecimentos!
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all shrink-0"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Topic Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                1. Escolha o tema do seu próximo desafio:
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TOPIC_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTopic(t.id);
                      handleGenerateQuiz(t.id);
                    }}
                    className={`p-2.5 rounded-2xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                      selectedTopic === t.id
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-950 ring-2 ring-indigo-300 font-extrabold shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-center pt-1">
              <button
                onClick={() => handleGenerateQuiz()}
                disabled={loading}
                className={`py-3 px-6 rounded-2xl font-black text-sm text-white shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
                  loading
                    ? 'bg-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30'
                }`}
              >
                {loading ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-spin" />
                    <span>A Vigia está criando a pergunta com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Gerar Nova Pergunta Surpresa</span>
                  </>
                )}
              </button>
            </div>

            {/* Quiz Display */}
            {quizData && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-4 sm:p-5 text-white shadow-xl space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[10px] uppercase font-black tracking-wider text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Pergunta IA Gerada
                  </span>
                  <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3 fill-slate-950" /> +{quizData.rewardStars || 15} Estrelas
                  </span>
                </div>

                <p className="font-extrabold text-sm sm:text-base text-slate-100 leading-snug">
                  {quizData.question}
                </p>

                {/* Options */}
                <div className="space-y-2">
                  {quizData.options.map((opt, idx) => {
                    let btnStyle = 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700';
                    if (submitted) {
                      if (idx === quizData.correctIndex) {
                        btnStyle = 'bg-emerald-600 border-emerald-400 text-white font-black shadow-lg';
                      } else if (idx === selectedOption) {
                        btnStyle = 'bg-rose-600 border-rose-400 text-white opacity-80';
                      } else {
                        btnStyle = 'bg-slate-800/40 border-slate-800 text-slate-500 opacity-50';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectOption(idx)}
                        disabled={submitted}
                        className={`w-full text-left p-3.5 rounded-2xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-between ${btnStyle}`}
                      >
                        <span>{opt}</span>
                        {submitted && idx === quizData.correctIndex && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                        )}
                        {submitted && idx === selectedOption && idx !== quizData.correctIndex && (
                          <XCircle className="w-5 h-5 text-rose-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {submitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3.5 rounded-2xl border text-xs font-semibold ${
                      isCorrect
                        ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                        : 'bg-amber-950/90 border-amber-500 text-amber-200'
                    }`}
                  >
                    <p className="font-extrabold text-sm mb-1">
                      {isCorrect ? '🎉 Resposta Correta!' : '💡 Explicação da Vigia:'}
                    </p>
                    <p>{quizData.explanation}</p>
                  </motion.div>
                )}

                {/* Next Question CTA */}
                {submitted && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => handleGenerateQuiz()}
                      className="py-2.5 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs flex items-center gap-2 shadow-md transition-all active:scale-95"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Gerar Outro Desafio</span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
