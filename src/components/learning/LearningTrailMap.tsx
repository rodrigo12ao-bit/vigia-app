import type {ActivityClaim} from '../../lib/adventureModel';
import {playActivityFeedback,feedbackPreferences} from '../../lib/activityFeedback';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Star,
  Award,
  Lock,
  CheckCircle2,
  Play,
  Sparkles,
  ChevronRight,
  RotateCcw,
  BookOpen,
  Trophy,
  Volume2,
  VolumeX,
  Music,
  User,
  Gamepad2,
  Zap,
  Compass,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { MODULES_DATA, ACCESSORIES } from '../../data/learningJourneyData';
import { ModuleData, LevelData, UserJourneyState } from '../../types';
import { PLAYER_AVATARS, PlayerAvatarOption } from '../../data/playerAvatarsData';
import { gameAudio } from '../../utils/gameAudio';
import { auth, db, doc, getDoc, setDoc } from '../../lib/firebase';

import { HazardFinderGame } from './HazardFinderGame';
import { PathChoiceGame } from './PathChoiceGame';
import { SequenceOrderGame } from './SequenceOrderGame';
import { BackpackBuilderGame } from './BackpackBuilderGame';
import { InteractiveStoryGame } from './InteractiveStoryGame';
import { TrueFalseGame } from './TrueFalseGame';
import { QuizChallengeGame } from './QuizChallengeGame';
import { EmergencyCentralGame } from './EmergencyCentralGame';
import { HomeSafetyGame } from './HomeSafetyGame';
import { CertificateModal } from './CertificateModal';
import { AvatarClosetModal } from './AvatarClosetModal';
import { PlayerAvatarModal } from './PlayerAvatarModal';
import { DailyMissionCard } from '../DailyMissionCard';

interface LearningTrailMapProps {
  userId?: string;
  globalXp?:number;
  onAddStars: (points: number) => void;
  onReward?:(claim:ActivityClaim,points:number)=>Promise<any>;
  onUnlockBadge: (badgeId: string) => void;
  onSpeak?: (text: string) => void;
  onOpenDailyMission?: () => void;
}

const DEFAULT_JOURNEY_STATE: UserJourneyState = {
  xp: 120,
  userLevel: 2,
  completedModules: [],
  unlockedAccessories: ['helmet_gold'],
  equippedAccessory: 'helmet_gold',
  playerAvatarId: 'hero_shield',
  playerNickname: 'Guardiao Mirim',
  levelProgress: {},
};

