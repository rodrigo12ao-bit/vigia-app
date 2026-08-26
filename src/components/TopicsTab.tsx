import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Waves,
  Mountain,
  Zap,
  Flame,
  Briefcase,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Lightbulb,
  MessageCircle,
  Volume2,
  AlertTriangle,
  HelpCircle,
  PhoneCall,
  Ambulance,
  Shield,
} from 'lucide-react';
import { TOPICS_DATA, EMERGENCY_PHONES } from '../data/topics';
import { TopicItem } from '../types';

interface TopicsTabProps {
  onAskDC: (question: string) => void;
  onSpeak: (text: string) => void;
}

export const TopicsTab: React.FC<TopicsTabProps> = ({ onAskDC, onSpeak }) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>('enchentes');
  const [activeQuizSelected, setActiveQuizSelected] = useState<number | null>(null);
  const [showQuizFeedback, setShowQuizFeedback] = useState(false);

  const topic = TOPICS_DATA.find((t) => t.id === selectedTopicId) || TOPICS_DATA[0];

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Waves':
        return <Waves className="w-6 h-6" />;
      case 'Mountain':
        return <Mountain className="w-6 h-6" />;
      case 'Zap':
        return <Zap className="w-6 h-6" />;
      case 'Flame':
        return <Flame className="w-6 h-6" />;
      case 'Briefcase':
        return <Briefcase className="w-6 h-6" />;
      case 'Ambulance':
        return <Ambulance className="w-6 h-6" />;
      case 'Shield':
        return <Shield className="w-6 h-6" />;
      default:
        return <ShieldAlert className="w-6 h-6" />;
    }
  };

  const handleSelectTopic = (id: string) => {
    setSelectedTopicId(id);
    setActiveQuizSelected(null);
    setShowQuizFeedback(false);
  };

  const handleTopicQuizOption = (idx: number) => {
    setActiveQuizSelected(idx);
    setShowQuizFeedback(true);
    const isCorrect = idx === topic.quizQuestion.correctIndex;
    if (isCorrect) {
      onSpeak('Acertou em cheio! ' + topic.quizQuestion.explanation);
    } else {
      onSpeak('Quase lá! Veja a resposta certa na explicação.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      {/* Title */}
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
          Guia de Segurança e Prevenção 📚🛡️
        </h2>
        <p className="text-slate-600 font-medium text-sm sm:text-base mt-1">
          Aprenda o passo a passo para ficar protegido em qualquer situação de risco!
        </p>
      </div>

      {/* Category Selection Grid/Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3.5 mb-6">
        {TOPICS_DATA.map((t) => {
          const isSelected = t.id === selectedTopicId;
          return (
            <button
              key={t.id}
              onClick={() => handleSelectTopic(t.id)}
              className={`p-3.5 rounded-2xl font-black text-xs sm:text-sm flex flex-col items-center gap-2 transition-all border active:scale-95 shadow-xs touch-target-min ${
                isSelected
                  ? 'btn-vigia-primary shadow-md shadow-orange-500/20 scale-102 border-transparent'
                  : 'card-vigia-base hover:border-orange-300 text-slate-800'
              }`}
            >
              <div
                className={`p-2.5 rounded-2xl transition-colors ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-orange-100/90 text-orange-600'
                }`}
              >
                {renderIcon(t.iconName)}
              </div>
              <span className="text-center leading-tight">{t.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Topic Detail Card */}
      <div className="card-vigia-base p-5 sm:p-8 shadow-xl">
        {/* Banner */}
        <div
          className={`bg-gradient-to-r ${topic.colorTheme} text-white p-6 rounded-2xl mb-6 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
        >
          <div>
            <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full mb-2 inline-block">
              Guia Ilustrado de Prevenção
            </span>
            <h3 className="text-2xl sm:text-3xl font-black">{topic.title}</h3>
            <p className="text-sm font-medium opacity-90 mt-1">{topic.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSpeak(`${topic.title}. ${topic.fullContent.whatIsIt}`)}
              className="bg-white/20 hover:bg-white/30 text-white p-3 rounded-2xl backdrop-blur-md transition-colors flex items-center gap-1.5 font-bold text-xs"
              title="Ouvir explicação do guia"
            >
              <Volume2 className="w-5 h-5" />
              <span className="hidden sm:inline">Ouvir Guia</span>
            </button>
          </div>
        </div>

        {/* What Is It */}
        <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <h4 className="text-base font-black text-slate-800 mb-1 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            O que é?
          </h4>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">
            {topic.fullContent.whatIsIt}
          </p>
        </div>

        {/* Golden Adult Rule */}
        <div className="mb-6 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl text-amber-950 font-extrabold text-sm sm:text-base flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="text-amber-800 text-xs font-black uppercase tracking-wider block">
              REGRA MÁXIMA DA DEFESA CIVIL
            </span>
            {topic.fullContent.adultRule}
          </div>
        </div>

        {/* Action Steps Grid (Before, During, Never) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Before */}
          <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-2xl">
            <h5 className="font-black text-emerald-800 text-sm mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Antes: Como se preparar
            </h5>
            <ul className="space-y-2 text-xs font-semibold text-emerald-950">
              {topic.fullContent.whatToDoBefore.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* During */}
          <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-2xl">
            <h5 className="font-black text-blue-800 text-sm mb-3 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              Durante: Como Agir
            </h5>
            <ul className="space-y-2 text-xs font-semibold text-blue-950">
              {topic.fullContent.whatToDoDuring.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Never */}
          <div className="bg-rose-50/60 border border-rose-200 p-4 rounded-2xl">
            <h5 className="font-black text-rose-800 text-sm mb-3 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-600" />
              NUNCA Fazer:
            </h5>
            <ul className="space-y-2 text-xs font-semibold text-rose-950">
              {topic.fullContent.whatNeverToDo.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Fun Fact */}
        <div className="mb-6 bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <h5 className="font-black text-purple-900 text-xs uppercase tracking-wider">
              Curiosidade Incrível do Defensor Mirim!
            </h5>
            <p className="text-xs sm:text-sm text-purple-900 font-medium mt-0.5">
              {topic.funFact}
            </p>
          </div>
        </div>

        {/* Quick Self-Check Quiz */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6">
          <h5 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-orange-500" />
            Teste Rápido de Fixação:
          </h5>

          <p className="font-bold text-sm text-slate-800 mb-3">
            {topic.quizQuestion.question}
          </p>

          <div className="space-y-2 mb-3">
            {topic.quizQuestion.options.map((opt, oIdx) => {
              const isSelected = activeQuizSelected === oIdx;
              const isCorrect = oIdx === topic.quizQuestion.correctIndex;

              let style = 'bg-white hover:bg-orange-50 text-slate-800 border-slate-200';
              if (showQuizFeedback) {
                if (isCorrect) style = 'bg-emerald-500 text-white font-bold border-emerald-600';
                else if (isSelected) style = 'bg-rose-500 text-white font-bold border-rose-600';
              }

              return (
                <button
                  key={oIdx}
                  onClick={() => handleTopicQuizOption(oIdx)}
                  className={`w-full text-left p-3 rounded-xl border text-xs sm:text-sm font-semibold transition-colors ${style}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {showQuizFeedback && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs font-bold text-slate-700 bg-white p-3 rounded-xl border border-slate-200"
            >
              {topic.quizQuestion.explanation}
            </motion.p>
          )}
        </div>

        {/* CTA: Ask DC Assistente about this topic */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-orange-100 to-amber-100 p-4 rounded-2xl border border-orange-200">
          <div>
            <h5 className="font-black text-slate-800 text-sm">
              Quer saber mais sobre {topic.title}?
            </h5>
            <p className="text-xs font-medium text-slate-600">
              Converse diretamente com a Vigia para tirar todas as suas dúvidas!
            </p>
          </div>

          <button
            onClick={() => onAskDC(`Vigia, me explique mais dicas sobre ${topic.title}!`)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 transition-transform active:scale-95 shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Perguntar no Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
