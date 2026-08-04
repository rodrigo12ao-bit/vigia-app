import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, RotateCcw, ArrowRight, ListOrdered, Sparkles } from 'lucide-react';
import { LevelData } from '../../types';

interface SequenceOrderGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const SequenceOrderGame: React.FC<SequenceOrderGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const content = level.content;
  const correctSequence = content.correctSequence as string[];

  // Shuffle items for the initial pool
  const [shuffledPool, setShuffledPool] = useState<string[]>(() => {
    return [...correctSequence].sort(() => Math.random() - 0.5);
  });

  const [selectedSequence, setSelectedSequence] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSelectItem = (item: string) => {
    if (selectedSequence.includes(item)) return;
    setSelectedSequence((prev) => [...prev, item]);
    setShuffledPool((prev) => prev.filter((i) => i !== item));
  };

  const handleRemoveItem = (item: string) => {
    setSelectedSequence((prev) => prev.filter((i) => i !== item));
    setShuffledPool((prev) => [...prev, item]);
  };

  const handleReset = () => {
    setSelectedSequence([]);
    setShuffledPool([...correctSequence].sort(() => Math.random() - 0.5));
    setFeedback(null);
    setIsCorrect(false);
  };

  const handleVerify = () => {
    const isMatches = selectedSequence.every((val, index) => val === correctSequence[index]);
    if (isMatches) {
      setIsCorrect(true);
      setFeedback('Sensacional! Você colocou todas as etapas na sequência exata de segurança!');
      if (onSpeak) {
        onSpeak('Parabéns! Você organizou perfeitamente as ações de segurança!');
      }
    } else {
      setFeedback('Quase lá! Lembre-se: em caso de chuva forte, avisar um adulto e buscar abrigo alto vem sempre primeiro. Tente ajustar a ordem!');
      if (onSpeak) {
        onSpeak('Quase lá! Vamos revisar a ordem para deixar tudo super seguro!');
      }
    }
  };

  const handleFinish = () => {
    onComplete(3, 60);
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-purple-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-purple-700 tracking-wider bg-purple-100 px-3 py-1 rounded-full">
            🔢 {content.title}
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <button
          onClick={handleReset}
          className="text-xs font-extrabold text-slate-600 hover:text-slate-800 bg-slate-100 p-2.5 rounded-2xl flex items-center gap-1 border border-slate-200"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reiniciar</span>
        </button>
      </div>

      <p className="text-sm font-bold text-slate-600 mb-4 bg-purple-50 p-3 rounded-2xl border border-purple-200">
        💡 {content.instruction}
      </p>

      {/* Selected Sequence Box */}
      <div className="bg-slate-50 border-2 border-dashed border-purple-300 p-4 rounded-3xl min-h-[220px] mb-6 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
          <ListOrdered className="w-4 h-4" />
          Sua Sequência (Clique para remover):
        </h4>

        {selectedSequence.length === 0 && (
          <p className="text-xs font-bold text-slate-400 text-center py-8">
            Clique nas frases abaixo para organizá-las na ordem 1º, 2º, 3º e 4º!
          </p>
        )}

        {selectedSequence.map((item, idx) => (
          <motion.div
            key={item}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={() => handleRemoveItem(item)}
            className="p-3.5 bg-purple-600 text-white font-bold text-sm sm:text-base rounded-2xl shadow-md cursor-pointer hover:bg-purple-700 transition-colors flex items-center gap-3"
          >
            <span className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center font-black text-xs shrink-0">
              {idx + 1}º
            </span>
            <span className="flex-1 leading-snug">{item}</span>
          </motion.div>
        ))}
      </div>

      {/* Available Items Pool */}
      {shuffledPool.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
            Opções Disponíveis (Clique para adicionar):
          </h4>
          <div className="space-y-2">
            {shuffledPool.map((item) => (
              <button
                key={item}
                onClick={() => handleSelectItem(item)}
                className="w-full text-left p-3.5 bg-white hover:bg-purple-50 border-2 border-slate-200 hover:border-purple-400 font-bold text-xs sm:text-sm text-slate-800 rounded-2xl shadow-sm transition-all"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feedback & Verify Actions */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl mb-6 text-xs sm:text-sm font-bold flex items-start gap-2.5 ${
            isCorrect
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-950'
              : 'bg-amber-50 border border-amber-300 text-amber-950'
          }`}
        >
          <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="text-right">
        {isCorrect ? (
          <button
            onClick={handleFinish}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>Concluir Fase</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleVerify}
            disabled={selectedSequence.length !== correctSequence.length}
            className="bg-purple-600 hover:bg-purple-700 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Verificar Sequência</span>
          </button>
        )}
      </div>
    </div>
  );
};
