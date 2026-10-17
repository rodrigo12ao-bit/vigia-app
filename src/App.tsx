import {AvatarGenderContext} from './lib/avatarSettings';
import { FeatureBoundary } from './components/FeatureBoundary';
import { apiFetch,getAiStatus } from './lib/api';
import {adultAudience} from './lib/audience';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence,MotionConfig } from 'motion/react';
import { ChatMessage, AvatarState, Badge, DebugInfo } from './types';
import {defaultBadges as INITIAL_BADGES,hydrateBadges} from './lib/badges';
import {normalizeProfileProgress} from './lib/profileProgress';
import {finishDeletedAccountSession} from './lib/accountSession';
import { speakText, speakDeviceText, stopSpeaking, type DeviceSpeechCallbacks, type DeviceSpeechHandle } from './utils/speech';
import {useAdventure} from './hooks/useAdventure';
import type {ActivityClaim} from './lib/adventureModel';
import {RewardCelebration} from './components/learning/RewardCelebration';
import { Navbar,type AppTab } from './components/Navbar';
import {useDialog} from './hooks/useDialog';
import {createConversationMemory,queueConversationSnapshot,requireConversationReadyForUpdate,flushConversationForUpdate,type ConversationMetadata} from './lib/conversationState';
import {appendVoiceConversationTurn,createVoiceConversationMemory,queueVoiceConversationSnapshot} from './lib/voiceConversationState';
const HomeTab=React.lazy(()=>import('./components/HomeTab'));
const LearningCenter=React.lazy(()=>import('./components/learning/LearningCenter'));
const SchoolDashboard=React.lazy(()=>import('./components/SchoolDashboard'));
const HelpTab=React.lazy(()=>import('./components/HelpTab'));
const loadChatTab=()=>import('./components/ChatTab').then(m=>({default:m.ChatTab}));
const ChatTab=React.lazy(loadChatTab);
// Lazy loading das abas secundárias e módulos 3D pesados para carregamento instantâneo
const GameHubTab = React.lazy(() => import('./components/games/hub/GameHubTab'));
const TopicsTab = React.lazy(() => import('./components/TopicsTab').then((m) => ({ default: m.TopicsTab })));
const EmergencyNumbersCard = React.lazy(() => import('./components/EmergencyNumbersCard').then((m) => ({ default: m.EmergencyNumbersCard })));
const SalaSeguraTab = React.lazy(() => import('./components/salasegura/SalaSeguraTab').then((m) => ({ default: m.SalaSeguraTab })));

