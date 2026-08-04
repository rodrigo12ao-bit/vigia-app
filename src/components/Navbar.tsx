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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
        {/* Logo & Brand */}
        <div
          onClick={() => setActiveTab('chat')}
          className="flex items-center gap-2.5 cursor-pointer group select-none"
        >
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-red-500 flex items-center justify-center text-white shadow-md shadow-orange-500/25 group-hover:scale-105 transition-transform">
            <Shield className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                Vigia
              </span>
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                Defesa Civil
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 hidden sm:block">
              Tutora Virtual de Proteção e Segurança
            </p>
          </div>
        </div>

        {/* Header Right Actions: Daily Mission, AI Tools, Stars, Badges, Audio Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* AI Scenario Simulator Button */}
          {onOpenScenarioAnalyzer && (
            <button
              onClick={onOpenScenarioAnalyzer}
              className="flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-3 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs"
              title="Simulador e Diagnóstico Inteligente IA"
            >
              <Compass className="w-4 h-4 text-white" />
              <span className="hidden md:inline">Simulador IA</span>
            </button>
          )}

          {/* AI Dynamic Quiz Button */}
          {onOpenDynamicQuiz && (
            <button
              onClick={onOpenDynamicQuiz}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs"
              title="Gerador de Desafios IA"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="hidden md:inline">Desafios IA</span>
            </button>
          )}

          {/* Daily Mission Button */}
          {onOpenDailyMission && (
            <button
              onClick={onOpenDailyMission}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-3 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs"
              title="Missão Diária (Ganhe Estrelas)"
            >
              <Target className="w-4 h-4 text-white animate-pulse" />
              <span className="hidden lg:inline">Missão Diária</span>
            </button>
          )}

          {/* Star Score Badge */}
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-full shadow-xs">
            <Star className="w-4 h-4 text-amber-500 fill-amber-400 animate-pulse" />
            <span className="text-xs sm:text-sm font-black">{starsScore}</span>
            <span className="text-[10px] font-bold text-amber-700 hidden sm:inline uppercase">pts</span>
          </div>

          {/* Badges Button */}
          <button
            onClick={onOpenBadges}
            className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-900 px-3 py-1.5 rounded-full font-extrabold text-xs sm:text-sm transition-all active:scale-95 shadow-xs"
            title="Ver Minhas Conquistas"
          >
            <Award className="w-4 h-4 text-orange-600" />
            <span>
              {unlockedBadgesCount}/{totalBadgesCount}
            </span>
            <span className="hidden sm:inline text-xs text-orange-700">Emblemas</span>
          </button>

          {/* User Profile / Account Button */}
          {currentUser ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 px-3 py-1.5 rounded-full font-extrabold text-xs transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Meu Perfil"
            >
              <User className="w-4 h-4 text-indigo-600" />
              <span className="hidden xl:inline max-w-[100px] truncate">{nickname || 'Perfil'}</span>
            </button>
          ) : isGuest ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 px-3 py-1.5 rounded-full font-extrabold text-xs transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Perfil (Modo Visitante)"
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span className="hidden xl:inline">{nickname || 'Visitante'}</span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-3 py-1.5 rounded-full font-black text-xs transition-all active:scale-95 shadow-xs cursor-pointer"
              title="Entrar ou Criar Conta"
            >
              <UserCheck className="w-4 h-4 text-white" />
              <span className="hidden sm:inline">Entrar</span>
            </button>
          )}

          {/* Audio Sound Mute Toggle (Desativado no Modo Voz onde o botão inferior do dock comanda) */}
          <button
            onClick={() => {
              if (chatMode === 'live') return;
              setIsAudioMuted(!isAudioMuted);
            }}
            disabled={chatMode === 'live'}
            className={`p-2 rounded-full border transition-all shadow-xs ${
              chatMode === 'live'
                ? 'bg-slate-100/50 border-slate-200 text-slate-300 opacity-40 cursor-not-allowed'
                : isAudioMuted
                ? 'bg-slate-100 border-slate-200 text-slate-400 active:scale-95 cursor-pointer hover:bg-slate-200'
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
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="max-w-5xl mx-auto px-3 sm:px-6 flex items-center justify-between sm:justify-start gap-1.5 pb-2.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 ${
            activeTab === 'chat'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>Conversa & Voz</span>
        </button>

        <button
          onClick={() => setActiveTab('games')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 ${
            activeTab === 'games'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Jogos</span>
        </button>

        <button
          onClick={() => setActiveTab('topics')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 ${
            activeTab === 'topics'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-600/25'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Aprender</span>
        </button>

        <button
          onClick={() => setActiveTab('phones')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 ${
            activeTab === 'phones'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-rose-600/25'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <PhoneCall className="w-4 h-4 animate-pulse" />
          <span>Emergência</span>
        </button>

        <button
          onClick={() => setActiveTab('sala_segura')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all whitespace-nowrap active:scale-95 ${
            activeTab === 'sala_segura'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/25'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <Lock className="w-4 h-4 text-amber-400" />
          <span>Sala Segura</span>
        </button>
      </nav>

    </header>
  );
};
