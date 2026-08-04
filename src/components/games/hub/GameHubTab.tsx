import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Star, Trophy, ArrowRight, ShieldCheck, Gamepad2, ChevronLeft, Volume2, VolumeX, Music, Map as MapIcon, Flag } from 'lucide-react';
import { Badge } from '../../../types';
import EscapeGame from '../escape/EscapeGame';
import { LearningTrailMap } from '../../learning/LearningTrailMap';

interface GameHubTabProps {
  onAddStars: (amount: number) => void;
  onUnlockBadge: (badgeId: string) => void;
  onSpeak: (text: string) => void;
  onOpenDailyMission: () => void;
  badges: Badge[];
  stars: number;
}

export default function GameHubTab({
  onAddStars,
  onUnlockBadge,
  onSpeak,
  onOpenDailyMission,
  badges,
  stars
}: GameHubTabProps) {
  const [activeGame, setActiveGame] = useState<'hub' | 'escape' | 'trail'>('hub');

  const unlockedBadges = badges.filter(b => b.unlocked).length;
  const totalBadges = badges.length;
  const level = Math.floor(stars / 100) + 1;
  const xpInLevel = stars % 100;

  if (activeGame === 'escape') {
    return (
      <div className="w-full min-h-[600px] h-[calc(100dvh-150px)] bg-slate-900 text-slate-100 flex flex-col relative overflow-hidden shadow-inner border-y border-slate-800">
        <div className="absolute top-4 left-4 z-50">
          <button 
            onClick={() => setActiveGame('hub')}
            className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-2 pr-4 rounded-full text-sm font-bold hover:bg-slate-700 transition-colors"
          >
            <div className="bg-slate-700 p-1 rounded-full"><ChevronLeft className="w-4 h-4" /></div>
            Sair do Jogo
          </button>
        </div>
        <EscapeGame 
          onAddStars={onAddStars} 
          onUnlockBadge={onUnlockBadge} 
          onSpeak={onSpeak} 
          onExit={() => setActiveGame('hub')}
        />
      </div>
    );
  }

  if (activeGame === 'trail') {
    return (
      <div className="pb-12">
        <div className="p-4 flex items-center gap-4 bg-slate-100 dark:bg-slate-900 sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800">
          <button 
            onClick={() => setActiveGame('hub')}
            className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar para o Hub
          </button>
        </div>
        <LearningTrailMap
          onAddStars={onAddStars}
          onUnlockBadge={onUnlockBadge}
          onSpeak={onSpeak}
          onOpenDailyMission={onOpenDailyMission}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20 bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
      {/* Player Header Card */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 border-b border-indigo-500/20 px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
          
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/20 border-2 border-indigo-400 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <Gamepad2 className="w-10 h-10 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Nível {level}
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase tracking-wider">Iniciante</span>
              </h2>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm bg-slate-900/50 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  <Star className="w-4 h-4 fill-amber-400" />
                  {stars} XP
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm bg-slate-900/50 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <Trophy className="w-4 h-4" />
                  {unlockedBadges}/{totalBadges} Conquistas
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-4 w-full sm:w-64">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">
                  <span>Progresso</span>
                  <span>{xpInLevel} / 100 XP</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(xpInLevel / 100) * 100}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={onOpenDailyMission}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl font-bold transition-all text-sm shadow-md hover:shadow-xl active:scale-95"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Missão Diária
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        
        {/* Featured Game: ESCAPE! */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Flag className="w-5 h-5 text-rose-500" />
              Em Destaque
            </h3>
          </div>
          
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 shadow-2xl group">
            {/* Background Image / Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950/50 z-0" />
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500 via-transparent to-transparent z-0" />
            
            {/* Content */}
            <div className="relative z-10 p-8 sm:p-10 flex flex-col sm:flex-row items-center sm:items-stretch gap-8">
              <div className="flex-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-black uppercase tracking-widest mb-4">
                  Novo Jogo
                </div>
                <h1 className="text-5xl sm:text-6xl font-black text-white italic tracking-tighter mb-2 drop-shadow-md">
                  ESCAPE!
                </h1>
                <p className="text-xl sm:text-2xl text-slate-300 font-medium mb-6">
                  Você consegue chegar a um lugar seguro?
                </p>
                
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mb-8">
                  <div className="bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-700/50">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Progresso</p>
                    <p className="text-sm font-black text-emerald-400">
                      {badges.find(b => b.id === 'escape_mundo_1')?.unlocked ? '100% Concluído' : '0% Concluído'}
                    </p>
                  </div>
                  <div className="bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-700/50">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Fases Abertas</p>
                    <p className="text-sm font-black text-white">Mundo 1 - Enchente</p>
                  </div>
                </div>

                <button 
                  onClick={() => setActiveGame('escape')}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-lg transition-all hover:bg-slate-200 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  <Play className="w-5 h-5 fill-slate-900" />
                  JOGAR AGORA
                </button>
              </div>
              
              {/* Decorative side element */}
              <div className="hidden sm:flex shrink-0 w-48 relative justify-center items-center">
                <div className="absolute inset-0 bg-rose-500/20 blur-3xl rounded-full" />
                <div className="relative w-32 h-32 bg-slate-800 rounded-2xl border-4 border-slate-700 rotate-12 flex items-center justify-center shadow-xl">
                  <MapIcon className="w-16 h-16 text-rose-400 -rotate-12" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Other Games Grid */}
        <section>
          <div className="flex items-center justify-between mb-4 mt-12">
            <h3 className="text-lg font-black text-white uppercase tracking-wider">
              Treinamentos
            </h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Trail */}
            <button 
              onClick={() => setActiveGame('trail')}
              className="flex items-center justify-between p-5 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 rounded-2xl transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 group-hover:scale-110 transition-transform">
                  <MapIcon className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Trilha do Conhecimento</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Missões e quizzes interativos</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
            </button>

            {/* Locked Game Example */}
            <button 
              disabled
              className="flex items-center justify-between p-5 bg-slate-900/50 border border-slate-800/50 rounded-2xl opacity-60 cursor-not-allowed text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                  <Gamepad2 className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-300 text-lg">Resgate Rápido</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Em breve...</p>
                </div>
              </div>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
