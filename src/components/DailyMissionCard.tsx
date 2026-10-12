import {auth} from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { Target, Star, Flame, CheckCircle, ArrowRight, Shield, Sparkles } from 'lucide-react';
import { getTodayMission, DailyMission } from '../data/dailyMissionsData';

interface DailyMissionCardProps {
  onOpenModal: () => void;
  starsScore: number;
}

export const DailyMissionCard: React.FC<DailyMissionCardProps> = ({ onOpenModal }) => {
  const [mission] = useState<DailyMission>(getTodayMission());
  const [completedToday, setCompletedToday] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);

  useEffect(() => {
    const savedDate = localStorage.getItem('vigia_daily_date:'+(auth.currentUser?.uid || 'guest'));
    const todayStr = new Date().toISOString().slice(0, 10);
    setCompletedToday(savedDate === todayStr);

    const savedStreak = Number(localStorage.getItem('vigia_daily_streak:'+(auth.currentUser?.uid || 'guest')));
    setStreak(Number.isFinite(savedStreak) ? savedStreak : 0);
  }, []);

  return (
    <div
      onClick={onOpenModal}
      className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-3xl p-4 sm:p-5 shadow-lg hover:shadow-xl transition-all cursor-pointer border border-amber-300/40 relative overflow-hidden group active:scale-98 mb-6"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shrink-0 shadow-inner border border-white/20 group-hover:rotate-6 transition-transform">
            {mission.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-white/20 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Desafio Diário
              </span>
              <div className="flex items-center gap-1 bg-slate-950/80 text-amber-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />
                <span>{streak}d Seguidos</span>
              </div>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mt-1 leading-tight">
              {mission.title}
            </h3>
            <p className="text-xs font-semibold text-amber-100/90 line-clamp-1 mt-0.5">
              {mission.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/20">
          <div className="text-left sm:text-right">
            <span className="text-[10px] font-extrabold uppercase text-amber-200 block">Recompensa</span>
            <span className="text-sm font-black text-white flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
              +{mission.starReward} pts
            </span>
          </div>

          <button className="bg-white text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-md group-hover:bg-amber-100 transition-colors flex items-center gap-1.5 shrink-0">
            {completedToday ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Concluído!</span>
              </>
            ) : (
              <>
                <span>Cumprir Missão</span>
                <ArrowRight className="w-4 h-4 text-slate-950" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
