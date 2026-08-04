import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, Plus, Trash2 } from 'lucide-react';
import { LevelData } from '../../types';

interface BackpackBuilderGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const BackpackBuilderGame: React.FC<BackpackBuilderGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const content = level.content;
  const allItems = content.items as any[];
  const maxItems = content.maxItems || 6;

  const [packedIds, setPackedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const handleToggleItem = (item: any) => {
    if (packedIds.includes(item.id)) {
      setPackedIds((prev) => prev.filter((id) => id !== item.id));
      setFeedback(null);
    } else {
      if (packedIds.length >= maxItems) {
        setFeedback('A mochila está cheia! Remova algum item desnecessário para colocar o que realmente importa.');
        return;
      }
      setPackedIds((prev) => [...prev, item.id]);

      if (item.isEssential) {
        setFeedback(`Muito bem! ${item.name} é um item indispensável! ${item.desc}`);
      } else {
        setFeedback(`Atenção: ${item.name} é pesado ou frágil para levar em uma emergência. Foque no essencial!`);
      }
    }
  };

  const handleVerify = () => {
    const packedItems = allItems.filter((i) => packedIds.includes(i.id));
    const essentialPackedCount = packedItems.filter((i) => i.isEssential).length;
    const nonEssentialPackedCount = packedItems.filter((i) => !i.isEssential).length;

    if (essentialPackedCount >= 4 && nonEssentialPackedCount === 0) {
      setIsFinished(true);
      setFeedback('Parabéns, Mestre da Mochila! Sua mochila de emergência está perfeita e levinha para salvar vidas!');
      if (onSpeak) {
        onSpeak('Perfeito! Você montou uma mochila de emergência completa e muito segura!');
      }
    } else if (nonEssentialPackedCount > 0) {
      setFeedback('Quase lá! Lembre-se de retirar os itens pesados ou frágeis (como videogames ou vidros). Fique só com o essencial!');
    } else {
      setFeedback('Você colocou ótimos itens! Tente colocar mais alguns essenciais (como água, lanterna ou apito).');
    }
  };

  const handleFinish = () => {
    onComplete(3, 70);
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border-2 border-emerald-200 shadow-xl max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-xs font-black uppercase text-emerald-700 tracking-wider bg-emerald-100 px-3 py-1 rounded-full">
            🎒 Mestre da Mochila
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
            {level.title}
          </h3>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 block">Capacidade</span>
          <span className="text-lg font-black text-emerald-600">
            {packedIds.length} / {maxItems} Itens
          </span>
        </div>
      </div>

      <p className="text-sm font-bold text-slate-600 mb-4 bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
        💡 {level.description} Escolha os itens certos para colocar na sua mochila!
      </p>

      {/* Visual Backpack Canvas */}
      <div className="bg-gradient-to-b from-emerald-100 via-teal-50 to-emerald-50 border-4 border-emerald-300 p-5 rounded-3xl min-h-[180px] mb-6 shadow-inner">
        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 mb-3 flex items-center gap-1.5">
          <span>🎒 Mochila de Emergência (Itens Colocados):</span>
        </h4>

        {packedIds.length === 0 ? (
          <div className="text-center py-6 text-emerald-700/60 font-bold text-xs">
            A mochila está vazia! Clique nos itens abaixo para guardá-los!
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {allItems
              .filter((i) => packedIds.includes(i.id))
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggleItem(item)}
                  className={`p-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-between shadow-sm cursor-pointer transition-transform hover:scale-95 ${
                    item.isEssential
                      ? 'bg-white border-emerald-400 text-emerald-950'
                      : 'bg-amber-50 border-amber-400 text-amber-950'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="font-extrabold">{item.name}</span>
                  </span>
                  <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Available Items Grid */}
      <div className="mb-6">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
          Itens Disponíveis no Quarto:
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {allItems.map((item) => {
            const isPacked = packedIds.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleToggleItem(item)}
                disabled={isFinished}
                className={`text-left p-3.5 rounded-2xl border-2 font-bold text-xs sm:text-sm flex items-center justify-between transition-all ${
                  isPacked
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-md'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <span className="block font-black">{item.name}</span>
                    <span
                      className={`text-[11px] font-medium block ${
                        isPacked ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {item.desc}
                    </span>
                  </div>
                </div>
                <div
                  className={`p-1.5 rounded-xl text-xs font-black shrink-0 ${
                    isPacked ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isPacked ? 'Na Mochila' : '+ Guardar'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-950 rounded-2xl mb-6 text-xs sm:text-sm font-bold flex items-start gap-2.5">
          <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Actions */}
      <div className="text-right">
        {isFinished ? (
          <button
            onClick={handleFinish}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 inline-flex items-center gap-2"
          >
            <span>Ganhar Medalha e Concluir</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleVerify}
            disabled={packedIds.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Verificar Mochila</span>
          </button>
        )}
      </div>
    </div>
  );
};