const BadgesModal=React.lazy(()=>import('./components/BadgesModal').then(m=>({default:m.BadgesModal})));
const DailyMissionModal=React.lazy(()=>import('./components/DailyMissionModal').then(m=>({default:m.DailyMissionModal})));
const ScenarioAnalyzerModal=React.lazy(()=>import('./components/ScenarioAnalyzerModal').then(m=>({default:m.ScenarioAnalyzerModal})));
const DynamicAIQuizModal=React.lazy(()=>import('./components/DynamicAIQuizModal').then(m=>({default:m.DynamicAIQuizModal})));
import { WelcomeScreen } from './components/WelcomeScreen';
const AuthModal=React.lazy(()=>import('./components/AuthModal').then(m=>({default:m.AuthModal})));
const ProfileModal=React.lazy(()=>import('./components/ProfileModal').then(m=>({default:m.ProfileModal})));
const LegalModals=React.lazy(()=>import('./components/LegalModals').then(m=>({default:m.LegalModals})));
import { PWAPrompt } from './components/PWAPrompt';
import { OfflineWarning } from './components/OfflineWarning';
import {
  auth,
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from './lib/firebaseAuth';

function ModalLoading({label,onClose}:{label:string;onClose:()=>void}) {
  const dialogRef=useDialog(true,onClose);
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md"><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 text-center"><p role="status">{label}</p><button className="vigia-secondary" onClick={onClose}>Cancelar</button></div></div>;
}

// Load each modal once it is requested, then retain its state between openings.
function DeferredModal({open,label,onClose,onReload,children}:{open:boolean;label:string;onClose:()=>void;onReload?:()=>Promise<void>;children:React.ReactNode}) {
  const [opened,setOpened]=useState(open);
  useEffect(()=>{if(open)setOpened(true);},[open]);
  if(!open&&!opened)return null;
  return <div hidden={!open}><FeatureBoundary onReset={onClose} onReload={onReload}><React.Suspense fallback={open?<ModalLoading label={label} onClose={onClose}/>:null}>{children}</React.Suspense></FeatureBoundary></div>;
}

export default function App() {
  const [profileReady,setProfileReady]=useState(false);
  const [profileError,setProfileError]=useState('');
  const [profileRetry,setProfileRetry]=useState(0);
  const profileCacheBlocked=useRef(false);
  const accountVersion=useRef(0);
  const conversationVersion=useRef(0);
  const conversationMemory=useRef(createConversationMemory());
  const voiceConversationMemory=useRef(createVoiceConversationMemory());
  const [voiceMessages,setVoiceMessages]=useState<ChatMessage[]>([]);
  const renderedVoiceMemory=voiceConversationMemory.current;
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
  const allowDeviceSpeech=()=>{
    if(renderedAccountVersion!==accountVersion.current)return false;
    const consentKey='vigia_reading_voice_consent:'+(auth.currentUser?.uid||'guest');
    if(!localStorage.getItem(consentKey)){
      if(!window.confirm('A leitura usa a voz disponível no aparelho. Alguns dispositivos podem processar o texto em serviços do fabricante. Deseja ouvir?'))return false;
      localStorage.setItem(consentKey,'true');
    }
    if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){setNotice('Leitura de voz indisponível neste aparelho.');return false;}
    return true;
  };
  const readAloud=(text:string,callbacks:DeviceSpeechCallbacks={}):DeviceSpeechHandle|null=>{
    if(!allowDeviceSpeech())return null;
    setIsAudioMuted(false);
    return speakDeviceText(text,{
      onStart:()=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(true);callbacks.onStart?.();}else callbacks.onCancel?.();},
      onEnd:()=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(false);callbacks.onEnd?.();}else callbacks.onCancel?.();},
      onCancel:()=>{if(renderedAccountVersion===accountVersion.current)setIsSpeaking(false);callbacks.onCancel?.();},
      onError:message=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(false);setNotice(message);}callbacks.onError?.(message);},
    });
  };
  const readLocalAloud=(text:string,callbacks:DeviceSpeechCallbacks={}):DeviceSpeechHandle|null=>{
    if(renderedAccountVersion!==accountVersion.current)return null;
    return speakDeviceText(text,{
      onStart:()=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(true);callbacks.onStart?.();}else callbacks.onCancel?.();},
      onEnd:()=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(false);callbacks.onEnd?.();}else callbacks.onCancel?.();},
      onCancel:()=>{if(renderedAccountVersion===accountVersion.current)setIsSpeaking(false);callbacks.onCancel?.();},
      onError:message=>{if(renderedAccountVersion===accountVersion.current){setIsSpeaking(false);setNotice(message);}callbacks.onError?.(message);},
    },{localOnly:true});
  };

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
  const conversationMessages=useRef(messages);conversationMessages.current=messages;
  const conversationActivity=useRef({loading:isLoading,mode:chatMode});conversationActivity.current={loading:isLoading,mode:chatMode};
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

  const flushActiveConversation=async()=>{
    const memory=conversationMemory.current,version=accountVersion.current;
    const voiceMemory=voiceConversationMemory.current;
    const isCurrent=()=>conversationMemory.current===memory&&voiceConversationMemory.current===voiceMemory&&version===accountVersion.current&&auth.currentUser?.uid===memory.uid;
    if(!isCurrent())throw Error('A conta ou a conversa mudou. Tente novamente.');
    queueConversationSnapshot(memory,conversationMessages.current,conversationActivity.current.loading);
    if(memory.pendingSave.current){
      if(!memory.flush)throw Error('A conversa ainda está sendo preparada. Aguarde antes de atualizar.');
      await memory.flush();
      if(!isCurrent())throw Error('A conta ou a conversa mudou. Tente novamente.');
    }
    queueVoiceConversationSnapshot(voiceMemory);
    if(voiceMemory.pendingSave.current){
      if(!voiceMemory.flush)throw Error('A conversa por voz ainda está sendo preparada. Aguarde antes de atualizar.');
      await voiceMemory.flush();
      if(!isCurrent())throw Error('A conta ou a conversa mudou. Tente novamente.');
    }
  };
  const prepareUpdate=async()=>{
    const memory=conversationMemory.current,version=accountVersion.current;
    const check=()=>{
      if(memory!==conversationMemory.current||version!==accountVersion.current||auth.currentUser?.uid!==memory.uid)throw Error('A conta ou a conversa mudou. Tente atualizar novamente.');
      requireConversationReadyForUpdate(memory,conversationMessages.current,conversationActivity.current);
      const voiceMemory=voiceConversationMemory.current;
      if(!voiceMemory.historyReady&&voiceMemory.messages.length)throw Error('Recarregue o histórico de voz antes de atualizar. A conversa por voz continua preservada.');
    };
    await flushConversationForUpdate(flushActiveConversation,check);
  };
  const prepareAccountChange=async(action:string)=>{
    const memory=conversationMemory.current,version=accountVersion.current;
    memory.stopAudio?.();stopSpeaking();setIsSpeaking(false);setChatMode('text');
    voiceConversationMemory.current.stopAudio?.();
    const check=()=>{
      if(memory!==conversationMemory.current||version!==accountVersion.current||auth.currentUser?.uid!==memory.uid)throw Error('A conta ou a conversa mudou. Tente novamente.');
      requireConversationReadyForUpdate(memory,conversationMessages.current,{...conversationActivity.current,mode:'text'},action);
      if(!voiceConversationMemory.current.historyReady&&voiceConversationMemory.current.messages.length)throw Error('Recarregue o histórico de voz antes de '+action+'. Sua conversa por voz permanece aberta.');
    };
    await flushConversationForUpdate(flushActiveConversation,check);
    return {memory,version};
  };
  const openAuthSafely=async()=>{
    const version=accountVersion.current,uid=auth.currentUser?.uid;
    try{
      const {memory,version}=await prepareAccountChange('entrar em outra conta');
      if(memory!==conversationMemory.current||version!==accountVersion.current||auth.currentUser?.uid!==memory.uid)return;
      setIsWelcomeOpen(false);setIsAuthModalOpen(true);
    }catch(error){if(version===accountVersion.current&&auth.currentUser?.uid===uid)setNotice(error instanceof Error?error.message:'Não foi possível salvar a conversa antes de abrir o acesso. Tente novamente.');}
  };
  useEffect(()=>{
    const memory=conversationMemory.current;
    if(!profileReady||auth.currentUser?.uid!==memory.uid)return;
    queueConversationSnapshot(memory,messages,isLoading);
    // A reply may finish after Chat has unmounted. Its App-owned memory still
    // has the saver, so confirm it without waiting for a tab revisit/pagehide.
    if(activeTab!=='chat'&&memory.pendingSave.current&&memory.flush){
      void memory.flush().catch(()=>{if(memory===conversationMemory.current)setNotice('A última conversa ainda não foi salva. Verifique a conexão e tente novamente.');});
    }
  },[profileReady,messages,isLoading,activeTab]);
  useEffect(()=>{
    const memory=voiceConversationMemory.current;
    if(!profileReady||auth.currentUser?.uid!==memory.uid)return;
    queueVoiceConversationSnapshot(memory);
    if(activeTab!=='chat'&&memory.pendingSave.current&&memory.flush){
      void memory.flush().catch(()=>{if(memory===voiceConversationMemory.current)setNotice('A última conversa por voz ainda não foi salva. Tente novamente antes de atualizar.');});
    }
  },[profileReady,voiceMessages,activeTab]);
  useEffect(()=>{
    const stage=()=>{
      const memory=conversationMemory.current;
      if(auth.currentUser?.uid!==memory.uid)return;
      queueConversationSnapshot(memory,conversationMessages.current,conversationActivity.current.loading);
      const pending=memory.pendingSave.current;
      if(pending&&!pending.uid)memory.stageGuest?.(pending.session);
      const voiceMemory=voiceConversationMemory.current;
      queueVoiceConversationSnapshot(voiceMemory);
      const pendingVoice=voiceMemory.pendingSave.current;
      if(pendingVoice&&!pendingVoice.uid)voiceMemory.stageGuest?.(pendingVoice.session);
    };
    const flush=()=>{
      const memory=conversationMemory.current,version=accountVersion.current;
      if(auth.currentUser?.uid!==memory.uid)return;
      try{stage();}catch{setNotice('Não foi possível guardar a última conversa neste aparelho. Não atualize antes de tentar novamente.');}
      void flushActiveConversation().catch(()=>{if(version===accountVersion.current&&memory===conversationMemory.current)setNotice('A última conversa ainda não foi salva. Tente novamente antes de atualizar.');});
    };
    const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      const memory=conversationMemory.current;
      let failed=false;try{stage();}catch{failed=true;}
      const unavailableHistory=!memory.historyReady&&conversationMessages.current.some(message=>message.role==='user');
      const voiceMemory=voiceConversationMemory.current;
      const unavailableVoiceHistory=!voiceMemory.historyReady&&voiceMemory.messages.length>0;
      if(failed||unavailableHistory||unavailableVoiceHistory||memory.draft.text.trim()||memory.draft.image||conversationActivity.current.loading||(memory.uid&&memory.pendingSave.current)||(voiceMemory.uid&&voiceMemory.pendingSave.current)){event.preventDefault();event.returnValue='';}
    };
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);window.addEventListener('beforeunload',beforeUnload);
    return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('beforeunload',beforeUnload);};
  },[]);

  useEffect(()=>{
    let disposed=false;let stopProfile:(()=>void)|undefined;
    const unsubscribe=onAuthStateChanged(auth,async user=>{
      const version=++accountVersion.current;profileCacheBlocked.current=false;stopProfile?.();stopProfile=undefined;setUserRole('infantil');setInitialMission(null);
      const isCurrent=()=>!disposed&&version===accountVersion.current&&auth.currentUser?.uid===user?.uid;
      chatAbortRef.current?.abort(); sendingRef.current=false;chatAbortRef.current=null;
      stopSpeaking();setIsSpeaking(false);setIsLoading(false);setChatMode('text');
      setIsProfileModalOpen(false);setIsScenarioAnalyzerOpen(false);setIsDynamicQuizOpen(false);setIsDailyMissionOpen(false);
      setProfileError('');setProfileReady(false);setCurrentUser(user);setStarsScore(0);setBadges(INITIAL_BADGES);setNickname('Super Protetor');setAvatarGender('female');setActiveTab('home');handleResetChat(true);
      if(user){
        setIsGuest(false);localStorage.setItem('dc_is_guest','false');setIsWelcomeOpen(false);
        try{
          const [{fetchOrCreateUserProfile},{db,doc,getDoc,onSnapshot}]=await Promise.all([import('./lib/salaSeguraService'),import('./lib/firebase')]);
          if(!isCurrent())return;
          await fetchOrCreateUserProfile(user.uid,user.email,sessionStorage.getItem('vigia_pending_nickname') || 'Super Protetor');
          if(!isCurrent())return;
          const snapshot=await getDoc(doc(db,'users',user.uid));
          if(!isCurrent())return;
          if(!snapshot.exists())throw new Error('Perfil indisponível.');
          const data=snapshot.data();
          setNickname(data.nickname || 'Super Protetor');setStarsScore(data.starsScore ?? 0);setAvatarGender(data.avatarGender==='male'?'male':'female');
          setBadges(hydrateBadges(data.badges));
          setUserRole(['educador','responsavel'].includes(data.role)?data.role:'infantil');
          setProfileReady(true);
          stopProfile=onSnapshot(doc(db,'users',user.uid),snap=>{if(!isCurrent()||!snap.exists())return;const p=snap.data();setStarsScore(p.starsScore||0);setBadges(hydrateBadges(p.badges));setNickname(p.nickname||'Super Protetor');},()=>{if(isCurrent())setNotice('Não foi possível atualizar seu perfil. Verifique a conexão.');});
        }catch{
          if(!isCurrent())return;
          let restored=false;
          try{const cached=JSON.parse(localStorage.getItem('vigia_progress:'+user.uid)||'null');if(cached){const progress=normalizeProfileProgress(cached);setNickname(progress.nickname);setStarsScore(progress.starsScore);setBadges(progress.badges);setAvatarGender(progress.avatarGender);setProfileReady(true);restored=true;}}catch{}
          if(restored)setNotice('Seu perfil está sem conexão. As atividades salvas continuam disponíveis; o acompanhamento requer conexão.');
          else setProfileError('Não foi possível carregar seu perfil. Verifique a conexão e tente novamente. Seus dados foram preservados.');
        }
      }else{
        try{const progress=normalizeProfileProgress(JSON.parse(localStorage.getItem('vigia_progress:guest') || '{}'));setNickname(progress.nickname);setStarsScore(progress.starsScore);setBadges(progress.badges);setAvatarGender(progress.avatarGender);}catch{profileCacheBlocked.current=true;setNotice('O perfil salvo neste aparelho precisa de revisão. O registro anterior foi preservado; as atividades continuam disponíveis.');}
        setProfileReady(true);setIsWelcomeOpen(localStorage.getItem('dc_is_guest')!=='true');
      }
    });
    return ()=>{disposed=true;++accountVersion.current;chatAbortRef.current?.abort();stopProfile?.();unsubscribe();};
  },[profileRetry]);
  useEffect(()=>{
    if(!profileReady||profileCacheBlocked.current)return;
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
    const version=accountVersion.current,uid=auth.currentUser?.uid;
    try {
      await prepareAccountChange('sair da conta');
      await signOut(auth);
    } catch(error) { if(version===accountVersion.current&&auth.currentUser?.uid===uid)setNotice(error instanceof Error?error.message:'Não foi possível salvar antes de sair. Sua conta continua aberta; tente novamente.'); return; }
    if(auth.currentUser)return;
    setIsGuest(false);
    localStorage.removeItem('dc_is_guest');
    setIsProfileModalOpen(false);
    setIsWelcomeOpen(true);
  };

  const handleResetProgress = async () => {
    if(renderedAccountVersion!==accountVersion.current)return;
    const version=accountVersion.current;
    const uid=currentUser?.uid;
    const isCurrent=()=>version===accountVersion.current&&auth.currentUser?.uid===uid;
    if(!isCurrent())return;
    try {
      if(uid){
        const {db,doc,updateDoc}=await import('./lib/firebase');
        if(!isCurrent())return;
        await updateDoc(doc(db,'users',uid),{starsScore:0,badges:[],updatedAt:new Date().toISOString()});
      }
      else localStorage.setItem('vigia_progress:guest',JSON.stringify({starsScore:0,badges:INITIAL_BADGES,nickname,avatarGender}));
      if(!isCurrent())return;
      profileCacheBlocked.current=false;
      setStarsScore(0);setBadges(INITIAL_BADGES);
    }catch{if(isCurrent())setNotice('Não foi possível reiniciar o progresso. Seus dados anteriores foram preservados.');}
  };
  const handleAccountDeleted = async (deletedUid:string) => {
    try{
      await finishDeletedAccountSession(deletedUid,{
        currentUid:()=>auth.currentUser?.uid,
        isCurrent:()=>renderedAccountVersion===accountVersion.current,
        stopActivity:()=>{const memory=conversationMemory.current;memory.stopAudio?.();memory.historyReady=false;memory.pendingSave.current=null;chatAbortRef.current?.abort();stopSpeaking();setIsSpeaking(false);setChatMode('text');},
        signOut:()=>signOut(auth),
        onSignedOut:()=>{setIsGuest(false);try{localStorage.removeItem('dc_is_guest');}catch{}setIsProfileModalOpen(false);setIsAuthModalOpen(false);setIsWelcomeOpen(true);},
      });
    }catch(error){if(auth.currentUser?.uid===deletedUid)setNotice(error instanceof Error?error.message:'A conta foi excluída, mas não foi possível encerrar a sessão neste aparelho. Tente novamente.');}
  };
  const handleUpdateNickname = async (newNick:string) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    const version=accountVersion.current;
    const uid=currentUser?.uid;
    const isCurrent=()=>version===accountVersion.current&&auth.currentUser?.uid===uid;
    if(!isCurrent())return;
    try {
      if(uid){
        const {db,doc,updateDoc}=await import('./lib/firebase');
        if(!isCurrent())return;
        await updateDoc(doc(db,'users',uid),{nickname:newNick.slice(0,80),updatedAt:new Date().toISOString()});
      }
      if(!isCurrent())return;
      setNickname(newNick.slice(0,80));
    }catch{if(isCurrent())setNotice('Não foi possível salvar o apelido. Verifique a conexão.');}
  };

  const handleAddStars = (points: number) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    if(currentUser?.uid!==auth.currentUser?.uid)return;
    setStarsScore((prev) => prev + points);
    const uid=currentUser?.uid,version=accountVersion.current;
    const isCurrent=()=>version===accountVersion.current&&auth.currentUser?.uid===uid;
    if(uid)void import('./lib/firebase').then(async({db,doc,updateDoc,increment})=>{if(!isCurrent())return;await updateDoc(doc(db,'users',uid),{starsScore:increment(points),updatedAt:new Date().toISOString()});}).catch(()=>{if(isCurrent())setNotice('Pontos ainda não sincronizados. Verifique a conexão.');});
  };

  const handleUnlockBadge = (badgeId: string) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    if(currentUser?.uid!==auth.currentUser?.uid)return;
    const uid=currentUser?.uid,version=accountVersion.current;
    const isCurrent=()=>version===accountVersion.current&&auth.currentUser?.uid===uid;
    if(uid)void import('./lib/firebase').then(async({db,doc,updateDoc,arrayUnion})=>{if(!isCurrent())return;await updateDoc(doc(db,'users',uid),{badges:arrayUnion(badgeId)});}).catch(()=>{if(isCurrent())setNotice('Conquista ainda não sincronizada.');});
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
    if(!text.trim())return;
    setIsAudioMuted(false);
    const account=accountVersion.current,conversation=conversationVersion.current;
    const current=()=>account===accountVersion.current&&conversation===conversationVersion.current;
    speakText(
      text,
      () => {
        if(!current())return;
        const vs = performance.now();
        setIsSpeaking(true);
        setDebugInfo((prev) => ({
          ...prev,
          voiceStartTimestamp: vs,
          duration_response_to_voiceStart: prev.responseTimestamp ? Math.round(vs - (prev.responseTimestamp as number)) : null,
        }));
      },
      () => {
        if(!current())return;
        setIsSpeaking(false);
        setAvatarState((prev) => (prev === 'speaking' || prev === 'explaining' ? 'idle' : prev));
      }
    );
  };

  const handleSendMessage = async (
    text: string,
    image?: { data: string; mimeType: string }
  ):Promise<boolean> => {
    if(renderedAccountVersion!==accountVersion.current || renderedConversationVersion!==conversationVersion.current)return false;
    if ((!text.trim() && !image) || sendingRef.current || !profileReady) return false;
    if(messages.length>198){setNotice('Esta conversa atingiu o limite. Abra uma nova conversa; seu histórico está preservado.');return false;}
    if(text.length>4000){setNotice('Escreva uma mensagem de até 4.000 caracteres. Seu rascunho foi preservado.');return false;}

    const version=accountVersion.current;
    const conversation=conversationVersion.current;
    const isCurrent=()=>version===accountVersion.current&&conversation===conversationVersion.current&&chatAbortRef.current===controller;
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
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},90000);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text || (image ? 'Análise de Imagem' : ''),
      timestamp: new Date(),
      imageUrl: image ? `data:${image.mimeType};base64,${image.data}` : undefined,
    };

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
    const assistantMsgId = crypto.randomUUID();
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

      if(!isCurrent()||controller.signal.aborted)return false;

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
      if(controller.signal.aborted || !isCurrent())return false;
      if(typeof data.reply!=='string'||!data.reply.trim()||data.status==='unavailable')throw Error(data.error||'A resposta está indisponível. Tente novamente.');
      if(data.status!=='emergency'&&data.status!=='blocked'){handleUnlockBadge('b_chat');handleAddStars(5);}
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: data.reply || 'Tive um pequeno contratempo para processar essa resposta.',
                emotion: (data.avatarState as AvatarState) || 'speaking',
                emergencyTip: typeof data.emergencyTip==='string' && data.emergencyTip.trim() ? data.emergencyTip : undefined,
                challengeOrQuestion: typeof data.challengeOrQuestion==='string' && data.challengeOrQuestion.trim() ? data.challengeOrQuestion : undefined,
                interactiveOptions: Array.isArray(data.interactiveOptions) ? data.interactiveOptions.filter((value:unknown)=>typeof value==='string').slice(0,6) : undefined,
                suggestedFollowUps: Array.isArray(data.suggestedFollowUps) ? data.suggestedFollowUps.filter((value:unknown)=>typeof value==='string').slice(0,6) : undefined,
              }
            : m
        )
      );

      if (data.avatarState) setAvatarState(data.avatarState as AvatarState);

      // Record approximate avatar render time
      requestAnimationFrame(() => {
        if(version!==accountVersion.current||conversation!==conversationVersion.current)return;
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
      return true;
    } catch (error: any) {
      if(!isCurrent())return false;
      if (!timedOut && error && error.name === 'AbortError') {
        setDebugInfo((prev) => ({ ...prev, apiStatus: 'Requisição abortada' }));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: 'Requisição cancelada pelo usuário.' } : m))
        );
      } else {
        console.error('Erro no streaming de chat:', error);
        const errorMsg = timedOut?'A resposta demorou demais. Verifique a conexão e tente novamente.':String(error?.message || error);
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
      return false;
    } finally {
      clearTimeout(timeout);
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
    const previous=conversationMemory.current;
    if(force){voiceConversationMemory.current.stopAudio?.();voiceConversationMemory.current=createVoiceConversationMemory(auth.currentUser?.uid);setVoiceMessages([]);}
    conversationMemory.current=createConversationMemory(auth.currentUser?.uid);
    conversationMemory.current.historyReady=!force&&previous.uid===auth.currentUser?.uid&&previous.historyReady;
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
  const handleResetVoice=()=>{
    if(renderedAccountVersion!==accountVersion.current)return;
    const previous=voiceConversationMemory.current;
    previous.stopAudio?.();
    const next=createVoiceConversationMemory(auth.currentUser?.uid);
    next.historyReady=previous.historyReady;
    voiceConversationMemory.current=next;setVoiceMessages([]);
  };

  const handleLoadSession = (sessionMessages: ChatMessage[],metadata?:ConversationMetadata,updatedAt?:string) => {
    if(renderedAccountVersion!==accountVersion.current)return;
    ++conversationVersion.current;
    const previous=conversationMemory.current,next=createConversationMemory(auth.currentUser?.uid);
    next.historyReady=previous.historyReady;next.metadata.current=metadata||null;next.restoredMessages.current=sessionMessages;
    next.updatedAt=Date.parse(updatedAt||'')||0;next.draft=previous.draft;conversationMemory.current=next;
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
    <AvatarGenderContext.Provider value={avatarGender}><div data-section={activeTab} className={`vigia-app text-slate-900 font-sans flex flex-col antialiased transition-colors duration-500 ease-in-out px-safe ${
      activeTab === 'chat' ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh'
    }`}>
      {demo && <div role="status" className="bg-amber-100 text-amber-950 px-3 py-2 text-xs text-center font-bold">{localDemo?'DEMONSTRAÇÃO LOCAL • contas fictícias':'PRÉVIA ONLINE • use apenas dados fictícios'} • respostas da IA simuladas • voz ao vivo indisponível</div>}
      {aiTest&&<div role="status" className="bg-indigo-100 text-indigo-950 px-3 py-2 text-xs text-center font-bold">TESTE LOCAL DE IA REAL • exclusivo para adultos • somente dados fictícios • voz gerada por IA{aiBlocked?' • '+aiBlocked:''}</div>}
      {aiLocal&&<div role="status" className="bg-emerald-100 text-emerald-950 px-3 py-2 text-xs text-center font-bold">IA GRATUITA LOCAL • respostas reais • dados fictícios • supervisão de um adulto{aiBlocked?' • '+aiBlocked:''}</div>}
      {notice && <div role="alert" className="bg-rose-100 text-rose-900 p-3 text-sm">{notice} <button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
      {/* Header Navigation */}
      <Navbar
        activeTab={activeTab}
        onPrepareTab={tab=>{if(tab==='chat')void loadChatTab().catch(()=>{});}}
        setActiveTab={tab=>{if(tab==='learn')setInitialMission(null);setActiveTab(tab);}}
        starsScore={starsScore}
        unlockedBadgesCount={unlockedBadgesCount}
        totalBadgesCount={badges.length}
        onOpenBadges={() => setIsBadgesModalOpen(true)}
        onOpenDailyMission={() => setIsDailyMissionOpen(true)}
        onOpenScenarioAnalyzer={() => setIsScenarioAnalyzerOpen(true)}
        onOpenDynamicQuiz={() => setIsDynamicQuizOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenAuth={() => void openAuthSafely()}
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

      <PWAPrompt visible={activeTab==='phones'} onBeforeUpdate={prepareUpdate}/>
      {!profileReady && (profileError?<div role="alert" className="p-4 text-center"><p>{profileError}</p><button className="vigia-primary" onClick={()=>{setProfileError('');setProfileRetry(value=>value+1);}}>Tentar carregar perfil novamente</button></div>:<div role="status" className="p-4 text-center">Carregando seu perfil com segurança…</div>)}
      {/* Main View Area */}
      <main className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <FeatureBoundary key={activeTab+':'+(currentUser?.uid||'guest')} onReset={()=>setActiveTab('home')} onReload={prepareUpdate}><AnimatePresence mode="wait">
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
              <React.Suspense fallback={<div role="status" className="learn-shell">Preparando sua conversa com a Vigia…</div>}>
              <ChatTab
                conversationMemory={conversationMemory.current}
                voiceConversationMemory={voiceConversationMemory.current}
                voiceMessages={voiceMessages}
                onResetVoice={handleResetVoice}
                onHistoryError={message=>{if(renderedAccountVersion===accountVersion.current&&auth.currentUser?.uid===currentUser?.uid)setNotice(message);}}
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                avatarState={avatarState}
                isSpeaking={isSpeaking}
                onReplayAudio={speakMessage}
                onReadDevice={readAloud}
                onReadLocalDevice={readLocalAloud}
                onDeviceSpeechConsent={allowDeviceSpeech}
                onSelectPrompt={handleSelectPrompt}
                onResetChat={handleResetChat}
                onLoadSession={handleLoadSession}
                isAudioMuted={isAudioMuted}
                debugInfo={debugInfo}
                currentUser={currentUser}
                isGuest={isGuest}
                onChatModeChange={mode=>{if(renderedAccountVersion===accountVersion.current&&auth.currentUser?.uid===currentUser?.uid)setChatMode(mode);}}
                onVoiceTurn={(input,reply)=>{if(renderedAccountVersion!==accountVersion.current||renderedVoiceMemory!==voiceConversationMemory.current)return;appendVoiceConversationTurn(renderedVoiceMemory,input,reply);setVoiceMessages(renderedVoiceMemory.messages);}}
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
              </React.Suspense>
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
                  onOpenAuth={() => void openAuthSafely()}
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
      <DeferredModal open={isBadgesModalOpen} label="Preparando suas conquistas…" onClose={()=>setIsBadgesModalOpen(false)} onReload={prepareUpdate}>
      <BadgesModal
        isOpen={isBadgesModalOpen}
        onClose={() => setIsBadgesModalOpen(false)}
        badges={badges}
        starsScore={starsScore}
      />
      </DeferredModal>

      {/* Daily Mission Modal */}
      <DeferredModal key={'daily:'+(currentUser?.uid||'guest')} open={isDailyMissionOpen} label="Preparando a missão do dia…" onClose={()=>setIsDailyMissionOpen(false)} onReload={prepareUpdate}>
      <DailyMissionModal onReward={rewardActivity} key={'daily:'+(currentUser?.uid || 'guest')}
        isOpen={isDailyMissionOpen}
        onClose={() => setIsDailyMissionOpen(false)}
        onAddStars={handleAddStars}
        onUnlockBadge={handleUnlockBadge}
        starsScore={starsScore}
      />
      </DeferredModal>

      {/* AI Scenario Risk Analyzer Modal */}
      <DeferredModal key={'scenario:'+(currentUser?.uid||'guest')} open={isScenarioAnalyzerOpen} label="Preparando a análise de cenário…" onClose={()=>setIsScenarioAnalyzerOpen(false)} onReload={prepareUpdate}>
      <ScenarioAnalyzerModal onReward={rewardActivity} key={'scenario:'+(currentUser?.uid || 'guest')}
        isOpen={isScenarioAnalyzerOpen}
        onClose={() => setIsScenarioAnalyzerOpen(false)}
        onAddStars={handleAddStars}
        onSpeak={speakMessage}
      />
      </DeferredModal>

      {/* AI Dynamic Quiz Generator Modal */}
      <DeferredModal key={'quiz:'+(currentUser?.uid||'guest')} open={isDynamicQuizOpen} label="Preparando o desafio…" onClose={()=>setIsDynamicQuizOpen(false)} onReload={prepareUpdate}>
      <DynamicAIQuizModal onReward={rewardActivity} key={'quiz:'+(currentUser?.uid || 'guest')}
        isOpen={isDynamicQuizOpen}
        onClose={() => setIsDynamicQuizOpen(false)}
        onAddStars={handleAddStars}
        onSpeak={speakMessage}
      />
      </DeferredModal>

      {/* Professional Welcome Screen */}
      {isWelcomeOpen && (
        <WelcomeScreen
          avatarGender={avatarGender}
          onSelectGender={setAvatarGender}
          onStart={() => void openAuthSafely()}
          onLoginClick={() => void openAuthSafely()}
          onContinueAsGuest={handleContinueAsGuest}
        />
      )}

      {/* Authentication Modal */}
      <DeferredModal open={isAuthModalOpen} label="Preparando o acesso à sua conta…" onClose={()=>setIsAuthModalOpen(false)} onReload={prepareUpdate}>
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onContinueAsGuest={handleContinueAsGuest}
        onOpenLegal={(type) => setLegalModalType(type)}
      />
      </DeferredModal>

      {/* User Profile & Progress Modal */}
      <DeferredModal key={'profile:'+(currentUser?.uid||'guest')} open={isProfileModalOpen} label="Preparando seu perfil…" onClose={()=>setIsProfileModalOpen(false)} onReload={prepareUpdate}>
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
        onAccountDeleted={handleAccountDeleted}
        onResetProgress={handleResetProgress}
        onOpenBadges={()=>{setIsProfileModalOpen(false);setIsBadgesModalOpen(true);}}
      />
      </DeferredModal>

      {/* Terms and Privacy Legal Modals */}
      <DeferredModal open={!!legalModalType} label="Preparando as informações…" onClose={()=>setLegalModalType(null)} onReload={prepareUpdate}>
      <LegalModals
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />
      </DeferredModal>

      {/* PWA Components */}
      <RewardCelebration key={'reward:'+(currentUser?.uid||'guest')} uid={currentUser?.uid}/>
      <OfflineWarning />
    </div></AvatarGenderContext.Provider></MotionConfig>
  );
}
