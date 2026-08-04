import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Lock, EyeOff, UserCheck } from 'lucide-react';

interface LegalModalsProps {
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModals: React.FC<LegalModalsProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
              <h3 className="font-extrabold text-lg">
                {type === 'privacy' ? 'Política de Privacidade Infantil' : 'Termos de Uso do Vigia'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm leading-relaxed">
            {type === 'privacy' ? (
              <>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="font-semibold text-indigo-950">
                    O Vigia foi projetado para crianças de 8 a 12 anos em conformidade com as diretrizes de segurança e proteção de dados infantis.
                  </p>
                </div>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-emerald-600" /> 1. O que NÃO coletamos
                </h4>
                <p>
                  Não solicitamos nome completo da criança, endereço residencial, telefone, escola, localização GPS exata ou fotografias pessoais.
                </p>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" /> 2. Responsabilidade do Adulto
                </h4>
                <p>
                  A criação de conta deve ser autorizada por um pai, mãe, responsável legal ou educador. Solicitamos apenas um e-mail do responsável para acesso seguro e um apelido para a criança.
                </p>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600" /> 3. Uso do Progresso
                </h4>
                <p>
                  Os dados salvos (estrelas, medalhas e conquistas) servem exclusivamente para personalizar o aprendizado do usuário no aplicativo. Não vendemos dados nem exibimos anúncios publicitários.
                </p>
              </>
            ) : (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="font-semibold text-amber-950">
                    Ao utilizar o aplicativo Vigia, você concorda com nossas orientações de aprendizagem e segurança comunitária.
                  </p>
                </div>

                <h4 className="font-black text-slate-900 text-sm">1. Finalidade Educativa</h4>
                <p>
                  O aplicativo Vigia é um projeto educacional de prevenção e conscientização sobre Defesa Civil e situações de risco. As instruções não substituem o atendimento oficial de órgãos de emergência (199 / 193 / 190).
                </p>

                <h4 className="font-black text-slate-900 text-sm">2. Uso por Crianças</h4>
                <p>
                  O aplicativo deve ser utilizado sob a supervisão indireta de pais, responsáveis ou educadores em ambientes escolares ou familiares.
                </p>

                <h4 className="font-black text-slate-900 text-sm">3. Conta e Acesso</h4>
                <p>
                  O usuário é responsável por manter a confidencialidade do e-mail de acesso. A opção "Continuar como visitante" permite a utilização gratuita com armazenamento local no próprio dispositivo.
                </p>
              </>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              onClick={onClose}
              className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
