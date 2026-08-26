import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Sparkles, ArrowRight, UserCheck, HeartHandshake } from 'lucide-react';
import { Avatar } from './Avatar';
import { AvatarGender } from '../types';

interface WelcomeScreenProps {
  onStart: () => void;
  onLoginClick: () => void;
  onContinueAsGuest: () => void;
  avatarGender: AvatarGender;
  onSelectGender: (gender: AvatarGender) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onLoginClick,
  onContinueAsGuest,
  avatarGender,
  onSelectGender,
}) => {
  const [step, setStep] = useState<'splash' | 'gender' | 'actions'>('splash');

  // Auto-transition from splash to gender selection after 3 seconds
  React.useEffect(() => {
    if (step === 'splash') {
      const timer = setTimeout(() => setStep('gender'), 3500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      {/* Background Animated Gradient Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-gradient-to-r from-purple-600 to-pink-500 rounded-full blur-3xl animate-pulse delay-500" />
        <div className="absolute bottom-1/3 left-1/3 w-64 h-64 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-3xl animate-pulse delay-1500" />
      </div>

      <AnimatePresence mode="wait">
        {step === 'splash' ? (
          <motion.div
            key="step-splash"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center space-y-6"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/30 blur-3xl rounded-full" />
              <Shield className="w-24 h-24 sm:w-32 sm:h-32 text-amber-400 relative z-10 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-4xl sm:text-6xl font-black text-white tracking-widest flex items-center gap-2"
            >
              VIGIA <Sparkles className="w-8 h-8 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 1 }}
              className="text-slate-300 font-medium text-lg tracking-wide uppercase"
            >
              Defesa Civil Educativa
            </motion.p>
          </motion.div>
        ) : step === 'gender' ? (
          <motion.div
            key="step-gender"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative z-10 max-w-2xl w-full bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-10 text-white shadow-2xl text-center flex flex-col items-center space-y-8"
          >
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                Conheça a sua Tutora 🛡️
              </h1>
              <p className="text-sm sm:text-base font-medium text-slate-300">
                Escolha com qual versão do holograma educacional você prefere interagir:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full">
              {/* Opção Feminina */}
              <button
                onClick={() => {
                  onSelectGender('female');
                  setStep('actions');
                }}
                className={`relative flex flex-col items-center justify-center gap-3 p-4 sm:p-6 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden group hover:scale-105 active:scale-95 ${
                  avatarGender === 'female' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-amber-400/50'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-full h-32 sm:h-44 relative flex items-center justify-center">
                  <Avatar size="md" state="idle" gender="female" showSubtitle={false} />
                </div>
                <div className="font-black text-base sm:text-lg text-amber-100 tracking-wide">
                  Vigia (Feminina)
                </div>
              </button>

              {/* Opção Masculina */}
              <button
                onClick={() => {
                  onSelectGender('male');
                  setStep('actions');
                }}
                className={`relative flex flex-col items-center justify-center gap-3 p-4 sm:p-6 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden group hover:scale-105 active:scale-95 ${
                  avatarGender === 'male' ? 'border-blue-400 bg-blue-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-blue-400/50'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-full h-32 sm:h-44 relative flex items-center justify-center">
                  <Avatar size="md" state="idle" gender="male" showSubtitle={false} />
                </div>
                <div className="font-black text-base sm:text-lg text-blue-100 tracking-wide">
                  Vigia (Masculino)
                </div>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step-actions"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative z-10 max-w-md w-full bg-slate-900/40 backdrop-blur-xl border border-white/20 rounded-3xl p-6 sm:p-8 text-white shadow-2xl text-center flex flex-col items-center space-y-6 my-auto"
          >
            {/* Botão Voltar */}
            <button 
              onClick={() => setStep('gender')}
              className="absolute top-4 left-4 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Alterar Avatar
            </button>

            {/* Brand Header & Logo Badge */}
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs uppercase px-4 py-1.5 rounded-full shadow-lg border border-orange-300/30 mt-4">
              <Shield className="w-4 h-4 fill-white" />
              <span>Defesa Civil Educativa</span>
            </div>

            {/* Animated Avatar Mascot */}
            <div className="relative py-2 flex items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-purple-500/20 to-blue-500/20 rounded-full blur-2xl transform scale-125" />
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10"
              >
                <Avatar size="lg" state="celebrating" gender={avatarGender} showSubtitle={false} />
              </motion.div>
            </div>

            {/* Title & Tagline */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                VIGIA
                <Sparkles className="w-6 h-6 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
              </h1>
              <p className="text-base sm:text-lg font-bold text-slate-200 leading-snug">
                Aprenda a se proteger de forma divertida.
              </p>
              <p className="text-xs text-slate-300 font-medium max-w-xs mx-auto">
                Sua tutora virtual interativa de prevenção e segurança comunitária.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-3 pt-2">
              <button
                onClick={onStart}
                className="w-full btn-vigia-primary py-4 px-6 rounded-2xl text-white text-base shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-102 active:scale-98 cursor-pointer touch-target-min"
              >
                <span>Começar</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={onLoginClick}
                  className="py-3 px-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer touch-target-min"
                >
                  <UserCheck className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>Já tenho conta</span>
                </button>

                <button
                  onClick={onContinueAsGuest}
                  className="py-3 px-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-102 active:scale-98 cursor-pointer touch-target-min"
                >
                  <HeartHandshake className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Modo Visitante</span>
                </button>
              </div>
            </div>

            {/* Child Safety Disclaimer Footer */}
            <div className="pt-2 border-t border-white/10 w-full text-[11px] text-slate-400 font-medium">
              🛡️ Ambiente seguro para crianças de 8 a 12 anos. Nenhuma informação confidencial é solicitada.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
