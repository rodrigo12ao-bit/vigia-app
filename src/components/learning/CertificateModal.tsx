import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Award, Shield, CheckCircle2, Printer, Sparkles } from 'lucide-react';
import { ModuleData } from '../../types';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleData: ModuleData | null;
  childName?: string;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  moduleData,
  childName = 'Defensor Mirim',
}) => {
  const [name, setName] = useState(childName);

  if (!isOpen || !moduleData) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl border-8 border-amber-400 p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative text-center overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Certificate Design Frame */}
          <div className="border-2 border-dashed border-amber-500/50 p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-amber-50/80 via-orange-50/40 to-white relative">
            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Shield className="w-10 h-10 stroke-[2.5]" />
            </div>

            <span className="text-xs font-black uppercase tracking-widest text-orange-700 bg-orange-100 px-4 py-1 rounded-full inline-block mb-2">
              CERTIFICADO OFICIAL DA DEFESA CIVIL
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif tracking-tight">
              GUARDIÃO DA PREVENÇÃO
            </h2>

            <p className="text-xs sm:text-sm font-bold text-slate-600 mt-2">
              Certificamos com orgulho e honra que
            </p>

            {/* Child Name Input / Display */}
            <div className="my-4 max-w-sm mx-auto">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu Nome Aqui"
                className="w-full text-center text-xl sm:text-2xl font-black text-orange-800 border-b-4 border-orange-400 focus:border-orange-600 outline-none bg-transparent py-1 px-2"
              />
              <span className="text-[10px] font-bold text-slate-400 block mt-1">
                (Clique acima para alterar seu nome no certificado)
              </span>
            </div>

            <p className="text-xs sm:text-sm font-medium text-slate-700 max-w-md mx-auto leading-relaxed">
              Concluiu com excelência e sabedoria todas as fases do módulo{' '}
              <strong className="text-orange-900 font-black">"{moduleData.title}"</strong>,
              demonstrando conhecimento prático para salvar vidas e proteger a comunidade!
            </p>

            {/* Seal & Badge Stamp */}
            <div className="mt-6 flex items-center justify-around border-t border-amber-200/80 pt-6">
              <div className="text-center">
                <div className="text-3xl mb-1">{moduleData.icon}</div>
                <span className="text-[11px] font-extrabold text-orange-800 uppercase block">
                  {moduleData.badgeTitle}
                </span>
              </div>

              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 border-4 border-white shadow-xl flex flex-col items-center justify-center text-amber-950 font-black p-1 rotate-12">
                <Award className="w-7 h-7 text-amber-900" />
                <span className="text-[8px] tracking-tighter uppercase font-black text-center leading-none">
                  Defesa Civil Oficial
                </span>
              </div>

              <div className="text-center">
                <span className="text-lg font-black text-orange-950 font-serif block">
                  Vigia 🛡️
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Mascote de Segurança
                </span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handlePrint}
              className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs sm:text-sm px-5 py-2.5 rounded-2xl shadow-md transition-transform active:scale-95 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="bg-orange-500 hover:bg-orange-600 text-white font-black text-xs sm:text-sm px-6 py-2.5 rounded-2xl shadow-md transition-transform active:scale-95 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Continuar Aprendendo</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
