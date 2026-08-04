import React, { useState, useEffect } from 'react';
import { Target, Star, Flame, CheckCircle, Clock, Award, Shield, Sparkles, X, ArrowRight, RotateCcw } from 'lucide-react';
import { getTodayMission, getTimeUntilNextMission, DailyMission } from '../data/dailyMissionsData';

interface DailyMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStars: (points: number) => void;
  onUnlockBadge?: (badgeId: string) => void;
  starsScore: number;
}

export const DailyMissionModal: React.FC<DailyMissionModalProps> = ({
  isOpen,
  onClose,
  onAddStars,
  onUnlockBadge,
}) => {
  const [mission, setMission] = useState<DailyMission>(getTodayMission());
  const [todayDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  
  const [completedToday, setCompletedToday] = useState<boolean>(() => {
    const savedDate = localStorage.getItem('dc_daily_mission_date');
    return savedDate === new Date().toISOString().slice(0, 10);
  });

  const [streak, setStreak] = useState<number>(() => {
    const savedStreak = Number(localStorage.getItem('dc_daily_mission_streak'));
    return Number.isFinite(savedStreak) ? savedStreak : 0;
  });

  const [gameState, setGameState] = useState<'intro' | 'playing' | 'result'>('intro');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [countdown, setCountdown] = useState(getTimeUntilNextMission());

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getTimeUntilNextMission());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync state if date changed
  useEffect(() => {
    const currentToday = new Date().toISOString().slice(0, 10);
    const savedDate = localStorage.getItem('dc_daily_mission_date');
    if (savedDate === currentToday) {
      setCompletedToday(true);
    } else {
      setCompletedToday(false);
      setMission(getTodayMission());
      setGameState('intro');
      setSelectedOption(null);
      setIsCorrect(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartChallenge = () => {
    setGameState('playing');
    setSelectedOption(null);
    setIsCorrect(null);
  };

  const handleSelectOption = (index: number) => {
    if (completedToday) return;
    setSelectedOption(index);
    const correct = index === mission.question.correctIndex;
    setIsCorrect(correct);

    if (correct) {
      setGameState('result');
      setCompletedToday(true);
      
      // Calculate new streak
      const lastDate = localStorage.getItem('dc_daily_mission_date');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      let newStreak = streak;
      if (lastDate === yesterdayStr) {
        newStreak += 1;
      } else if (lastDate !== todayDateStr) {
        newStreak = 1;
      }
      
      setStreak(newStreak);
      localStorage.setItem('dc_daily_mission_date', todayDateStr);
      localStorage.setItem('dc_daily_mission_streak', newStreak.toString());

      // Reward stars
      onAddStars(mission.starReward);

      // Unlock special badge if streak >= 3
      if (newStreak >= 3 && onUnlockBadge) {
        onUnlockBadge('daily_streak_3');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white p-4 sm:p-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner border border-white/20">
              🎯
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Desafio Diário 24h
                </span>
                <div className="flex items-center gap-1 bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[10px] font-black shadow-xs">
                  <Flame className="w-3 h-3 text-red-600 fill-red-500" />
                  <span>{streak}d Seguidos</span>
                </div>
              </div>
              <h2 className="text-xl font-black text-white mt-1">Missão do Dia</h2>
            </div>
          </div>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {completedToday ? (
            /* ALREADY COMPLETED STATE */
            <div className="text-center py-4 space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-4xl shadow-md ring-8 ring-emerald-50">
                <CheckCircle className="w-12 h-12 stroke-[2.5]" />
              </div>

              <div>
                <span className="text-xs font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Missão Concluída Hoje!
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2">
                  Você mandou muito bem! 🎉
                </h3>
                <p className="text-xs text-slate-600 font-semibold max-w-sm mx-auto mt-1">
                  Você já completou a missão de hoje e ganhou <span className="font-extrabold text-amber-600">+{mission.starReward} estrelas</span>! Volte amanhã para um novo desafio.
                </p>
              </div>

              {/* Reward Badge Card */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between max-w-md mx-auto shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-xl shadow-xs">
                    ⭐
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-extrabold text-amber-900 block">Recompensa Coletada</span>
                    <span className="text-xs font-bold text-amber-700">+{mission.starReward} Estrelas adicionadas</span>
                  </div>
                </div>
                <Sparkles className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>

              {/* Practical Safety Tip */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-orange-500" />
                  <span>Dica de Segurança de Hoje</span>
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {mission.practicalTip}
                </p>
              </div>

              {/* Next Mission Countdown */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-extrabold">Nova Missão em:</span>
                </div>
                <div className="font-mono font-black text-sm text-amber-300">
                  {String(countdown.hours).padStart(2, '0')}h {String(countdown.minutes).padStart(2, '0')}m {String(countdown.seconds).padStart(2, '0')}s
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black py-3 rounded-2xl shadow-md hover:brightness-105 active:scale-95 transition-all text-sm"
              >
                Voltar para o Aplicativo
              </button>
            </div>
          ) : gameState === 'intro' ? (
            /* INTRO STATE */
            <div className="space-y-4">
              {/* Mission Card Banner */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-4xl p-2 bg-white rounded-2xl shadow-xs border border-orange-100">{mission.icon}</span>
                  <div>
                    <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {mission.badgeTag}
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-1">{mission.title}</h3>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1">
                      {mission.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reward Box */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                  <span className="text-xs font-black text-amber-900">Recompensa ao Concluir:</span>
                </div>
                <span className="text-sm font-black text-amber-800 bg-amber-200/60 px-3 py-1 rounded-full">
                  +{mission.starReward} Estrelas ⭐
                </span>
              </div>

              {/* Practical Tip Preview */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5">
                <div className="flex items-center gap-2 text-xs font-black text-blue-900 mb-1">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span>Dica de Ouro do Vigia:</span>
                </div>
                <p className="text-xs text-blue-950 font-medium leading-relaxed">
                  "{mission.practicalTip}"
                </p>
              </div>

              {/* Action Button */}
              <button
                onClick={handleStartChallenge}
                className="w-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-orange-500/25 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
              >
                <span>Responder Desafio do Dia</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* PLAYING / QUESTION STATE */
            <div className="space-y-4">
              <div className="bg-slate-900 text-white rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-1">
                  Pergunta de Prevenção do Dia
                </span>
                <p className="text-sm font-bold leading-snug">
                  {mission.question.prompt}
                </p>
              </div>

              {/* Options */}
              <div className="space-y-2">
                {mission.question.options.map((optionText, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrectOption = idx === mission.question.correctIndex;

                  let btnStyle = 'bg-white hover:bg-orange-50/80 text-slate-800 border-slate-200';
                  if (isSelected) {
                    if (isCorrect) {
                      btnStyle = 'bg-emerald-500 text-white border-emerald-600 shadow-md';
                    } else {
                      btnStyle = 'bg-rose-500 text-white border-rose-600 shadow-md';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(idx)}
                      disabled={isCorrect === true}
                      className={`w-full p-3.5 rounded-2xl border text-left font-bold text-xs sm:text-sm transition-all flex items-start gap-3 active:scale-98 shadow-xs ${btnStyle}`}
                    >
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-black flex items-center justify-center shrink-0 border border-slate-200">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="mt-0.5 leading-relaxed">{optionText}</span>
                    </button>
                  );
                })}
              </div>

              {/* Feedback Alert if Attempted */}
              {isCorrect === false && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center justify-between text-xs text-rose-900 font-bold">
                  <span>Ops! Essa opção não é a mais segura. Tente outra alternativa!</span>
                  <RotateCcw className="w-4 h-4 text-rose-600 shrink-0" />
                </div>
              )}

              {/* Correct Feedback & Praise */}
              {isCorrect === true && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2 animate-bounce-short">
                  <div className="inline-flex p-2 bg-emerald-500 text-white rounded-full">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-black text-emerald-900">
                    Resposta Correta! +{mission.starReward} Estrelas ⭐
                  </h4>
                  <p className="text-xs text-emerald-800 font-medium">
                    {mission.question.explanation}
                  </p>
                  <button
                    onClick={() => setCompletedToday(true)}
                    className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs transition-colors"
                  >
                    Resgatar Minhas Estrelas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
