import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PhoneCall,
  ShieldAlert,
  Flame,
  Ambulance,
  Shield,
  Volume2,
  AlertTriangle,
  CheckCircle2,
  PhoneOff,
  UserCheck,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { EMERGENCY_PHONES } from '../data/topics';
import { EmergencyPhone } from '../types';

interface EmergencyNumbersCardProps {
  onSpeak: (text: string) => void;
}

export const EmergencyNumbersCard: React.FC<EmergencyNumbersCardProps> = ({ onSpeak }) => {
  const [activeSimulation, setActiveSimulation] = useState<EmergencyPhone | null>(null);
  const [step, setStep] = useState<number>(1);

  const renderPhoneIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flame':
        return <Flame className="w-7 h-7 text-red-500" />;
      case 'Ambulance':
        return <Ambulance className="w-7 h-7 text-blue-500" />;
      case 'Shield':
        return <Shield className="w-7 h-7 text-slate-700" />;
      default:
        return <ShieldAlert className="w-7 h-7 text-orange-500" />;
    }
  };

  const startSimulation = (phone: EmergencyPhone) => {
    setActiveSimulation(phone);
    setStep(1);
    const speech = `Simulação educativa ativada para a Defesa Civil no número ${phone.number}. Lembre-se: em uma ligação de verdade, fale com calma e tenha um adulto junto!`;
    onSpeak(speech);
  };

  const closeSimulation = () => {
    setActiveSimulation(null);
    setStep(1);
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6">
      {/* Title */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-red-100 text-red-900 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-2">
          <PhoneCall className="w-4 h-4 text-red-600 animate-pulse" />
          Telefones de Emergência do Brasil
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
          Guarde esses Números no Coração! ☎️
        </h2>
        <p className="text-slate-600 font-medium text-sm sm:text-base mt-1 max-w-xl mx-auto">
          São chamadas <span className="text-emerald-700 font-extrabold">100% gratuitas</span> que funcionam de qualquer telefone, fixo ou celular, mesmo sem créditos!
        </p>
      </div>

      {/* Safety Warning */}
      <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-3xl mb-6 flex items-start gap-3 shadow-md">
        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-amber-950 font-bold">
          <span className="uppercase font-black text-amber-800 block text-xs tracking-wider">
            NUNCA PASSE TROTE!
          </span>
          Passar trote engana os socorristas e impede que pessoas em perigo real recebam ajuda rápida. Use esses números apenas em emergências reais e com ajuda de um adulto!
        </div>
      </div>

      {/* Emergency Phones Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {EMERGENCY_PHONES.map((phone) => (
          <div
            key={phone.number}
            className="bg-white border-2 border-slate-200 hover:border-orange-300 rounded-3xl p-5 shadow-lg transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-3 rounded-2xl bg-slate-100">
                  {renderPhoneIcon(phone.icon)}
                </div>
                <span
                  className={`text-2xl font-black px-4 py-1.5 rounded-2xl shadow-md tracking-wider ${phone.color}`}
                >
                  {phone.number}
                </span>
              </div>

              <h3 className="text-xl font-black text-slate-800">{phone.name}</h3>
              <p className="text-xs font-bold text-slate-500 mb-3">{phone.description}</p>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 mb-4">
                <span className="font-extrabold text-orange-600 block mb-0.5">
                  Quando ligar?
                </span>
                {phone.whenToCall}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  onSpeak(
                    `Número ${phone.number}: ${phone.name}. Ligue para ${phone.whenToCall}`
                  )
                }
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="Ouvir instrução"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => startSimulation(phone)}
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold text-xs py-2.5 px-3 rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Simular Chamada Educativa</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Call Simulator Modal */}
      <AnimatePresence>
        {activeSimulation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border-4 border-orange-400 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-center"
            >
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-red-500 to-orange-600 text-white rounded-full flex items-center justify-center shadow-lg mb-3 animate-pulse">
                <PhoneCall className="w-8 h-8" />
              </div>

              <span className="text-xs font-black uppercase text-orange-600 tracking-widest bg-orange-100 px-3 py-1 rounded-full">
                Simulação Educativa de Aprendizado
              </span>

              <h3 className="text-2xl font-black text-slate-800 mt-2">
                Ligando para {activeSimulation.name} ({activeSimulation.number})
              </h3>

              <div className="my-6 space-y-4">
                {step === 1 && (
                  <div className="bg-orange-50 p-4 rounded-2xl border border-orange-200 text-left text-xs sm:text-sm font-semibold text-slate-800">
                    <p className="font-extrabold text-orange-700 mb-1 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" /> Passo 1: Mantenha a Calma e Diga seu Nome
                    </p>
                    Respire fundo. Diga ao atendente seu nome completo e que está com um adulto por perto.
                  </div>
                )}

                {step === 2 && (
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 text-left text-xs sm:text-sm font-semibold text-slate-800">
                    <p className="font-extrabold text-blue-700 mb-1 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" /> Passo 2: Diga seu Endereço Completo
                    </p>
                    Diga o nome da sua rua, número da casa, bairro e um ponto de referência famoso (ex: perto da padaria ou da escola).
                  </div>
                )}

                {step === 3 && (
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 text-left text-xs sm:text-sm font-semibold text-slate-800">
                    <p className="font-extrabold text-emerald-700 mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Passo 3: Explique o que está acontecendo
                    </p>
                    Explique claramente: "Está entrando água da chuva na casa" ou "Há fumaça no bairro". Não desligue até o atendente mandar!
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={closeSimulation}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1"
                >
                  <PhoneOff className="w-4 h-4 text-red-500" />
                  Encerrar Simulação
                </button>

                {step < 3 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs shadow-md"
                  >
                    Próximo Passo
                  </button>
                ) : (
                  <button
                    onClick={closeSimulation}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs shadow-md flex items-center gap-1"
                  >
                    <Sparkles className="w-4 h-4" />
                    Aprendi Tudo!
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