export const LearningTrailMap: React.FC<LearningTrailMapProps> = ({
  userId,
  globalXp,
  onAddStars,
  onReward,
  onUnlockBadge,
  onSpeak,
  onOpenDailyMission,
}) => {
  const [journeyState,setJourneyState]=useState<UserJourneyState>(DEFAULT_JOURNEY_STATE);
  const [hydrated,setHydrated]=useState(false);
  const [syncError,setSyncError]=useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('m2'); // Start on Enchentes
  const [activeLevel, setActiveLevel] = useState<LevelData | null>(null);

  const [isCertificateOpen, setIsCertificateOpen] = useState(false);
  const [isClosetOpen, setIsClosetOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isBgmOn, setIsBgmOn] = useState(false);
  const levelRun=useRef({version:0,id:null as string|null});
  const renderedRun=levelRun.current.version;
  const selectLevel=(level:LevelData|null)=>{levelRun.current={version:levelRun.current.version+1,id:level?.id||null};setActiveLevel(level);};
  useEffect(()=>()=>{levelRun.current={version:levelRun.current.version+1,id:null};gameAudio.toggleBgm(false);},[]);

  useEffect(()=>{
    let cancelled=false;setHydrated(false);setSyncError('');setJourneyState(DEFAULT_JOURNEY_STATE);selectLevel(null);
    (async()=>{
      try{
        const saved=userId?(await getDoc(doc(db,'users',userId))).data()?.gameJourney:JSON.parse(localStorage.getItem('vigia_journey:guest') || 'null');
        if(cancelled)return;setJourneyState(saved || DEFAULT_JOURNEY_STATE);setHydrated(true);
      }catch{if(!cancelled)setSyncError('Progresso indisponível. A gravação está pausada para preservar seus dados.');}
    })();return ()=>{cancelled=true;};
  },[userId]);
  useEffect(()=>{
    if(!hydrated)return;
    const timer=setTimeout(()=>{
      try{localStorage.setItem('vigia_journey:'+(userId||'guest'),JSON.stringify(journeyState));}catch{setSyncError('Não foi possível salvar seu progresso local.');}
      if(userId)setDoc(doc(db,'users',userId),{gameJourney:journeyState},{merge:true}).catch(()=>setSyncError('Não foi possível sincronizar o progresso.'));
    },500);return ()=>clearTimeout(timer);
  },[journeyState,hydrated,userId]);

  const currentModule = MODULES_DATA.find((m) => m.id === selectedModuleId) || MODULES_DATA[1];

  const playerAvatarObj =
    PLAYER_AVATARS.find((av) => av.id === journeyState.playerAvatarId) || PLAYER_AVATARS[0];

  const handleLevelComplete = (levelId: string, stars: number, score: number) => {
    if(levelRun.current.version!==renderedRun||levelRun.current.id!==levelId)return;
    if((auth.currentUser?.uid||undefined)!==userId)return;
    selectLevel(null);
    const xpGained = score + stars * 10;

    setJourneyState((prev) => {
      const prevProgress = prev.levelProgress[levelId] || { stars: 0, score: 0, completed: false };
      const newStars = Math.max(prevProgress.stars, stars);
      const newScore = Math.max(prevProgress.score, score);

      const nextLevelProgress = {
        ...prev.levelProgress,
        [levelId]: {
          levelId,
          stars: newStars,
          score: newScore,
          completed: true,
          completedAt: new Date().toLocaleDateString(),
        },
      };

      const newXp = prev.xp + (prevProgress.completed ? 10 : xpGained);
      const newLevel = Math.floor(newXp / 150) + 1;

      return {
        ...prev,
        xp: newXp,
        userLevel: newLevel,
        levelProgress: nextLevelProgress,
      };
    });

    if(onReward)void onReward({kind:'trail',id:levelId,stars,score},stars*10).catch(()=>setSyncError('Recompensa ainda não sincronizada.'));else onAddStars(stars*10);
    playActivityFeedback('correct',userId);

    // Unlock badge if level rewards one
    if (activeLevel?.badgeRewardId) {
      onUnlockBadge(activeLevel.badgeRewardId);
      if(!onReward&&feedbackPreferences(userId).sounds)gameAudio.playBadgeUnlock();
    } else {
      if(!onReward&&feedbackPreferences(userId).sounds)gameAudio.playVictory();
    }

    if (onSpeak) {
      onSpeak('Parabéns, Guardião! Você concluiu a fase e registrou mais uma descoberta!');
    }

  };

  const isLevelUnlocked = (mod: ModuleData, levelIndex: number): boolean => {
    if (levelIndex === 0) return true; // First level in module always unlocked
    const prevLevel = mod.levels[levelIndex - 1];
    return !!journeyState.levelProgress[prevLevel.id]?.completed;
  };

  // Overall journey stats calculation
  let totalLevelsCount = 0;
  let completedLevelsCount = 0;

  MODULES_DATA.forEach((mod) => {
    mod.levels.forEach((lvl) => {
      totalLevelsCount++;
      if (journeyState.levelProgress[lvl.id]?.completed) {
        completedLevelsCount++;
      }
    });
  });

  const overallProgressPercentage = Math.round((completedLevelsCount / (totalLevelsCount || 1)) * 100);

  // Find next uncompleted level for "Continuar Missão"
  const getNextUncompletedLevel = (): { module: ModuleData; level: LevelData } | null => {
    for (const mod of MODULES_DATA) {
      for (let i = 0; i < mod.levels.length; i++) {
        const lvl = mod.levels[i];
        if (isLevelUnlocked(mod, i) && !journeyState.levelProgress[lvl.id]?.completed) {
          return { module: mod, level: lvl };
        }
      }
    }
    return { module: MODULES_DATA[0], level: MODULES_DATA[0].levels[0] };
  };

  const handleContinueMission = () => {
    gameAudio.playClick();
    const next = getNextUncompletedLevel();
    if (next) {
      setSelectedModuleId(next.module.id);
      selectLevel(next.level);
    }
  };

  const toggleSoundMute = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    gameAudio.setMuted(nextMuted);
  };

  const toggleBackgroundMusic = () => {
    const nextBgm = !isBgmOn;
    setIsBgmOn(nextBgm);
    gameAudio.toggleBgm(nextBgm);
  };

  const handleResetProgress = () => {
    if (window.confirm('Tem certeza que deseja reiniciar seu progresso de jogos?')) {
      gameAudio.playClick();
      const resetState: UserJourneyState = {
        ...DEFAULT_JOURNEY_STATE,
        playerAvatarId: journeyState.playerAvatarId,
        playerNickname: journeyState.playerNickname,
      };
      setJourneyState(resetState);
      localStorage.setItem('vigia_journey:'+(userId||'guest'), JSON.stringify(resetState));
    }
  };

  if(!hydrated)return <div role="status" className="p-4">{syncError || 'Carregando seu progresso…'}</div>;
  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* VIDEOGAME HUD HEADER */}
      <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-2xl mb-6 relative overflow-hidden border border-indigo-500/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-5 relative z-10">
          {/* Player Avatar Card */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={() => {
                gameAudio.playClick();
                setIsAvatarModalOpen(true);
              }}
              className="relative group cursor-pointer"
              title="Clique para mudar seu Avatar de Videogame"
            >
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr ${playerAvatarObj.bgColor} flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-orange-500/20 ring-4 ring-amber-400/30 group-hover:scale-105 transition-transform shrink-0`}>
                {playerAvatarObj.icon}
              </div>
              <span className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 p-1 rounded-full text-xs font-black shadow-md">
                ✏️
              </span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                  Nível {globalXp!==undefined?Math.floor(globalXp/100)+1:journeyState.userLevel}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${playerAvatarObj.badgeBg}`}>
                  {playerAvatarObj.title}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2">
                <span>{journeyState.playerNickname || 'Guardião Mirim'}</span>
                <span className="text-amber-400 text-sm font-semibold">🛡️</span>
              </h2>
              <p className="text-xs font-medium text-slate-300 mt-0.5">
                Central de Missões e Desafios
              </p>
            </div>
          </div>

          {/* XP Bar & Stats HUD */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-indigo-500/30 min-w-[130px]">
              <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">Pontuação Total</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-base sm:text-lg font-black text-amber-300">{globalXp??journeyState.xp} XP</span>
              </div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-indigo-500/30 min-w-[150px]">
              <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">Progresso Geral</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-slate-800 h-2.5 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-400 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${overallProgressPercentage}%` }}
                  />
                </div>
                <span className="text-xs font-black text-amber-300">{overallProgressPercentage}%</span>
              </div>
            </div>

            {/* Sound Controls HUD */}
            <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-2xl border border-indigo-500/30">
              <button
                onClick={toggleSoundMute}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isAudioMuted ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                }`}
                title={isAudioMuted ? 'Som desativado' : 'Som ativado'}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={toggleBackgroundMusic}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isBgmOn ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={isBgmOn ? 'Música BGM Tocando' : 'Ligar Música BGM'}
              >
                <Music className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Bar inside HUD */}
        <div className="mt-5 pt-4 border-t border-indigo-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleContinueMission}
              className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 text-slate-950 font-black text-xs px-5 py-2.5 rounded-2xl shadow-lg shadow-orange-500/20 hover:from-amber-300 hover:to-orange-400 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Continuar Missão</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsClosetOpen(true)}
              className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-extrabold text-xs px-4 py-2.5 rounded-2xl border border-slate-700 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Troféus & Armário</span>
            </button>
          </div>

          <button
            onClick={handleResetProgress}
            className="text-[11px] font-bold text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 ml-auto cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reiniciar fases</span>
          </button>
        </div>
      </div>

      {/* ACTIVE LEVEL GAMEPLAY CONTAINER */}
      {activeLevel ? (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => {
                if (window.confirm('Deseja sair do jogo em andamento? Seu progresso nesta fase não será perdido.')) {
                  gameAudio.playClick();
                  selectLevel(null);
                }
              }}
              className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs px-4 py-2 rounded-2xl border border-slate-700 shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>← Sair para o Hub de Jogos</span>
            </button>

            <span className="text-xs font-black text-amber-300 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full">
              Em andamento: {activeLevel.title}
            </span>
          </div>

          {activeLevel.type === 'hazard_finder' && (
            <HazardFinderGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'path_choice' && (
            <PathChoiceGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'sequence_order' && (
            <SequenceOrderGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'backpack_builder' && (
            <BackpackBuilderGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'interactive_story' && (
            <InteractiveStoryGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'true_false' && (
            <TrueFalseGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'quiz_challenge' && (
            <QuizChallengeGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'emergency_central' && (
            <EmergencyCentralGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}

          {activeLevel.type === 'home_safety' && (
            <HomeSafetyGame
              level={activeLevel}
              onComplete={(s, sc) => handleLevelComplete(activeLevel.id, s, sc)}
              onSpeak={onSpeak}
            />
          )}
        </div>
      ) : (
        <>
          {/* Daily Mission Card */}
          {onOpenDailyMission && (
            <DailyMissionCard onOpenModal={onOpenDailyMission} starsScore={journeyState.xp} />
          )}

          {/* Module Selector Grid Carousel */}
          <div className="mb-6">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3 flex items-center justify-between">
              <span>Módulos de Missão</span>
              <span className="text-slate-400 font-bold">{MODULES_DATA.length} Temas Disponíveis</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-3">
              {MODULES_DATA.map((mod) => {
                const isSelected = mod.id === selectedModuleId;
                const completedInMod = mod.levels.filter(
                  (l) => journeyState.levelProgress[l.id]?.completed
                ).length;

                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      gameAudio.playClick();
                      setSelectedModuleId(mod.id);
                    }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all font-bold text-xs sm:text-sm text-left active:scale-95 shadow-lg cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-slate-950 border-amber-400 shadow-orange-500/30 ring-2 ring-amber-300'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-800'
                    }`}
                  >
                    <span className="text-2xl p-2 rounded-xl bg-black/20 shrink-0">{mod.icon}</span>
                    <div className="overflow-hidden">
                      <span className="block font-black leading-tight truncate">{mod.title}</span>
                      <span className={`text-[10px] block mt-0.5 font-bold ${isSelected ? 'text-slate-950/80' : 'text-slate-400'}`}>
                        {completedInMod} / {mod.levels.length} Fases
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CURRENT MODULE MAP DISPLAY */}
          <div className="bg-slate-900/90 rounded-3xl p-5 sm:p-8 border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
            {/* Module Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800 mb-8">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-3xl flex items-center justify-center border border-amber-500/30 shrink-0 shadow-md">
                  {currentModule.icon}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                    Módulo Ativo
                  </span>
                  <h3 className="text-2xl font-black text-white mt-1">
                    {currentModule.title}
                  </h3>
                  <p className="text-xs font-medium text-slate-400 mt-0.5">
                    {currentModule.subtitle}
                  </p>
                </div>
              </div>

              {/* Certificate Action */}
              <button
                onClick={() => {
                  gameAudio.playClick();
                  setIsCertificateOpen(true);
                }}
                className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-extrabold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md flex items-center gap-1.5 self-start sm:self-auto active:scale-95 cursor-pointer"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Ver Certificado do Módulo</span>
              </button>
            </div>

            {/* SERPENTINE TRAIL STAGE MAP */}
            <div className="py-6 relative max-w-xl mx-auto flex flex-col items-center gap-10">
              {/* Connecting Line */}
              <div className="absolute top-10 bottom-10 w-3 bg-gradient-to-b from-orange-500 via-amber-500 to-slate-800 rounded-full z-0 opacity-60" />

              {currentModule.levels.map((lvl, index) => {
                const unlocked = isLevelUnlocked(currentModule, index);
                const prog = journeyState.levelProgress[lvl.id];
                const isCompleted = prog?.completed;
                const stars = prog?.stars || 0;

                const alignmentClass = index % 2 === 0 ? 'sm:mr-28' : 'sm:ml-28';

                return (
                  <motion.div
                    key={lvl.id}
                    whileHover={unlocked ? { scale: 1.06 } : {}}
                    className={`relative z-10 flex flex-col items-center ${alignmentClass}`}
                  >
                    {/* Stage Node Button */}
                    <button
                      disabled={!unlocked}
                      onClick={() => {
                        gameAudio.playClick();
                        selectLevel(lvl);
                      }}
                      className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border-4 flex flex-col items-center justify-center shadow-2xl transition-all relative cursor-pointer ${
                        isCompleted
                          ? 'bg-gradient-to-tr from-emerald-500 to-teal-600 border-white text-white shadow-emerald-500/40 ring-4 ring-emerald-400/30'
                          : unlocked
                          ? 'bg-gradient-to-tr from-amber-400 via-orange-500 to-amber-600 border-white text-slate-950 shadow-orange-500/50 ring-4 ring-amber-400/30 animate-pulse'
                          : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {/* Player avatar emblem inside unlocked stage node */}
                      {unlocked && !isCompleted && (
                        <div className="absolute -top-3 bg-slate-950 px-2 py-0.5 rounded-full border border-amber-400 text-[10px] font-black text-amber-300 flex items-center gap-1 shadow-md">
                          <span>{playerAvatarObj.icon}</span>
                          <span>{journeyState.playerNickname || 'Você'}</span>
                        </div>
                      )}

                      {isCompleted ? (
                        <CheckCircle2 className="w-8 h-8 text-white stroke-[2.5]" />
                      ) : unlocked ? (
                        <Play className="w-8 h-8 text-slate-950 fill-slate-950 ml-1" />
                      ) : (
                        <Lock className="w-7 h-7 text-slate-500" />
                      )}

                      <span className="text-[10px] font-black uppercase mt-1">
                        Fase {index + 1}
                      </span>

                      {/* Stars Badge under node */}
                      {isCompleted && (
                        <div className="absolute -bottom-3 bg-slate-900 px-2.5 py-0.5 rounded-full border border-emerald-400 shadow-lg flex items-center gap-0.5">
                          {[1, 2, 3].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </button>

                    {/* Level Title Label */}
                    <div className="mt-4 text-center max-w-[220px]">
                      <h4 className="font-black text-sm text-white leading-tight">
                        {lvl.title}
                      </h4>
                      <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                        {unlocked
                          ? isCompleted
                            ? 'Concluído! Clique para jogar novamente'
                            : 'Disponível! Clique para iniciar'
                          : 'Bloqueado (Conclua a fase anterior)'}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Legal & Emergency Safety Disclaimer */}
      <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 text-center text-xs text-amber-200 font-medium mb-6 flex items-center justify-center gap-2">
        <Shield className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Os jogos são educativos. Em uma emergência real, procure um adulto de confiança e ligue para a Defesa Civil (199) ou Bombeiros (193).
        </span>
      </div>

      {/* Certificate Modal */}
      <CertificateModal
        isOpen={isCertificateOpen}
        onClose={() => setIsCertificateOpen(false)}
        moduleData={currentModule}
      />

      {/* Avatar Closet Modal */}
      <AvatarClosetModal
        isOpen={isClosetOpen}
        onClose={() => setIsClosetOpen(false)}
        userXp={journeyState.xp}
        unlockedAccessories={journeyState.unlockedAccessories}
        equippedAccessory={journeyState.equippedAccessory}
        onEquipAccessory={(accId) =>
          setJourneyState((prev) => ({ ...prev, equippedAccessory: accId }))
        }
      />

      {/* Player Avatar Modal */}
      <PlayerAvatarModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        selectedAvatarId={journeyState.playerAvatarId || 'hero_shield'}
        playerNickname={journeyState.playerNickname || 'Guardião Mirim'}
        onSaveAvatar={(avId, nick) => {
          setJourneyState((prev) => ({
            ...prev,
            playerAvatarId: avId,
            playerNickname: nick,
          }));
        }}
      />
    </div>
  );
};
