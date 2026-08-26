import React from 'react';
import {
  MessageCircle,
  Gamepad2,
  BookOpen,
  PhoneCall,
  Volume2,
  VolumeX,
  Award,
  Shield,
  Star,
  Target,
  Compass,
  Sparkles,
  UserCheck,
  User,
  Lock,
} from 'lucide-react';
import { User as FirebaseUser } from '../lib/firebase';

interface NavbarProps {
  activeTab: 'chat' | 'games' | 'topics' | 'phones' | 'sala_segura';
  setActiveTab: (tab: 'chat' | 'games' | 'topics' | 'phones' | 'sala_segura') => void;
  starsScore: number;
  unlockedBadgesCount: number;
  totalBadgesCount: number;
  onOpenBadges: () => void;
  onOpenDailyMission?: () => void;
  onOpenScenarioAnalyzer?: () => void;
  onOpenDynamicQuiz?: () => void;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  currentUser: FirebaseUser | null;
  nickname: string;
  isGuest: boolean;
  isAudioMuted: boolean;
  setIsAudioMuted: (muted: boolean) => void;
  chatMode?: 'text' | 'live';
}


export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  starsScore,
  unlockedBadgesCount,
  totalBadgesCount,
  onOpenBadges,
  onOpenDailyMission,
  onOpenScenarioAnalyzer,
  onOpenDynamicQuiz,
  onOpenProfile,
  onOpenAuth,
  currentUser,
  nickname,
  isGuest,
  isAudioMuted,
  setIsAudioMuted,
  chatMode = 'text',
}) => {
  return (
    <header className="sticky top-0 z-50 vigia-glass border-b border-slate-200/80 shadow-xs transition-all pt-safe">
      {/* Top Header Row (Logo + Right Actions) */}
      <div className="max-w-5xl mx-auto px-2.5 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {/* Logo & Brand */}
        <div
          onClick={() => setActiveTab('chat')}
          className="flex items-center gap-2 cursor-pointer group select-none shrink-0"
        >
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-red-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition-all">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-lg sm:text-2xl font-black tracking-tight text-slate-900">
                Vigia
              </span>
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                Defesa Civil
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-500 hidden sm:block">
              Tutora Virtual de Proteção e Segurança
            </p>
          </div>
        </div>

        {/* Header Right Actions (Single Non-Wrapping Scrollable Row on Mobile) */}
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap overflow-x-auto no-scrollbar">
          {/* AI Scenario Simulator Button */}
          {onOpenScenarioAnalyzer && (
            <button
              onClick={onOpenScenarioAnalyzer}
              className="flex items-center gap-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-2.5 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs shrink-0"
              title="Simulador e Diagnóstico Inteligente IA"
            >
              <Compass className="w-4 h-4 text-white shrink-0" />
              <span className="hidden md:inline">Simulador IA</span>
            </button>
          )}

          {/* AI Dynamic Quiz Button */}
          {onOpenDynamicQuiz && (
            <button
              onClick={onOpenDynamicQuiz}
              className="flex items-center gap-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-2.5 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs shrink-0"
              title="Gerador de Desafios IA"
            >
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="hidden md:inline">Desafios IA</span>
            </button>
          )}

          {/* Daily Mission Button */}
          {onOpenDailyMission && (
            <button
              onClick={onOpenDailyMission}
              className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-2.5 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs shrink-0"
              title="Missão Diária (Ganhe Estrelas)"
            >
              <Target className="w-4 h-4 text-white animate-pulse shrink-0" />
              <span className="hidden lg:inline">Missão Diária</span>
            </button>
          )}

          {/* Star Score Badge */}
          <div 
            className="flex items-center gap-1 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 text-amber-950 px-2.5 py-1.5 rounded-full shadow-xs cursor-default shrink-0"
            title="Pontuação de Estrelas Conquistadas"
          >
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 animate-pulse shrink-0" />
            <span className="text-xs font-black">{starsScore}</span>
            <span className="text-[10px] font-extrabold text-amber-700 hidden sm:inline uppercase">pts</span>
          </div>

          {/* Badges Button */}
          <button
            onClick={onOpenBadges}
            className="flex items-center gap-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-950 px-2.5 py-1.5 rounded-full font-extrabold text-xs transition-all active:scale-95 shadow-xs shrink-0"
            title="Ver Minhas Conquistas"
          >
            <Award className="w-3.5 h-3.5 text-orange-600 shrink-0" />
            <span>
              {unlockedBadgesCount}/{totalBadgesCount}
            </span>
            <span className="hidden sm:inline text-xs text-orange-800">Emblemas</span>
          </button>

          {/* User Profile / Account Button */}
          {currentUser ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-950 px-2.5 py-1.5 rounded-full font-extrabold text-xs transition-all active:scale-95 shadow-xs cursor-pointer shrink-0"
              title="Meu Perfil"
            >
              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="hidden xl:inline max-w-[100px] truncate">{nickname || 'Perfil'}</span>
            </button>
          ) : isGuest ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 px-2.5 py-1.5 rounded-full font-extrabold text-xs transition-all active:scale-95 shadow-xs cursor-pointer shrink-0"
              title="Perfil (Modo Visitante)"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="hidden xl:inline">{nickname || 'Visitante'}</span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 btn-vigia-primary px-3 py-1.5 text-xs transition-all active:scale-95 shadow-xs cursor-pointer shrink-0"
              title="Entrar ou Criar Conta"
            >
              <UserCheck className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="hidden sm:inline">Entrar</span>
            </button>
          )}

          {/* Audio Sound Mute Toggle */}
          <button
            onClick={() => {
              if (chatMode === 'live') return;
              setIsAudioMuted(!isAudioMuted);
            }}
            disabled={chatMode === 'live'}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-all shadow-xs shrink-0 ${
              chatMode === 'live'
                ? 'bg-slate-100/50 border-slate-200 text-slate-300 opacity-40 cursor-not-allowed'
                : isAudioMuted
                ? 'bg-slate-100 border-slate-200 text-slate-500 active:scale-95 cursor-pointer hover:bg-slate-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-600 active:scale-95 cursor-pointer hover:bg-emerald-100'
            }`}
            title={
              chatMode === 'live'
                ? 'No Modo Voz, o som é controlado no botão inferior do dock'
                : isAudioMuted
                ? 'Ativar Voz e Som'
                : 'Silenciar Voz e Som'
            }
          >
            {isAudioMuted || chatMode === 'live' ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Premium Segmented Navigation Tabs Bar */}
      <div className="max-w-5xl mx-auto px-2.5 sm:px-6 pb-2.5 pt-1">
        <nav className="bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/60 grid grid-cols-5 gap-1 sm:flex sm:items-center sm:gap-1.5 shadow-inner">
          <button
            onClick={() => setActiveTab('chat')}
            title="Conversa & Voz"
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer touch-target-min ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 ring-1 ring-orange-400/40'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-2xs border border-slate-200/50'
            }`}
          >
            <MessageCircle className="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-amber-300" />
            <span className="hidden sm:inline">Conversa & Voz</span>
          </button>

          <button
            onClick={() => setActiveTab('games')}
            title="Jogos"
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer touch-target-min ${
              activeTab === 'games'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25 ring-1 ring-purple-400/40'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-2xs border border-slate-200/50'
            }`}
          >
            <Gamepad2 className="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-purple-400" />
            <span className="hidden sm:inline">Jogos</span>
          </button>

          <button
            onClick={() => setActiveTab('topics')}
            title="Aprender"
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer touch-target-min ${
              activeTab === 'topics'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-400/40'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-2xs border border-slate-200/50'
            }`}
          >
            <BookOpen className="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-blue-400" />
            <span className="hidden sm:inline">Aprender</span>
          </button>

          <button
            onClick={() => setActiveTab('phones')}
            title="Emergência"
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer touch-target-min ${
              activeTab === 'phones'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-rose-600/25 ring-1 ring-rose-400/40'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-2xs border border-slate-200/50'
            }`}
          >
            <PhoneCall className="w-5 h-5 sm:w-4 sm:h-4 animate-pulse shrink-0 text-rose-400" />
            <span className="hidden sm:inline">Emergência</span>
          </button>

          <button
            onClick={() => setActiveTab('sala_segura')}
            title="Sala Segura"
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 cursor-pointer touch-target-min ${
              activeTab === 'sala_segura'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-400/40'
                : 'bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 shadow-2xs border border-slate-200/50'
            }`}
          >
            <Lock className="w-5 h-5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Sala Segura</span>
          </button>
        </nav>
      </div>

    </header>
  );
};

