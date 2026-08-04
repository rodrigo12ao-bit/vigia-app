import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneCall, CheckCircle2, AlertTriangle, Shield, Award, Sparkles, Phone, ArrowRight } from 'lucide-react';
import { LevelData } from '../../types';
import { gameAudio } from '../../utils/gameAudio';

interface EmergencyCentralGameProps {
  level: LevelData;
  onComplete: (stars: number, score: number) => void;
  onSpeak?: (text: string) => void;
}

export const EmergencyCentralGame: React.FC<EmergencyCentralGameProps> = ({
  level,
  onComplete,
  onSpeak,
}) => {
  const questions = level.content?.questions || [
    {
      scenario: 'Dona Maria notou que a água do rio começou a subir e invadir a rua do bairro.',
      correctNumber: '199',
      correctName: '199 - Defesa Civil',
      explanation: 'A Defesa Civil (199) previne e monitora riscos de enchentes, alagamentos e deslizamentos.',
    },
    {
      scenario: 'Uma árvore caiu sobre a fiação elétrica e começou a pegar fogo na rua.',
      correctNumber: '193',
      correctName: '193 - Corpo de Bombeiros',
      explanation: 'O 193 é dos Bombeiros, especializados em combate a incêndios e resgates imediatos.',
    },
    {
      scenario: 'Barulho de estalos fortes no barranco atrás das casas durante a tempestade.',
      correctNumber: '199',
      correctName: '199 - Defesa Civil',
      explanation: 'Estalos no solo indicam risco de deslizamento! Ligue 199 para vistoria e abrigo seguro.',
    },
    {
      scenario: 'Uma pessoa idosa passou mal devido ao susto da tempestade e precisa de atendimento médico.',
      correctNumber: '192',
      correctName: '192 - SAMU (Ambulância)',
      explanation: 'O 192 (SAMU) presta socorro médico imediato a pessoas feridas ou doentes.',
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const currentQ = questions[currentIndex];

  const phoneOptions = [
    { number: '199', label: '199 - Defesa Civil', desc: 'Enchentes, Chuvas e Riscos no Solo', color: 'bg-orange-500 hover:bg-orange-600 text-white' },
    { number: '193', label: '193 - Bombeiros', desc: 'Incêndios, Resgate e Choques', color: 'bg-red-500 hover:bg-red-600 text-white' },
    { number: '192', label: '192 - SAMU', desc: 'Emergências Médicas e Saúde', color: 'bg-blue-500 hover:bg-blue-600 text-white' },
    { number: '190', label: '190 - Polícia Militar', desc: 'Segurança Pública e Trânsito', color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  ];

  const handleSelect = (number: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(number);

    const correct = number === currentQ.correctNumber;
    setIsCorrect(correct);

    if (correct) {
      gameAudio.playCorrect();
      setScore((prev) => prev + 25);
      if (onSpeak) onSpeak('Excelente chamada! Você acionou a equipe de emergência correta!');
    } else {
      gameAudio.playWrong();
      if (onSpeak) onSpeak('Atenção! Vamos analisar qual número correto deve ser chamado para esse tipo de emergência.');
    }
  };

  const handleNext = () => {
    gameAudio.playClick();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    } else {
      setIsFinished(true);
      gameAudio.playVictory();
    }
  };

  const handleFinish = () => {
    const calculatedStars = score >= 75 ? 3 : score >= 50 ? 2 : 1;
    onComplete(calculatedStars, score);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl p-4 sm:p-6 shadow-2xl max-w-3xl mx-auto my-2">
      {/* HUD Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-2xl text-orange-400">
            ☎️
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/20">
              Central de Atendimento
            </span>
            <h3 className="text-xl font-black text-white">{level.title}</h3>
          </div>
        </div>

        <div className="bg-slate-800 px-3.5 py-1.5 rounded-2xl border border-slate-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-black text-amber-300">{score} Pontos</span>
        </div>
      </div>

      {!isFinished ? (
        <div className="space-y-6">
          {/* Scenario Card */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-5 sm:p-6 rounded-2xl border border-indigo-900/60 shadow-xl relative overflow-hidden">
            <div className="flex items-start gap-3">
              <span className="text-3xl p-2 bg-indigo-900/40 rounded-xl border border-indigo-800 shrink-0">
                🚨
              </span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block mb-1">
                  Ocorrência #{currentIndex + 1} de {questions.length}
                </span>
                <p className="text-base sm:text-lg font-bold text-slate-100 leading-relaxed">
                  "{currentQ.scenario}"
                </p>
              </div>
            </div>
          </div>

          {/* Prompt */}
          <p className="text-xs font-extrabold text-slate-300 uppercase tracking-wide text-center">
            Qual número a população deve chamar nesta situação?
          </p>

          {/* Dispatch Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {phoneOptions.map((opt) => {
              const isSelected = selectedAnswer === opt.number;
              const isThisCorrect = opt.number === currentQ.correctNumber;

              let btnStyle = opt.color;
              if (selectedAnswer !== null) {
                if (isThisCorrect) {
                  btnStyle = 'bg-emerald-600 border-2 border-emerald-400 text-white shadow-emerald-500/30';
                } else if (isSelected && !isThisCorrect) {
                  btnStyle = 'bg-rose-600 border-2 border-rose-400 text-white shadow-rose-500/30';
                } else {
                  btnStyle = 'bg-slate-800 opacity-40 text-slate-400';
                }
              }

              return (
                <button
                  key={opt.number}
                  disabled={selectedAnswer !== null}
                  onClick={() => handleSelect(opt.number)}
                  className={`p-4 rounded-2xl transition-all text-left flex items-center justify-between font-bold shadow-lg active:scale-95 cursor-pointer ${btnStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0 text-lg font-black">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block font-black text-sm">{opt.label}</span>
                      <span className="text-[11px] font-medium opacity-90 block">{opt.desc}</span>
                    </div>
                  </div>
                  {selectedAnswer !== null && isThisCorrect && (
                    <CheckCircle2 className="w-6 h-6 text-white shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Feedback Section */}
          <AnimatePresence>
            {selectedAnswer !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-2xl border ${
                  isCorrect
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl mt-0.5">
                    {isCorrect ? '✅' : '💡'}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black text-sm mb-1">
                      {isCorrect ? 'Resposta Exata!' : `Número correto: ${currentQ.correctName}`}
                    </h4>
                    <p className="text-xs leading-relaxed font-medium">
                      {currentQ.explanation}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleNext}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{currentIndex < questions.length - 1 ? 'Próxima Ocorrência' : 'Concluir Missão'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
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
            🏆
          </motion.div>

          <div>
            <span className="bg-amber-500/20 text-amber-300 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider border border-amber-500/40">
              Missão de Atendimento Concluída!
            </span>
            <h3 className="text-2xl font-black text-white mt-2">
              Você é um Oficial de Atendimento de Elite!
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto mt-1 font-medium">
              Saber para quem ligar em cada tipo de emergência economiza tempo precioso e ajuda a salvar muitas vidas!
            </p>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl max-w-sm mx-auto border border-slate-700 flex items-center justify-around">
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block">Pontuação</span>
              <span className="text-xl font-black text-amber-300">{score} pts</span>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block">Estrelas</span>
              <span className="text-xl font-black text-amber-300">
                {score >= 75 ? '⭐⭐⭐' : score >= 50 ? '⭐⭐' : '⭐'}
              </span>
            </div>
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
