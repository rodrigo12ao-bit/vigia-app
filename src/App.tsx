import {AvatarGenderContext} from './lib/avatarSettings';
import { FeatureBoundary } from './components/FeatureBoundary';
import { apiFetch,getAiStatus } from './lib/api';
import { fetchOrCreateUserProfile } from './lib/salaSeguraService';
import {adultAudience} from './lib/audience';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence,MotionConfig } from 'motion/react';
import { ChatMessage, AvatarState, Badge, DebugInfo } from './types';
import {defaultBadges as INITIAL_BADGES,hydrateBadges} from './lib/badges';
import { speakText, stopSpeaking } from './utils/speech';
import {useAdventure} from './hooks/useAdventure';
import type {ActivityClaim} from './lib/adventureModel';
import {RewardCelebration} from './components/learning/RewardCelebration';
import { Navbar,type AppTab } from './components/Navbar';
const HomeTab=React.lazy(()=>import('./components/HomeTab'));
const LearningCenter=React.lazy(()=>import('./components/learning/LearningCenter'));
const SchoolDashboard=React.lazy(()=>import('./components/SchoolDashboard'));
const HelpTab=React.lazy(()=>import('./components/HelpTab'));
import { ChatTab } from './components/ChatTab';
// Lazy loading das abas secundárias e módulos 3D pesados para carregamento instantâneo
const GameHubTab = React.lazy(() => import('./components/games/hub/GameHubTab'));
const TopicsTab = React.lazy(() => import('./components/TopicsTab').then((m) => ({ default: m.TopicsTab })));
const EmergencyNumbersCard = React.lazy(() => import('./components/EmergencyNumbersCard').then((m) => ({ default: m.EmergencyNumbersCard })));
const SalaSeguraTab = React.lazy(() => import('./components/salasegura/SalaSeguraTab').then((m) => ({ default: m.SalaSeguraTab })));

import { LearningTrailMap } from './components/learning/LearningTrailMap';
import { BadgesModal } from './components/BadgesModal';
import { DailyMissionModal } from './components/DailyMissionModal';
import { ScenarioAnalyzerModal } from './components/ScenarioAnalyzerModal';
import { DynamicAIQuizModal } from './components/DynamicAIQuizModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { LegalModals } from './components/LegalModals';
import { PWAPrompt } from './components/PWAPrompt';
import { OfflineWarning } from './components/OfflineWarning';
import {
  auth,
  onAuthStateChanged,
  signOut,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  arrayUnion,
  onSnapshot,
  User as FirebaseUser,
} from './lib/firebase';

