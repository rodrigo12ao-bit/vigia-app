import { ErrorBoundary } from "../../ErrorBoundary";
import React, { useState, useEffect } from 'react';
 // wait, no, just use lucide
import { Pause, Play, RotateCcw, LogOut, Heart, Star, ShieldAlert, Volume2, VolumeX, ShieldCheck, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EscapeEngine } from './EscapeEngine';
import { level1Phases } from './level1';
import { escapeAudio } from './sound';
import { useEscapeStore } from './escapeStore';
import { GeminiLiveSession } from '../../../utils/geminiLive';
import { InventoryHUD } from './InventoryHUD';

interface EscapeGameProps {
  onAddStars: (amount: number) => void;
  onUnlockBadge: (badgeId: string) => void;
  onSpeak: (text: string) => void;
  onExit: () => void;
}

export default function EscapeGame({ onAddStars, onUnlockBadge, onSpeak, onExit }: EscapeGameProps) {
  const { health, score, inventory, isPaused, setIsPaused, phase, setPhase, message, resetPhase, setIsSpeaking, isFlashlightOn, flashlightBattery } = useEscapeStore();
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showDamageOverlay, setShowDamageOverlay] = useState(false);

  const liveSessionRef = React.useRef<GeminiLiveSession | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  // Send real-time context updates to Vigia
  React.useEffect(() => {
    if (liveSessionRef.current && isLiveActive) {
      const inventoryNames = inventory.length > 0 ? inventory.map(i => i.name).join(', ') : 'Vazio';
      const phaseObj = level1Phases[phase - 1]?.objective || 'Sobreviver.';
      
      const contextUpdate = `ATUALIZAÇÃO DE CONTEXTO DO JOGADOR:
- Fase atual: ${phase}
- Objetivo atual: ${phaseObj}
- XP Necessário para passar (Fase 1): 40 XP
- XP Atual do Jogador: ${score} XP
- Vida atual: ${health} HP (Máx 100)
- Inventário atual: ${inventoryNames}
- Lanterna: ${isFlashlightOn ? 'LIGADA' : 'DESLIGADA'} (${Math.round(flashlightBattery)}%)
(Responda ajudando o jogador com base nessas informações e ensine os controles caso ele pergunte o que fazer ou como fazer algo).`;
      
      const timer = setTimeout(() => {
        liveSessionRef.current?.sendContextUpdate(contextUpdate);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [health, inventory, phase, isFlashlightOn, flashlightBattery, isLiveActive, score]);

  useEffect(() => {
    useEscapeStore.setState({health:100,score:0,inventory:[],unlockedGates:[],activeSwitches:[],isPaused:false,phase:1,message:'',isSpeaking:false,isFlashlightOn:false,flashlightBattery:100,isPunching:false,heldItem:null,thrownItems:[]});
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleVoiceChat = () => {
    if (isLiveActive) {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setIsLiveActive(false);
      setIsSpeaking(false);
      setSubtitle('');
    } else {
      const session = new GeminiLiveSession({
        context: 'escape',
        onAvatarStateChange: (state) => {
          setIsSpeaking(state === 'speaking');
          if (state === 'listening') {
             setSubtitle('');
          }
        },
        onOutputTranscription: (text) => {
          setSubtitle((prev) => prev + text);
        },
        onError: (err) => {
          console.error(err);
          setSubtitle('Erro no canal de voz: ' + err);
          setTimeout(() => setSubtitle(''), 3000);
        },
        onClose: () => {
          setIsLiveActive(false);
          setIsSpeaking(false);
        }
      });
      session.start();
      liveSessionRef.current = session;
      setIsLiveActive(true);
      setSubtitle('Conectando canal de voz holográfico...');
      setTimeout(() => setSubtitle(''), 3000);
    }
  };

  // Sync store with internal state on reset
  useEffect(() => {
    resetPhase();
  }, [resetKey, resetPhase]);

  // Flash damage overlay when health drops
  const prevHealthRef = React.useRef(health);
  useEffect(() => {
    if (health < prevHealthRef.current) {
      setShowDamageOverlay(true);
      const timer = setTimeout(() => setShowDamageOverlay(false), 300);
      return () => clearTimeout(timer);
    }
    prevHealthRef.current = health;
  }, [health]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    escapeAudio.setMuted(nextMuted);
  };

  const handlePhaseComplete = () => {
    setIsPaused(true);
    setShowLevelComplete(true);
    onAddStars(score);
    onSpeak(`Fase ${phase} concluída com sucesso! Você ganhou ${score} pontos. Excelente trabalho de prevenção!`);
  };

  const handleGameOver = () => {
    setIsPaused(true);
    onSpeak('Cuidado! Você perdeu energia. Recomece e tente novamente.');
  };

  const handleNextPhase = () => {
    if (phase < level1Phases.length) {
      setPhase(phase + 1);
      setShowLevelComplete(false);
      setIsPaused(false);
      setResetKey((k) => k + 1); // This triggers resetPhase in the useEffect!
    } else {
      onUnlockBadge('escape_mundo_1');
      onSpeak('Parabéns! Você concluiu a evacuação e salvou a comunidade! O Selo de Guardião da Defesa Civil é seu!');
      onExit();
    }
  };

  return (
    <div className="w-full h-full flex-1 relative bg-slate-950 flex flex-col items-center justify-center font-sans">
      
      {/* TOP HUD BAR */}
      <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex justify-between items-start z-30 pointer-events-none">
          {/* Left Side: Stats and Objective */}
          <div className="flex flex-col gap-2 pointer-events-auto max-w-sm">
            <div className="flex flex-wrap gap-2 sm:gap-3">
          {/* Health Bar */}
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-xl">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Energia</span>
              <span className="text-white font-black text-sm sm:text-base leading-tight">
                {health} / 100
              </span>
            </div>
          </div>

          {/* Flashlight Battery */}
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-xl">
            <span className="text-xl">🔋</span>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Bateria</span>
              <span className="text-cyan-400 font-black text-sm sm:text-base leading-tight">
                {Math.round(flashlightBattery)}%
              </span>
            </div>
          </div>

          {/* Stars Score */}
          <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-xl">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Pontos XP</span>
              <span className="text-amber-300 font-black text-sm sm:text-base leading-tight">
                {score}
              </span>
            </div>
          </div>

          {/* Inventory HUD Ativo */}
          <InventoryHUD />
        </div>
        {/* Objective Box */}
        <div className="bg-slate-900/60 border border-slate-600/50 px-4 py-2 rounded-lg backdrop-blur-sm text-left mt-2">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Missão Atual</p>
          <p className="text-sm text-white font-medium leading-tight">
            {level1Phases[phase - 1]?.objective || 'Sobreviva e encontre a saída.'}
          </p>
        </div>
      </div>

        {/* Right Side: Level Info & Controls */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <div className="flex gap-2">
            <button
              onClick={toggleVoiceChat}
              className={`bg-slate-900/90 hover:bg-slate-800 backdrop-blur border rounded-2xl p-2.5 transition-all shadow-xl active:scale-95 ${isLiveActive ? 'border-cyan-500' : 'border-slate-700/80'}`}
              title={isLiveActive ? 'Desativar Microfone da Vigia' : 'Falar com Vigia'}
            >
              {isLiveActive ? <Mic className="w-5 h-5 text-cyan-400 animate-pulse" /> : <MicOff className="w-5 h-5 text-slate-400" />}
            </button>

            <button
              onClick={toggleMute}
              className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur border border-slate-700/80 rounded-2xl p-2.5 text-white transition-all shadow-xl active:scale-95"
              title={isMuted ? 'Ativar Som' : 'Desativar Som'}
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
            </button>

            <button
              onClick={() => setIsPaused(true)}
              className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur border border-slate-700/80 rounded-2xl p-2.5 text-white transition-all shadow-xl active:scale-95"
              title="Pausar Jogo"
            >
              <Pause className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-gradient-to-r from-indigo-950/90 to-slate-900/90 backdrop-blur border border-indigo-500/50 rounded-2xl px-4 py-2 max-w-xs text-right shadow-2xl">
            <p className="text-indigo-300 text-[10px] font-black uppercase tracking-wider mb-0.5">
              MUNDO 1 • FASE {phase} DE {level1Phases.length}
            </p>
            <p className="text-white text-xs sm:text-sm font-black leading-snug truncate">Fuga Segura</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-600 text-white font-bold py-2 px-6 rounded-full z-40">
          {message}
        </div>
      )}

      {/* Voice Subtitles Overlay */}
      {subtitle && (
        <div className="absolute bottom-24 w-full flex justify-center pointer-events-none z-40">
          <div className="max-w-2xl text-center bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
            <p className="text-cyan-100 font-bold text-lg md:text-xl drop-shadow-md">
              <span className="text-cyan-400 mr-2">Vigia:</span>
              {subtitle}
            </p>
          </div>
        </div>
      )}

      {/* CROSSHAIR */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xl pointer-events-none z-40 select-none">
        +
      </div>

      {/* Damage Overlay */}
      <div 
        className={`absolute inset-0 pointer-events-none z-40 transition-opacity duration-100 ease-out border-[12px] border-red-600/0 ${
          showDamageOverlay ? 'opacity-100 bg-red-600/30 border-red-600/80 shadow-[inset_0_0_100px_rgba(220,38,38,0.8)]' : 'opacity-0'
        }`}
      />

      {/* GAME ENGINE CONTAINER */}
      <ErrorBoundary>
        <div className="w-full h-full flex-1 overflow-hidden relative">
          <EscapeEngine
            key={resetKey}
            levelData={level1Phases[phase - 1]}
            onGameOver={handleGameOver}
            onVictory={handlePhaseComplete}
          />
        </div>
      </ErrorBoundary>

      {/* PAUSE OVERLAY */}
      <AnimatePresence>
        {isPaused && !showLevelComplete && health > 0 && (
          <motion.div
            key="pause-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              key="pause-modal"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border-2 border-indigo-500/40 p-6 sm:p-8 rounded-3xl w-full max-w-sm flex flex-col gap-4 shadow-2xl text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-wide">JOGO PAUSADO</h2>
              <p className="text-xs text-slate-400 font-medium">Recupere o fôlego antes de continuar a missão!</p>

              <button
                onClick={() => setIsPaused(false)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-indigo-600/30"
              >
                <Play className="w-5 h-5 fill-white" />
                CONTINUAR
              </button>

              <div className="h-px bg-slate-800 my-1" />

              <button
                onClick={() => {
                  setIsPaused(false);
                  setResetKey((k) => k + 1);
                }}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-5 h-5 text-amber-400" />
                Reiniciar Fase
              </button>

              <button
                onClick={onExit}
                className="w-full py-3 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors mt-1"
              >
                <LogOut className="w-5 h-5" />
                Sair do Jogo
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* GAME OVER OVERLAY */}
        {isPaused && !showLevelComplete && health <= 0 && (
          <motion.div
             className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
             <motion.div
               className="bg-slate-900 border-2 border-rose-500/40 p-6 sm:p-8 rounded-3xl w-full max-w-sm flex flex-col gap-4 shadow-2xl text-center"
             >
                <h2 className="text-3xl font-black text-rose-500 tracking-wide">FIM DE JOGO</h2>
                <button
                  onClick={() => {
                    setIsPaused(false);
                    setResetKey((k) => k + 1);
                  }}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  Tentar Novamente
                </button>
             </motion.div>
          </motion.div>
        )}

        {/* PHASE COMPLETE OVERLAY */}
        {showLevelComplete && (
          <motion.div
            key="complete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              key="complete-modal"
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border-2 border-emerald-500/60 p-6 sm:p-8 rounded-3xl w-full max-w-md flex flex-col items-center gap-5 shadow-[0_0_60px_rgba(16,185,129,0.3)] text-center"
            >
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border-4 border-emerald-400 shadow-lg shadow-emerald-500/40">
                <ShieldCheck className="w-10 h-10 text-emerald-300 animate-bounce" />
              </div>

              <div>
                <h2 className="text-3xl font-black text-white mb-1">FASE CONCLUÍDA!</h2>
                <p className="text-emerald-400 font-bold text-sm">Você tomou decisões inteligentes e seguras!</p>
              </div>

              <button
                onClick={handleNextPhase}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-lg transition-transform hover:scale-105 active:scale-95 shadow-xl shadow-emerald-600/30"
              >
                {phase < level1Phases.length ? 'PRÓXIMA FASE ➔' : 'CONCLUIR MUNDO 🏆'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
