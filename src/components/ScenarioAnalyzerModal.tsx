import type {ActivityClaim} from '../lib/adventureModel';
import {playActivityFeedback,feedbackPreferences} from '../lib/activityFeedback';
import { useDialog } from '../hooks/useDialog';
import { apiFetch } from '../lib/api';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  X,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  PhoneCall,
  HelpCircle,
  Star,
  Compass,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface ScenarioResult {
  status?:string;
  demo?: boolean;
  rewardToken?:string;
  riskLevel?: string;
  riskScore?: number;
  summary: string;
  actionSteps: string[];
  essentialKitItems: string[];
  emergencyNumbersToCall: string[];
  customQuiz: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
  encouragement: string;
}

interface ScenarioAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStars: (stars: number) => void;
  onReward?:(claim:ActivityClaim,points:number)=>Promise<any>;
  onSpeak?: (text: string) => void;
}

const PRESET_SCENARIOS = [
  '🌧️ Choveu muito e a água da rua está subindo em direção à minha calçada.',
  '⛰️ Moro perto de uma encosta/morro e ouvi um estalo na terra após a tempestade.',
  '⚡ Começou uma tempestade forte com raios enquanto eu estava jogando no campo.',
  '🔥 Senti cheiro de fumaça e vi mato pegando fogo perto da rua.',
  '🎒 Quero preparar a mochila de emergência da minha família para a época de chuvas.',
];