export default function App() {
  const [profileReady,setProfileReady]=useState(false);
  const accountVersion=useRef(0);
  const conversationVersion=useRef(0);
  const renderedAccountVersion=accountVersion.current;
  const renderedConversationVersion=conversationVersion.current;
  const [notice,setNotice]=useState('');
  const [demo,setDemo]=useState(false);
  const [aiTest,setAiTest]=useState(false);
  const [aiLocal,setAiLocal]=useState(false);
  const [aiGemini,setAiGemini]=useState(false);
  const [aiBlocked,setAiBlocked]=useState<string|null>(null);
  const [localDemo,setLocalDemo]=useState(true);
  useEffect(()=>{getAiStatus().then(s=>{setDemo(s.demo);setLocalDemo(s.localDemo!==false);setAiTest(s.ai?.mode==='adult-synthetic');setAiLocal(s.ai?.provider==='local');setAiGemini(s.ai?.provider==='gemini');setAiBlocked(s.ai?.blocked||null);}).catch(()=>{});const listener=(e:Event)=>setNotice((e as CustomEvent).detail);window.addEventListener('vigia-error',listener);return ()=>window.removeEventListener('vigia-error',listener);},[]);
  const [activeTab,setActiveTab]=useState<AppTab>('home');
  const [userRole,setUserRole]=useState('infantil');
  const [initialMission,setInitialMission]=useState<string|null>(null);
  const openLearning=(id?:string)=>{setInitialMission(id||null);setActiveTab('learn');};
  const readAloud=(text:string)=>{if(renderedAccountVersion!==accountVersion.current)return;const consentKey='vigia_reading_voice_consent:'+(auth.currentUser?.uid||'guest');if(!localStorage.getItem(consentKey)){if(!window.confirm('A leitura usa a voz disponível no aparelho. Alguns dispositivos podem processar o texto em serviços do fabricante. Deseja ouvir?'))return;localStorage.setItem(consentKey,'true');}if(!window.speechSynthesis){setNotice('Leitura de voz indisponível neste aparelho.');return;}setIsAudioMuted(false);speakText(text,()=>setIsSpeaking(true),()=>setIsSpeaking(false),true);};

  const [isDailyMissionOpen, setIsDailyMissionOpen] = useState(false);
  const [isScenarioAnalyzerOpen, setIsScenarioAnalyzerOpen] = useState(false);
  const [isDynamicQuizOpen, setIsDynamicQuizOpen] = useState(false);

  // Auth & Entry Flow States
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [nickname, setNickname] = useState<string>(() => {
    return 'Super Protetor';
  });
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    return localStorage.getItem('dc_is_guest') === 'true';
  });
  const [avatarGender, setAvatarGender] = useState<'female' | 'male'>(() => {
    return 'female';
  });
  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(() => {
    // Show welcome screen if not guest and not logged in (will be updated by auth state listener)
    return localStorage.getItem('dc_is_guest') !== 'true';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Olá! Que bom ter você aqui! Eu sou a Vigia, sua tutora e assistente virtual de Proteção e Defesa Civil. 🛡️\n\nEstou aqui para descobrirmos juntos como se proteger em tempestades, enchentes e emergências. Como podemos começar?',
      timestamp: new Date(),
      emotion: 'idle',
      interactiveOptions: [
        'Fazer uma missão de prevenção',
        'Ouvir uma dica de emergência',
        'Fazer uma pergunta para a Vigia',
      ],
      emergencyTip: 'Em caso de perigo real ou emergência, avise um adulto responsável imediatamente e ligue 199 (Defesa Civil) ou 193 (Bombeiros)!',
      challengeOrQuestion: 'Você já sabe onde fica a lanterna da sua casa em dias de tempestade?',
      suggestedFollowUps: [
        'O que é uma enchente?',
        'Por que não posso brincar na água da enchente?',
        'Quais são os números de emergência?',
      ],
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [chatMode, setChatMode] = useState<'text' | 'live'>('text');
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);
  // Refs for preventing duplicate sends and aborting previous requests
  const sendingRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Diagnostic Info Panel State
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    lastRecognizedSpeech: 'Aguardando áudio do microfone...',
    lastSentPrompt: 'Nenhuma pergunta enviada ainda',
    lastApiResponse: 'Aguardando primeira interação...',
    apiStatus: 'Pronto',
    modelName: 'gemini-3.5-flash',
    lastError: 'Nenhum erro registrado',
    sendTimestamp: null,
    responseTimestamp: null,
    voiceStartTimestamp: null,
    avatarRenderedTimestamp: null,
    duration_send_to_response: null,
    duration_response_to_voiceStart: null,
    duration_voiceStart_to_avatarRender: null,
  });

  // Persistent Stars Score & Badges
  const [starsScore, setStarsScore] = useState<number>(() => {
    const saved = null;
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  const [badges, setBadges] = useState<Badge[]>(() => {
    try {
      const saved = null;
      return saved ? JSON.parse(saved) : INITIAL_BADGES;
    } catch {
      return INITIAL_BADGES;
    }
  });

  useEffect(()=>{
    let disposed=false;let stopProfile:(()=>void)|undefined;
    const unsubscribe=onAuthStateChanged(auth,async user=>{
      const version=++accountVersion.current;stopProfile?.();stopProfile=undefined;setUserRole('infantil');setInitialMission(null);
      chatAbortRef.current?.abort(); sendingRef.current=false;chatAbortRef.current=null;
      stopSpeaking();setIsSpeaking(false);setIsLoading(false);setChatMode('text');
      setIsProfileModalOpen(false);setIsScenarioAnalyzerOpen(false);setIsDynamicQuizOpen(false);setIsDailyMissionOpen(false);
      setProfileReady(false);setCurrentUser(user);setStarsScore(0);setBadges(INITIAL_BADGES);setNickname('Super Protetor');setAvatarGender('female');setActiveTab('home');handleResetChat(true);
      if(user){
        setIsGuest(false);localStorage.setItem('dc_is_guest','false');setIsWelcomeOpen(false);
        try{
          await fetchOrCreateUserProfile(user.uid,user.email,sessionStorage.getItem('vigia_pending_nickname') || 'Super Protetor');
          const snapshot=await getDoc(doc(db,'users',user.uid));
          if(disposed || version!==accountVersion.current)return;
          const data=snapshot.data() || {};
          setNickname(data.nickname || 'Super Protetor');setStarsScore(data.starsScore ?? 0);setAvatarGender(data.avatarGender==='male'?'male':'female');
          setBadges(hydrateBadges(data.badges));
          setUserRole(['educador','responsavel'].includes(data.role)?data.role:'infantil');
          setProfileReady(true);
          stopProfile=onSnapshot(doc(db,'users',user.uid),snap=>{if(disposed||version!==accountVersion.current||!snap.exists())return;const p=snap.data();setStarsScore(p.starsScore||0);setBadges(hydrateBadges(p.badges));setNickname(p.nickname||'Super Protetor');},()=>setNotice('Não foi possível atualizar seu perfil. Verifique a conexão.'));
        }catch{if(!disposed&&version===accountVersion.current){try{const cached=JSON.parse(localStorage.getItem('vigia_progress:'+user.uid)||'null');if(cached){setNickname(cached.nickname||'Super Protetor');setStarsScore(cached.starsScore||0);setBadges(cached.badges||INITIAL_BADGES);setProfileReady(true);}}catch{}setNotice('Seu perfil está sem conexão. As atividades salvas continuam disponíveis; o acompanhamento requer conexão.');}}
      }else{
        try{const data=JSON.parse(localStorage.getItem('vigia_progress:guest') || '{}');setNickname(data.nickname||'Super Protetor');setStarsScore(data.starsScore||0);setBadges(data.badges||INITIAL_BADGES);setAvatarGender(data.avatarGender==='male'?'male':'female');}catch{}
        setProfileReady(true);setIsWelcomeOpen(localStorage.getItem('dc_is_guest')!=='true');
      }
    });
    return ()=>{disposed=true;++accountVersion.current;chatAbortRef.current?.abort();stopProfile?.();unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!profileReady)return;
    const uid=currentUser?.uid;
    const progress={starsScore,nickname,avatarGender,badges};
    try{localStorage.setItem('vigia_progress:'+ (uid || 'guest'),JSON.stringify(progress));}catch{setNotice('O armazenamento local está cheio. Seu progresso pode não ter sido salvo.');}

  },[profileReady,currentUser,starsScore,badges,nickname,avatarGender]);

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('dc_is_guest', 'true');
    setIsWelcomeOpen(false);
    setIsAuthModalOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch { setNotice('Não foi possível sair da conta. Tente novamente.'); return; }
    setIsGuest(false);
    localStorage.removeItem('dc_is_guest');
    setIsProfileModalOpen(false);
    setIsWelcomeOpen(true);
  };

  const handleResetProgress = async () => {
    if(renderedAccountVersion!==accountVersion.current)return;
    const version=accountVersion.current;
    try {
      if(currentUser)await updateDoc(doc(db,'users',currentUser.uid),{starsScore:0,badges:[],updatedAt:new Date().toISOString()});
      else localStorage.setItem('vigia_progress:guest',JSON.stringify({starsScore:0,badges:INITIAL_BADGES,nickname,avatarGender}));
      if(version!==accountVersion.current)return;
      setStarsScore(0);setBadges(INITIAL_BADGES);
    }catch{setNotice('Não foi possível reiniciar o progresso. Seus dados anteriores foram preservados.');}
  };
  const handleUpdateNickname = async (newNick:string) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    const version=accountVersion.current;
    try {
      if(currentUser)await updateDoc(doc(db,'users',currentUser.uid),{nickname:newNick.slice(0,80),updatedAt:new Date().toISOString()});
      if(version!==accountVersion.current)return;
      setNickname(newNick.slice(0,80));
    }catch{setNotice('Não foi possível salvar o apelido. Verifique a conexão.');}
  };

  const handleAddStars = (points: number) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    if(currentUser?.uid!==auth.currentUser?.uid)return;
    setStarsScore((prev) => prev + points);
    if(currentUser)updateDoc(doc(db,'users',currentUser.uid),{starsScore:increment(points),updatedAt:new Date().toISOString()}).catch(()=>setNotice('Pontos ainda não sincronizados. Verifique a conexão.'));
  };

  const handleUnlockBadge = (badgeId: string) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    if(currentUser?.uid!==auth.currentUser?.uid)return;
    if(currentUser)updateDoc(doc(db,'users',currentUser.uid),{badges:arrayUnion(badgeId)}).catch(()=>setNotice('Conquista ainda não sincronizada.'));
    setBadges((prevBadges) =>
      (prevBadges.some(b=>b.id===badgeId)?prevBadges:[...prevBadges,{id:badgeId,title:'Conquista',description:'Nova conquista de aprendizagem.',icon:'🛡️',unlocked:false,category:'general' as const}]).map((b) => {
        if (b.id === badgeId && !b.unlocked) {
          return { ...b, unlocked: true, unlockedAt: new Date().toLocaleDateString() };
        }
        return b;
      })
    );
  };

  const adventure=useAdventure(currentUser?.uid,starsScore,handleAddStars,handleUnlockBadge);
  const rewardActivity=(claim:ActivityClaim,points:number)=>adventure.earn(claim,points);

  const speakMessage = (text: string) => {
    if(renderedAccountVersion!==accountVersion.current || renderedConversationVersion!==conversationVersion.current)return;
    if (isAudioMuted) return;
    speakText(
      text,
      () => {
        const vs = performance.now();
        setIsSpeaking(true);
        setDebugInfo((prev) => ({
          ...prev,
          voiceStartTimestamp: vs,
          duration_response_to_voiceStart: prev.responseTimestamp ? Math.round(vs - (prev.responseTimestamp as number)) : null,
        }));
      },
      () => {
        setIsSpeaking(false);
        setAvatarState((prev) => (prev === 'speaking' || prev === 'explaining' ? 'idle' : prev));
      }
    );
  };

  const handleSendMessage = async (
    text: string,
    image?: { data: string; mimeType: string }
  ) => {
    if(renderedAccountVersion!==accountVersion.current || renderedConversationVersion!==conversationVersion.current)return;
    if ((!text.trim() && !image) || sendingRef.current || !profileReady) return;
    if(messages.length>=198){setNotice('Esta conversa atingiu o limite. Abra uma nova conversa; seu histórico está preservado.');return;}

    const version=accountVersion.current;
    // mark sending immediately to prevent duplicate invocations
    sendingRef.current = true;

    // stop previous voice immediately
    stopSpeaking();
    setIsSpeaking(false);

    // abort any previous chat request
    try {
      if (chatAbortRef.current) {
        chatAbortRef.current.abort();
      }
    } catch (e) {
      // ignore
    }

    const controller = new AbortController();
    chatAbortRef.current = controller;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text || (image ? 'Análise de Imagem' : ''),
      timestamp: new Date(),
      imageUrl: image ? `data:${image.mimeType};base64,${image.data}` : undefined,
    };

    const historyForRequest = [...messages, userMsg];

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setAvatarState('thinking');

    const sendTs = performance.now();
    setDebugInfo((prev) => ({
      ...prev,
      lastSentPrompt: text || '[Imagem Enviada]',
      apiStatus: 'Enviando pergunta ao Gemini...',
      lastError: 'Processando...',
      sendTimestamp: sendTs,
      responseTimestamp: null,
      voiceStartTimestamp: null,
      avatarRenderedTimestamp: null,
      duration_send_to_response: null,
      duration_response_to_voiceStart: null,
      duration_voiceStart_to_avatarRender: null,
    }));

    // Create assistant message placeholder immediately for streaming
    const assistantMsgId = (Date.now() + 1).toString();
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      emotion: 'thinking',
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || 'Analise esta imagem sobre segurança e riscos.',
          readingLevel: (()=>{try{return JSON.parse(localStorage.getItem('vigia_learning_v2:'+(currentUser?.uid||'guest'))||'null')?.progress?.reading;}catch{return undefined;}})(),
          chatHistory: messages.slice(-30).map((m) => ({ role: m.role, content: m.content })),
          image: image ? { data: image.data, mimeType: image.mimeType } : undefined,
          avatarGender: avatarGender,
          nickname: nickname,
          starsScore: starsScore,
          unlockedBadgesCount: badges.filter((b) => b.unlocked).length,
        }),
        signal: controller.signal,
      });

      const respTs = performance.now();
      setDebugInfo((prev) => ({
        ...prev,
        responseTimestamp: respTs,
        duration_send_to_response: Math.round(respTs - sendTs),
      }));

      if (!response.ok) {
        const failure=await response.json().catch(()=>null);
        throw new Error(failure?.error||'Serviço de IA indisponível.');
      }

      const data = await response.json();
      if(controller.signal.aborted || version!==accountVersion.current)return;
      if(data.status!=='emergency'){handleUnlockBadge('b_chat');handleAddStars(5);}
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: data.reply || 'Tive um pequeno contratempo para processar essa resposta.',
                emotion: (data.avatarState as AvatarState) || 'speaking',
                emergencyTip: data.emergencyTip && data.emergencyTip.trim() ? data.emergencyTip : undefined,
                challengeOrQuestion: data.challengeOrQuestion && data.challengeOrQuestion.trim() ? data.challengeOrQuestion : undefined,
                interactiveOptions: Array.isArray(data.interactiveOptions) && data.interactiveOptions.length > 0 ? data.interactiveOptions : undefined,
                suggestedFollowUps: Array.isArray(data.suggestedFollowUps) && data.suggestedFollowUps.length > 0 ? data.suggestedFollowUps : undefined,
              }
            : m
        )
      );

      if (data.avatarState) setAvatarState(data.avatarState as AvatarState);

      // Record approximate avatar render time
      requestAnimationFrame(() => {
        const ar = performance.now();
        setDebugInfo((prev) => ({
          ...prev,
          avatarRenderedTimestamp: ar,
          duration_voiceStart_to_avatarRender: prev.voiceStartTimestamp ? Math.round(ar - (prev.voiceStartTimestamp as number)) : null,
        }));
      });

      setDebugInfo((prev) => ({
        ...prev,
        lastSentPrompt: text,
        apiStatus: 'Resposta recebida',
        modelName: data.model||data.provider||'Serviço de IA',
        lastError: 'Nenhum erro registrado',
      }));
    } catch (error: any) {
      if(version!==accountVersion.current)return;
      if (error && error.name === 'AbortError') {
        setDebugInfo((prev) => ({ ...prev, apiStatus: 'Requisição abortada' }));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: 'Requisição cancelada pelo usuário.' } : m))
        );
      } else {
        console.error('Erro no streaming de chat:', error);
        const errorMsg = String(error?.message || error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    `IA indisponível: ${errorMsg} Em perigo real, procure um adulto e ligue 199 (Defesa Civil) ou 193 (Bombeiros).`,
                  emotion: 'serious',
                }
              : m
          )
        );
        setAvatarState('serious');
        setDebugInfo((prev) => ({
          ...prev,
          lastSentPrompt: text,
          apiStatus: 'Erro de Rede',
          lastError: errorMsg,
        }));
      }
    } finally {
      if(chatAbortRef.current===controller){setIsLoading(false);sendingRef.current=false;chatAbortRef.current=null;}
    }
  };

  const handleSelectPrompt = (prompt: string) => {
    setActiveTab('chat');
    handleSendMessage(prompt);
  };

  const handleAskDCFromTopic = (question: string) => {
    setActiveTab('chat');
    handleSendMessage(question);
  };

  const handleResetChat = (force=false) => {
    if(!force && renderedAccountVersion!==accountVersion.current)return;
    ++conversationVersion.current;
    chatAbortRef.current?.abort();
    stopSpeaking();
    setIsSpeaking(false);
    setMessages([
      {
        id: 'welcome_reset',
        role: 'assistant',
        content:
          'Conversa com a Vigia reiniciada! Qual dúvida sobre prevenção você gostaria de tirar agora?',
        timestamp: new Date(),
        emotion: 'idle',
        suggestedFollowUps: [
          'Vigia, estou sozinha e a água está entrando na minha casa. O que faço?',
          'O que fazer se chover muito forte?',
          'O que colocar na mochila de emergência?',
        ],
      },
    ]);
    setAvatarState('idle');
  };

  const handleLoadSession = (sessionMessages: ChatMessage[]) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    ++conversationVersion.current;
    chatAbortRef.current?.abort();
    stopSpeaking();
    setIsSpeaking(false);
    setMessages(sessionMessages);
    setAvatarState('idle');
  };

  useEffect(()=>{const listener=(e:Event)=>{const d=(e as CustomEvent).detail;if((d.uid||'guest')!==(auth.currentUser?.uid||'guest'))return;document.documentElement.style.setProperty('--vigia-text-size',d.textSize==='large'?'20px':'16px');};window.addEventListener('vigia-reading',listener);return()=>window.removeEventListener('vigia-reading',listener);},[]);
  const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;

  return (
    <MotionConfig reducedMotion="user">
    <AvatarGenderContext.Provider value={avatarGender}><div className={`vigia-app bg-gradient-to-b from-orange-50/40 via-slate-100/90 to-blue-50/30 text-slate-900 font-sans flex flex-col antialiased transition-colors duration-500 ease-in-out px-safe ${
      activeTab === 'chat' ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
    }`}>
      {demo && <div role="status" className="bg-amber-100 text-amber-950 px-3 py-2 text-xs text-center font-bold">{localDemo?'DEMONSTRAÇÃO LOCAL • contas fictícias':'PRÉVIA ONLINE • use apenas dados fictícios'} • respostas da IA simuladas • voz ao vivo indisponível</div>}
      {aiTest&&<div role="status" className="bg-indigo-100 text-indigo-950 px-3 py-2 text-xs text-center font-bold">TESTE LOCAL DE IA REAL • exclusivo para adultos • somente dados fictícios • voz gerada por IA{aiBlocked?' • '+aiBlocked:''}</div>}
      {aiLocal&&<div role="status" className="bg-emerald-100 text-emerald-950 px-3 py-2 text-xs text-center font-bold">IA GRATUITA LOCAL • respostas reais • dados fictícios • supervisão de um adulto{aiBlocked?' • '+aiBlocked:''}</div>}
      {aiGemini&&<div role="status" className="bg-indigo-100 text-indigo-950 px-3 py-2 text-xs text-center font-bold">VIGIA 18+ • Gemini real • cota gratuita • não envie dados pessoais{aiBlocked?' • '+aiBlocked:''}</div>}
      {notice && <div role="alert" className="bg-rose-100 text-rose-900 p-3 text-sm">{notice} <button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
      {/* Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={tab=>{if(tab==='learn')setInitialMission(null);setActiveTab(tab);}}
        starsScore={starsScore}
        unlockedBadgesCount={unlockedBadgesCount}
        totalBadgesCount={badges.length}
        onOpenBadges={() => setIsBadgesModalOpen(true)}
        onOpenDailyMission={() => setIsDailyMissionOpen(true)}
        onOpenScenarioAnalyzer={() => setIsScenarioAnalyzerOpen(true)}
        onOpenDynamicQuiz={() => setIsDynamicQuizOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        currentUser={currentUser}
        nickname={nickname}
        isGuest={isGuest}
        isAudioMuted={isAudioMuted}
        chatMode={chatMode}
        setIsAudioMuted={(muted) => {
          setIsAudioMuted(muted);
          if (muted) {
            stopSpeaking();
            setIsSpeaking(false);
          }
        }}
      />

      {!profileReady && <div role="status" className="p-4 text-center">Carregando seu perfil com segurança…</div>}
      {/* Main View Area */}
      <main className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <FeatureBoundary key={activeTab+':'+(currentUser?.uid||'guest')} onReset={()=>setActiveTab('chat')}><AnimatePresence mode="wait">
          <motion.div
            key={activeTab+':'+(currentUser?.uid||'guest')}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={`w-full ${activeTab === 'chat' ? 'h-full flex flex-col min-h-0' : 'min-h-full'}`}
          >
            {['home','learn','school'].includes(activeTab)&&profileReady&&<React.Suspense fallback={<div role="status" className="learn-shell">Preparando sua próxima atividade…</div>}>
              {activeTab==='home'&&<HomeTab uid={currentUser?.uid} nickname={nickname} role={userRole} onLearn={openLearning} onChat={()=>setActiveTab('chat')} onSchool={()=>setActiveTab('school')} xp={starsScore} badgesCount={badges.filter(b=>b.unlocked).length} adventure={adventure.state}/>}
              {activeTab==='learn'&&<LearningCenter key={currentUser?.uid||'guest'} xp={starsScore} badges={badges} adventure={adventure.state} pendingRewards={adventure.pending} rewardNotice={adventure.notice} onSyncRewards={adventure.sync} onReward={rewardActivity} uid={currentUser?.uid} initialMission={initialMission} onAddStars={handleAddStars} onUnlockBadge={handleUnlockBadge} onSpeak={readAloud} onAsk={handleAskDCFromTopic} onOpenQuiz={()=>setIsDynamicQuizOpen(true)} onOpenScenario={()=>setIsScenarioAnalyzerOpen(true)} onOpenDaily={()=>setIsDailyMissionOpen(true)} onOpenSchool={()=>setActiveTab('school')}/>}
              {activeTab==='school'&&<SchoolDashboard uid={currentUser?.uid} onLearn={()=>openLearning()}/>}
            </React.Suspense>}
            {activeTab === 'chat' && profileReady && (
              <ChatTab
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                avatarState={avatarState}
                isSpeaking={isSpeaking}
                onReplayAudio={speakMessage}
                onSelectPrompt={handleSelectPrompt}
                onResetChat={handleResetChat}
                onLoadSession={handleLoadSession}
                isAudioMuted={isAudioMuted}
                debugInfo={debugInfo}
                currentUser={currentUser}
                isGuest={isGuest}
                onChatModeChange={setChatMode}
                onVoiceTurn={(input,reply)=>{if(renderedAccountVersion!==accountVersion.current||renderedConversationVersion!==conversationVersion.current)return;const now=new Date();setMessages(previous=>[...previous,{id:crypto.randomUUID(),role:'user',content:input,timestamp:now},{id:crypto.randomUUID(),role:'assistant',content:reply,timestamp:now,emotion:'explaining'}]);}}
                onSpeechRecognized={(speechText) => {
                  setDebugInfo((prev) => ({
                    ...prev,
                    lastRecognizedSpeech: speechText,
                  }));
                }}
                onToggleAudioMute={() => {
                  const nextMuted = !isAudioMuted;
                  setIsAudioMuted(nextMuted);
                  if (nextMuted) {
                    stopSpeaking();
                    setIsSpeaking(false);
                  }
                }}
              />
            )}

            {activeTab === 'games' && (
              <React.Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-xs">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
                    Carregando Hub de Jogos...
                  </div>
                }
              >
                <div className="h-full">
                  <GameHubTab userId={currentUser?.uid}
                    onAddStars={handleAddStars}
                    onUnlockBadge={handleUnlockBadge}
                    onSpeak={speakMessage}
                    onOpenDailyMission={() => setIsDailyMissionOpen(true)}
                    badges={badges}
                    stars={starsScore}
                  />
                </div>
              </React.Suspense>
            )}

            {activeTab === 'topics' && (
              <React.Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-xs">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
                    Carregando Tópicos de Prevenção...
                  </div>
                }
              >
                <TopicsTab onAskDC={handleAskDCFromTopic} onSpeak={speakMessage} />
              </React.Suspense>
            )}

            {activeTab==='phones'&&<React.Suspense fallback={<p className="learn-shell">Preparando orientações…</p>}><HelpTab onSala={()=>setActiveTab('sala_segura')} onSchool={()=>setActiveTab('school')} onPrivacy={()=>setLegalModalType('privacy')} onSpeak={readAloud} role={userRole}/></React.Suspense>}

            {activeTab === 'sala_segura' && (
              <React.Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-xs">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
                    Carregando Sala Segura...
                  </div>
                }
              >
                <SalaSeguraTab
                  currentUser={currentUser}
                  isGuest={isGuest}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                />
              </React.Suspense>
            )}
          </motion.div>
        </AnimatePresence></FeatureBoundary>
      </main>


      {/* Footer */}
      {activeTab !== 'chat' && (
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs font-semibold text-slate-500 shrink-0">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              🛡️ Vigia - Assistente Virtual Educativa de Proteção e Defesa Civil
            </span>
            <span className="text-[11px] bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-bold">
              Educação para prevenção • Emergência 199 / 193
            </span>
          </div>
        </footer>
      )}

      {/* Badges Modal */}
      <BadgesModal
        isOpen={isBadgesModalOpen}
        onClose={() => setIsBadgesModalOpen(false)}
        badges={badges}
        starsScore={starsScore}
      />

      {/* Daily Mission Modal */}
      <DailyMissionModal onReward={rewardActivity} key={'daily:'+(currentUser?.uid || 'guest')}
        isOpen={isDailyMissionOpen}
        onClose={() => setIsDailyMissionOpen(false)}
        onAddStars={handleAddStars}
        onUnlockBadge={handleUnlockBadge}
        starsScore={starsScore}
      />

      {/* AI Scenario Risk Analyzer Modal */}
      <ScenarioAnalyzerModal onReward={rewardActivity} key={'scenario:'+(currentUser?.uid || 'guest')}
        isOpen={isScenarioAnalyzerOpen}
        onClose={() => setIsScenarioAnalyzerOpen(false)}
        onAddStars={handleAddStars}
        onSpeak={speakMessage}
      />

      {/* AI Dynamic Quiz Generator Modal */}
      <DynamicAIQuizModal onReward={rewardActivity} key={'quiz:'+(currentUser?.uid || 'guest')}
        isOpen={isDynamicQuizOpen}
        onClose={() => setIsDynamicQuizOpen(false)}
        onAddStars={handleAddStars}
        onSpeak={speakMessage}
      />

      {/* Professional Welcome Screen */}
      {isWelcomeOpen && (
        <WelcomeScreen
          avatarGender={avatarGender}
          onSelectGender={setAvatarGender}
          onStart={() => {
            setIsWelcomeOpen(false);
            setIsAuthModalOpen(true);
          }}
          onLoginClick={() => {
            setIsWelcomeOpen(false);
            setIsAuthModalOpen(true);
          }}
          onContinueAsGuest={handleContinueAsGuest}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onContinueAsGuest={handleContinueAsGuest}
        onOpenLegal={(type) => setLegalModalType(type)}
      />

      {/* User Profile & Progress Modal */}
      <ProfileModal key={'profile:'+(currentUser?.uid || 'guest')} userId={currentUser?.uid} userRole={userRole}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userEmail={currentUser?.email || null}
        nickname={nickname}
        onUpdateNickname={handleUpdateNickname}
        starsScore={starsScore}
        badges={badges}
        completedGamesCount={adventure.state.completed}
        isGuest={isGuest}
        onSignOut={handleSignOut}
        onResetProgress={handleResetProgress}
        onOpenBadges={()=>{setIsProfileModalOpen(false);setIsBadgesModalOpen(true);}}
      />

      {/* Terms and Privacy Legal Modals */}
      <LegalModals
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />

      {/* PWA Components */}
      <RewardCelebration key={'reward:'+(currentUser?.uid||'guest')} uid={currentUser?.uid}/>
      <PWAPrompt visible={activeTab==='phones'}/>
      <OfflineWarning />
    </div></AvatarGenderContext.Provider></MotionConfig>
  );
}