export const ScenarioAnalyzerModal: React.FC<ScenarioAnalyzerModalProps> = ({
  isOpen,
  onClose,
  onAddStars,
  onReward,
  onSpeak,
}) => {
  const [scenarioInput, setScenarioInput] = useState('');
  const [houseType, setHouseType] = useState('Casa Térrea');
  const [loading, setLoading] = useState(false);
  const busy=React.useRef(false);
  const answered=React.useRef(false);
  const [serviceError,setServiceError]=useState('');
  const [result, setResult] = useState<ScenarioResult | null>(null);

  // Quiz state inside result
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState(false);

  const dialogRef=useDialog(isOpen,onClose);
  if (!isOpen) return null;

  const handleAnalyze = async (scenarioTextToUse?: string) => {
    const textToAnalyze = scenarioTextToUse || scenarioInput;
    if (!textToAnalyze.trim()) return;

    if(busy.current)return;busy.current=true;answered.current=false;setServiceError('');
    setLoading(true);
    setResult(null);
    setSelectedOption(null);
    setQuizSubmitted(false);
    setQuizSuccess(false);

    try {
      const resp = await apiFetch('/api/analyze-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: textToAnalyze,
          houseType,
        }),
      });

      const body=await resp.json();
      if(body.status==='emergency'){setServiceError(body.summary);return;}
      if(!resp.ok||body.status==='unavailable')throw new Error(body.error || 'Serviço indisponível.');
      const data: ScenarioResult = body;
      setResult(data);
      if (onSpeak && data.summary) {
        onSpeak(data.summary);
      }
    } catch (err) {
      setServiceError(err instanceof Error?err.message:'Análise indisponível.');
    } finally {
      busy.current=false;setLoading(false);
    }
  };

  const handleQuizAnswer = async (index: number) => {
    if (quizSubmitted || answered.current || !result) return;
    answered.current=true;
    setSelectedOption(index);
    setQuizSubmitted(true);

    const isCorrect = index === result.customQuiz.correctIndex;
    setQuizSuccess(isCorrect);

    if (isCorrect) {
      playActivityFeedback('correct');
      try{if(onReward&&result.rewardToken)await onReward({kind:'scenario',id:result.rewardToken,answer:index},20);else if(!onReward)onAddStars(20);}catch(e){setServiceError(e instanceof Error?e.message:'Recompensa indisponível.');}
      try {
        if(feedbackPreferences().animations&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)confetti({
          particleCount: 45,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#f59e0b', '#3b82f6'],
        });
      } catch (e) {}
      if (onSpeak) {
        onSpeak('Resposta certa! Você avançou na aprendizagem!');
      }
    } else {
      playActivityFeedback('retry');
      if (onSpeak) {
        onSpeak('Quase lá! Veja a explicação da Vigia para aprender mais.');
      }
    }
  };

  const getRiskBadgeColor = (level: string) => {
    const lower = (level || '').toLowerCase();
    if (lower.includes('alto')) return 'bg-red-500 text-white border-red-600 shadow-red-500/30';
    if (lower.includes('médio') || lower.includes('medio')) return 'bg-amber-500 text-white border-amber-600 shadow-amber-500/30';
    return 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/30';
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Análise educativa de cenário"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border-2 border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-4 sm:p-5 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm border border-white/30 shadow-inner">
                <Compass className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
                  Análise educativa de cenário
                  <span className="bg-white/20 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded-full border border-white/30">
                    Gemini IA
                  </span>
                </h3>
                <p className="text-xs text-orange-100 font-medium">
                  Descreva qualquer situação de risco para receber um plano de segurança personalizado pela Vigia.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all shrink-0"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {serviceError && <p role="alert" className="p-4 bg-amber-50 text-amber-950">{serviceError}</p>}
          {/* Modal Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {/* Input Form Section */}
            <div className="bg-orange-50/60 border-2 border-orange-200 p-4 rounded-2xl space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-orange-950">
                1. O que está acontecendo ou qual é a sua dúvida?
              </label>

              <textarea
                value={scenarioInput}
                onChange={(e) => setScenarioInput(e.target.value)}
                placeholder="Ex: Minha rua está alagando com a chuva forte e a água está subindo..."
                rows={3}
                className="w-full p-3 rounded-xl border border-orange-300 bg-white text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
              />

              {/* Quick Presets */}
              <div>
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  Ou escolha um exemplo pronto para testar:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_SCENARIOS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setScenarioInput(preset);
                        handleAnalyze(preset);
                      }}
                      className="text-[11px] bg-white hover:bg-orange-100 text-slate-700 hover:text-orange-900 border border-orange-200/90 font-semibold px-2.5 py-1 rounded-xl shadow-2xs transition-all hover:scale-102 text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Housing Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-orange-200/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Tipo de moradia:</span>
                  <select
                    value={houseType}
                    onChange={(e) => setHouseType(e.target.value)}
                    className="text-xs font-bold bg-white border border-orange-300 rounded-lg px-2.5 py-1 text-slate-800 shadow-2xs focus:outline-none"
                  >
                    <option value="Casa Térrea">Casa Térrea</option>
                    <option value="Apartamento">Apartamento</option>
                    <option value="Casa em Morro/Encosta">Casa em Morro / Encosta</option>
                    <option value="Sítio / Zona Rural">Sítio / Zona Rural</option>
                  </select>
                </div>

                <button
                  onClick={() => handleAnalyze()}
                  disabled={loading || !scenarioInput.trim()}
                  className={`py-2.5 px-5 rounded-xl font-black text-xs sm:text-sm text-white shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
                    loading || !scenarioInput.trim()
                      ? 'bg-slate-300 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-orange-500/30'
                  }`}
                >
                  {loading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Analisando com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analisar e Gerar Plano IA</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Analysis Result */}
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5 border-t-2 border-slate-100 pt-4"
              >
                {/* Risk Level Header */}
                <div className="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-2xl shadow-lg">
                  <div className="flex items-center gap-3">
                    {result.riskLevel&&<div className={`px-3 py-1 rounded-xl text-xs font-black uppercase border shadow-md ${getRiskBadgeColor(result.riskLevel)}`}>
                      {result.demo?'Risco fictício':'Estimativa educativa'} {result.riskLevel}
                    </div>}
                    <div>
                      <p className="text-xs font-black text-slate-300">{result.status==='educational'?'Orientação educativa — sem classificação de risco':'Nível de Atenção Calculado'}</p>
                      <p className="text-sm font-extrabold text-white">{result.summary}</p>
                    </div>
                  </div>
                  {typeof result.riskScore==='number'&&<div className="text-right hidden sm:block">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Pontuação de Risco</span>
                    <span className="text-xl font-black text-amber-400">{result.riskScore}/100</span>
                  </div>}
                </div>

                {/* Steps & Kit Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Action Steps */}
                  <div className="bg-emerald-50/70 border-2 border-emerald-200 p-4 rounded-2xl space-y-2">
                    <h4 className="font-black text-xs uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Passos Recomendados
                    </h4>
                    <ul className="space-y-1.5">
                      {result.actionSteps.map((step, idx) => (
                        <li key={idx} className="text-xs text-slate-800 font-semibold flex items-start gap-2">
                          <span className="bg-emerald-200 text-emerald-900 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Essential Kit Items */}
                  <div className="bg-sky-50/70 border-2 border-sky-200 p-4 rounded-2xl space-y-2">
                    <h4 className="font-black text-xs uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-sky-600" />
                      Itens para a Mochila
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {result.essentialKitItems.map((item, idx) => (
                        <span
                          key={idx}
                          className="bg-white border border-sky-300 text-sky-900 text-xs font-bold px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1"
                        >
                          🎒 {item}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2">
                      <span className="text-[10px] font-extrabold uppercase text-slate-500 block mb-1">
                        Ligue em emergência real:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.emergencyNumbersToCall.map((num, idx) => (
                          <span
                            key={idx}
                            className="bg-emerald-600 text-white font-extrabold text-[11px] px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-xs"
                          >
                            <PhoneCall className="w-3 h-3" />
                            {num}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom AI Quiz Challenge */}
                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 border-2 border-indigo-500/40 p-4 sm:p-5 rounded-2xl text-white shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider">
                      <Star className="w-3 h-3 fill-slate-950" /> Desafio IA de Aprendizado (+20 XP)
                    </span>
                    <span className="text-xs font-bold text-indigo-200">Teste o que aprendeu!</span>
                  </div>

                  <p className="font-extrabold text-sm text-indigo-100">{result.customQuiz.question}</p>

                  <div className="space-y-2">
                    {result.customQuiz.options.map((opt, idx) => {
                      let btnStyle = 'bg-slate-800/90 border-slate-700 text-white hover:bg-slate-700/90';
                      if (quizSubmitted) {
                        if (idx === result.customQuiz.correctIndex) {
                          btnStyle = 'bg-emerald-600 border-emerald-400 text-white font-black';
                        } else if (idx === selectedOption) {
                          btnStyle = 'bg-rose-600 border-rose-400 text-white opacity-80';
                        } else {
                          btnStyle = 'bg-slate-800/50 border-slate-700 text-slate-400 opacity-50';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          onClick={() => handleQuizAnswer(idx)}
                          disabled={quizSubmitted}
                          className={`w-full text-left p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {quizSubmitted && idx === result.customQuiz.correctIndex && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {quizSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-xl border text-xs font-medium ${
                        quizSuccess
                          ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                          : 'bg-amber-950/90 border-amber-500 text-amber-200'
                      }`}
                    >
                      <p className="font-bold mb-1">
                        {quizSuccess ? '🎉 Excelente! Você acertou!' : '💡 Dica da Vigia:'}
                      </p>
                      <p>{result.customQuiz.explanation}</p>
                    </motion.div>
                  )}
                </div>

                {/* Encouragement Footer */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs font-extrabold text-amber-900 flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>"{result.encouragement}"</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
