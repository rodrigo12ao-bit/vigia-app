import { apiFetch } from '../lib/api';
import { prepareImage } from '../lib/images';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Video,
  PhoneOff,
  Subtitles,
  CloudRain,
  Zap,
  Briefcase,
  Flame,
  PhoneCall,
  ShieldAlert,
  Shield,
  Bug,
  Copy,
  Check,
  X,
  Plus,
  History,
  Trash2,
  Edit2,
  Search,
  ChevronDown,
  Lightbulb,
  ArrowDown,
  Wifi,
  WifiOff,
  User as UserIcon,
  Camera,
  Image as ImageIcon,
  Brain,
} from 'lucide-react';
import { ChatMessage, ChatSession, AvatarState, DebugInfo } from '../types';
import { Avatar } from './Avatar';
import {
  SpeechRecognizer,
  VoiceActivityDetector,
  AudioRecorder,
  isSpeechRecognitionSupported,
  stopSpeaking,
  type DeviceSpeechCallbacks,
  type DeviceSpeechHandle,
} from '../utils/speech';
import { GeminiLiveSession } from '../utils/geminiLive';
import {getAiAccess,getAiStatus} from '../lib/api';
import {recordingToWave} from '../utils/audioWave';
import {auth} from '../lib/firebaseAuth';
import {createConversationMemory,queueConversationSnapshot,mergeSavedSession,type ConversationMemory,type ConversationMetadata} from '../lib/conversationState';
import {
  loadSessions,
  saveSession,
  deleteSession,
  deleteAllSessions,
  renameSession,
  stageGuestSession,
} from '../lib/chatHistoryService';

const publishedBuild=import.meta.env.MODE==='publication';
const voiceUnavailable='Voz e microfone indisponíveis nesta prévia. Você pode escrever ou enviar uma imagem.';
const conversationLimitMessage='Esta conversa atingiu o limite. Abra um novo chat; seu histórico foi preservado.';

export type ConversationState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'USER_SPEAKING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR';

interface ChatTabProps {
  messages: ChatMessage[];
  onSendMessage: (
    text: string,
    image?: { data: string; mimeType: string }
  ) => void;
  isLoading: boolean;
  avatarState: AvatarState;
  isSpeaking: boolean;
  onReplayAudio: (text: string) => void;
  onReadDevice?: (text: string, callbacks?: DeviceSpeechCallbacks) => DeviceSpeechHandle | null;
  onDeviceSpeechConsent?: () => boolean;
  onSelectPrompt: (prompt: string) => void;
  onResetChat?: () => void;
  onLoadSession?: (messages: ChatMessage[],metadata?:ConversationMetadata,updatedAt?:string) => void;
  conversationMemory?:ConversationMemory;
  onHistoryError?:(message:string)=>void;
  onChatModeChange?: (mode: 'text' | 'live') => void;
  onVoiceTurn?: (input:string,reply:string)=>void;
  isAudioMuted?: boolean;
  onToggleAudioMute?: () => void;
  debugInfo?: DebugInfo;
  onSpeechRecognized?: (text: string) => void;
  currentUser?: any;
  isGuest?: boolean;
}

const QUICK_PROMPTS = [
  '🚨 Vigia, estou sozinha e a água está entrando em casa. O que faço?',
  '🌧️ O que fazer se a chuva inundar a rua?',
  '🎒 O que colocar na mochila de emergência?',
  '⚡ Como se proteger de raios em tempestades?',
  '⛰️ Quais são os sinais de perigo nos morros?',
  '🔥 O que fazer se houver fumaça ou fogo?',
  '📞 Quais os telefones de emergência?',
];

const renderTopicGraphic = (topic?: string, contentText: string = '') => {
  const lower = contentText.toLowerCase();
  let selected = topic;

  if (!selected) {
    if (lower.includes('enchente') || lower.includes('água') || lower.includes('alagamento') || lower.includes('chuva')) {
      selected = 'enchentes';
    } else if (lower.includes('raio') || lower.includes('tempestade') || lower.includes('trovão')) {
      selected = 'tempestades';
    } else if (lower.includes('mochila') || lower.includes('kit') || lower.includes('lanterna')) {
      selected = 'mochila';
    } else if (lower.includes('morro') || lower.includes('deslizamento') || lower.includes('lama')) {
      selected = 'deslizamentos';
    } else if (lower.includes('fogo') || lower.includes('fumaça') || lower.includes('incêndio')) {
      selected = 'incendios';
    } else if (lower.includes('199') || lower.includes('193') || lower.includes('telefone') || lower.includes('bombei')) {
      selected = 'numeros';
    } else {
      selected = 'geral';
    }
  }

  switch (selected) {
    case 'enchentes':
      return (
        <div className="bg-gradient-to-br from-blue-950/90 to-sky-900/90 border border-sky-400/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-sky-500/30 rounded-xl text-sky-300 border border-sky-400/40 shrink-0 animate-pulse">
            <CloudRain className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 block">Tema em Destaque</span>
            <p className="text-xs font-bold text-sky-100">Alagamentos e Enchentes</p>
            <p className="text-[10px] text-sky-200/90">Procure lugares altos e seguros!</p>
          </div>
        </div>
      );
    case 'tempestades':
      return (
        <div className="bg-gradient-to-br from-amber-950/90 to-slate-900/90 border border-amber-400/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-amber-500/30 rounded-xl text-amber-300 border border-amber-400/40 shrink-0 animate-bounce">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">Tema em Destaque</span>
            <p className="text-xs font-bold text-amber-100">Tempestades e Raios</p>
            <p className="text-[10px] text-amber-200/90">Fique abrigado longe de árvores!</p>
          </div>
        </div>
      );
    case 'mochila':
      return (
        <div className="bg-gradient-to-br from-orange-950/90 to-slate-900/90 border border-orange-400/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-orange-500/30 rounded-xl text-orange-300 border border-orange-400/40 shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-300 block">Tema em Destaque</span>
            <p className="text-xs font-bold text-orange-100">Mochila de Emergência</p>
            <p className="text-[10px] text-orange-200/90">Água, lanterna, rádio e apito!</p>
          </div>
        </div>
      );
    case 'deslizamentos':
      return (
        <div className="bg-gradient-to-br from-yellow-950/90 to-slate-900/90 border border-yellow-500/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-yellow-500/30 rounded-xl text-yellow-300 border border-yellow-400/40 shrink-0">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-yellow-300 block">Tema em Destaque</span>
            <p className="text-xs font-bold text-yellow-100">Aviso de Morro & Encosta</p>
            <p className="text-[10px] text-yellow-200/90">Sinais de fendas ou estalos: saia já!</p>
          </div>
        </div>
      );
    case 'incendios':
      return (
        <div className="bg-gradient-to-br from-red-950/90 to-slate-900/90 border border-red-500/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-red-500/30 rounded-xl text-red-300 border border-red-400/40 shrink-0 animate-pulse">
            <Flame className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-red-300 block">Tema em Destaque</span>
            <p className="text-xs font-bold text-red-100">Fumaça e Incêndios</p>
            <p className="text-[10px] text-red-200/90">Ande abaixado e saia com o adulto!</p>
          </div>
        </div>
      );
    case 'numeros':
      return (
        <div className="bg-gradient-to-br from-emerald-950/90 to-slate-900/90 border border-emerald-400/40 text-white p-2.5 rounded-2xl flex items-center gap-3 shadow-md max-w-xs backdrop-blur-md">
          <div className="p-2 bg-emerald-500/30 rounded-xl text-emerald-300 border border-emerald-400/40 shrink-0">
            <PhoneCall className="w-4 h-4 text-emerald-300" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block">Números Vitais</span>
            <p className="text-xs font-bold text-emerald-100">199 Defesa Civil | 193 Bombeiros</p>
            <p className="text-[10px] text-emerald-200/90">Peça para um adulto ligar!</p>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export const ChatTab: React.FC<ChatTabProps> = ({
  messages,
  onSendMessage,
  isLoading,
  avatarState,
  isSpeaking,
  onReplayAudio,
  onReadDevice,
  onDeviceSpeechConsent,
  onSelectPrompt,
  onResetChat,
  onLoadSession,
  conversationMemory,
  onHistoryError,
  onChatModeChange,
  onVoiceTurn,
  isAudioMuted = false,
  onToggleAudioMute,
  debugInfo,
  onSpeechRecognized,
  currentUser,
  isGuest = true,
}) => {
  const userId=currentUser?.uid;
  const localMemory=useRef(createConversationMemory(userId));
  const memory=conversationMemory||localMemory.current;
  const memoryRef=useRef(memory);memoryRef.current=memory;
  const componentActive=useRef(true);
  useEffect(()=>{componentActive.current=true;return()=>{componentActive.current=false;};},[]);
  const [onlinePreview,setOnlinePreview]=useState(publishedBuild);
  const [aiConnection,setAiConnection]=useState<'checking'|'ready'|'error'>('checking');
  const [connectionAttempt,setConnectionAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    getAiStatus().then(s=>{if(active){setOnlinePreview(publishedBuild&&s.demo);setAiConnection('ready');}}).catch(()=>{if(active){setAiConnection('error');setSpeechFeedbackMsg('Não foi possível verificar a conexão. Toque em Verificar conexão para tentar novamente.');}});
    return ()=>{active=false;};
  },[connectionAttempt]);
  const [chatMode, setChatMode] = useState<'text' | 'live'>('text');
  const chatModeRef=useRef(chatMode);chatModeRef.current=chatMode;
  const verifyConnection=()=>{
    if(chatModeRef.current==='live'||aiConnection==='checking')return;
    setAiConnection('checking');setSpeechFeedbackMsg(null);setConnectionAttempt(value=>value+1);
  };
  const voiceConnectionReady=()=>{
    if(aiConnection==='ready')return true;
    if(aiConnection==='error')verifyConnection();
    return false;
  };
  const voiceInput=useRef(''),voiceOutput=useRef('');
  const voiceTurnHandler=useRef(onVoiceTurn);voiceTurnHandler.current=onVoiceTurn;
  const voiceAllowed=async()=>{try{const access=await getAiAccess();if(!access.voice){setSpeechFeedbackMsg(access.blocked||voiceUnavailable);return false;}return true;}catch(error){setSpeechFeedbackMsg(error instanceof Error?error.message:'Voz indisponível.');return false;}};
  const voiceStartLock=useRef(false);
  const switchToVoice=async()=>{if(messages.length>=198){setSpeechFeedbackMsg(conversationLimitMessage);return;}if(!voiceConnectionReady())return;if(onlinePreview){setSpeechFeedbackMsg(voiceUnavailable);return;}if(voiceStartLock.current||chatMode==='live')return;voiceStartLock.current=true;if(isAudioMuted)onToggleAudioMute?.();setChatMode('live');};
  useEffect(()=>{voiceStartLock.current=false;},[chatMode]);
  useEffect(()=>onChatModeChange?.(chatMode),[chatMode,onChatModeChange]);
  useEffect(()=>()=>{if(auth.currentUser?.uid===memory.uid)onChatModeChange?.('text');},[memory]);
  const [historyReady,setHistoryReady]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const [historyAttempt,setHistoryAttempt]=useState(0);
  const [historyMutationError,setHistoryMutationError]=useState('');
  const historyMutation=useRef(false);
  const sessionMetadata=memory.metadata;
  const restoredMessages=memory.restoredMessages;
  const pendingSave=memory.pendingSave;
  const switchLock=useRef(false);
  const flushSession=()=>{
    if(memory.flushing)return memory.flushing;
    const current=()=>auth.currentUser?.uid===memory.uid;
    const run=async()=>{while(pendingSave.current){
      if(!current())throw Error('A conta mudou. Reabra o histórico na sua conta.');
      const pending=pendingSave.current;
      if(!pending.uid)stageGuestSession(pending.session);
      await saveSession(pending.session,pending.uid);
      if(!current())throw Error('A conta mudou. Reabra o histórico na sua conta.');
      memory.savedSession=pending.session;
      if(pendingSave.current===pending)pendingSave.current=null;
    }};
    const flushing=run().finally(()=>{if(memory.flushing===flushing)memory.flushing=undefined;});
    memory.flushing=flushing;return flushing;
  };
  memory.flush=flushSession;memory.stageGuest=stageGuestSession;
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [inputText, setInputText] = useState(memory.draft.text);
  const [interactionState, setInteractionState] = useState<ConversationState>('IDLE');
  
  // Derived state from interactionState to preserve JSX backward compatibility
  const isListening = interactionState === 'LISTENING' || interactionState === 'USER_SPEAKING';
  const isSpeakingUser = interactionState === 'USER_SPEAKING';
  
  // Sincronizar props externas (isLoading, isSpeaking) com a máquina de estados
  useEffect(() => {
    // No modo Live, a própria GeminiLiveSession é a única autoridade de estado.
    if (chatMode === 'live') return;
    if (isLoading) {
      setInteractionState('PROCESSING');
    } else if (isSpeaking) {
      setInteractionState('SPEAKING');
    } else if (interactionState === 'PROCESSING' || interactionState === 'SPEAKING') {
      setInteractionState('IDLE');
    }
  }, [chatMode, isLoading, isSpeaking, interactionState]);

  const [micVolume, setMicVolume] = useState(0);
  const [interimSpeech, setInterimSpeech] = useState('');
  const [micPermissionError, setMicPermissionError] = useState(false);
  const [speechFeedbackMsg, setSpeechFeedbackMsg] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showIdeasModal, setShowIdeasModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // History & Session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(memory.metadata.current?.id||null);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    data: string;
    mimeType: string;
    previewUrl: string;
  } | null>(memory.draft.image);
  const selectedImageRef=useRef(selectedImage);selectedImageRef.current=selectedImage;
  const imagePreparation=useRef({generation:0,pending:false});
  const [isPreparingImage,setIsPreparingImage]=useState(false);
  const updateSelectedImage=(image:typeof selectedImage)=>{
    selectedImageRef.current=image;memory.draft.image=image;setSelectedImage(image);
  };
  const cancelImagePreparation=(clearImage=false)=>{
    ++imagePreparation.current.generation;imagePreparation.current.pending=false;setIsPreparingImage(false);
    if(clearImage)updateSelectedImage(null);
  };
  useEffect(()=>{setIsPreparingImage(false);return()=>{++imagePreparation.current.generation;imagePreparation.current.pending=false;};},[memory,userId]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const prevLoadingRef = useRef(isLoading);
  const legacyCaptureVersion=useRef(0);

  const accumulatedTranscriptRef = useRef('');
  const latestFinalRef = useRef('');
  const latestInterimRef = useRef('');
  const latestFullRef = useRef('');
  const silenceBufferTimerRef = useRef<number | null>(null);
  const audioTimeoutRef = useRef<number | null>(null);
  const hasAudioStartedRef = useRef(false);
  const hasSpeechStartedRef = useRef(false);

  const lastSentPromptRef = useRef('');
  const isSendingRef = useRef(false);

  const isManuallyPausedRef = useRef(false);

  const isListeningRef = useRef(isListening);
  const isSpeakingRef = useRef(isSpeaking);
  const isLoadingRef = useRef(isLoading);

  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const [liveSubtitle, setLiveSubtitle] = useState('');
  const [liveCheckedReply,setLiveCheckedReply]=useState('');
  const liveCheckedReplyRef=useRef('');
  const [deviceMode,setDeviceMode]=useState(false);
  const deviceModeRef=useRef(false);
  const [deviceReading,setDeviceReading]=useState(false);
  const liveManualPauseRef=useRef(false);
  const deviceReadVersion=useRef(0);
  const deviceReadingRef=useRef<{id:number;session:GeminiLiveSession;handle:DeviceSpeechHandle|null}|null>(null);
  const deviceReadHandler=useRef(onReadDevice);deviceReadHandler.current=onReadDevice;
  const deviceConsentHandler=useRef(onDeviceSpeechConsent);deviceConsentHandler.current=onDeviceSpeechConsent;
  const audioMutedRef=useRef(!!isAudioMuted);audioMutedRef.current=!!isAudioMuted;
  const [liveAvatarState, setLiveAvatarState] = useState<AvatarState | null>(null);
  const [liveIsSpeaking, setLiveIsSpeaking] = useState(false);
  const [livePaused,setLivePaused]=useState(false);
  const [liveCaptureActive,setLiveCaptureActive]=useState(false);
  const [liveUnavailable,setLiveUnavailable]=useState(false);
  const [liveRetryAt,setLiveRetryAt]=useState(0);
  const [liveRetrySeconds,setLiveRetrySeconds]=useState(0);
  const [liveSessionVersion,setLiveSessionVersion]=useState(0);
  useEffect(()=>liveSessionRef.current?.setMuted(!!isAudioMuted),[isAudioMuted,chatMode]);
  useEffect(()=>{
    const seconds=()=>Math.max(0,Math.ceil((liveRetryAt-Date.now())/1000));
    setLiveRetrySeconds(seconds());
    if(!liveRetryAt)return;
    const timer=window.setInterval(()=>{const remaining=seconds();setLiveRetrySeconds(remaining);if(remaining===0)window.clearInterval(timer);},1000);
    return ()=>window.clearInterval(timer);
  },[liveRetryAt]);

  const currentAvatarState = React.useMemo(() => {
    if (interactionState === 'LISTENING' || interactionState === 'USER_SPEAKING') return 'listening';
    if (interactionState === 'PROCESSING') return 'thinking';
    if (interactionState === 'SPEAKING') return chatMode === 'live' && liveAvatarState ? liveAvatarState : (avatarState || 'speaking');
    if (interactionState === 'CONNECTING') return 'thinking';
    return 'idle';
  }, [interactionState, chatMode, liveAvatarState, avatarState]);
  const currentIsSpeaking = chatMode === 'live' ? liveIsSpeaking : isSpeaking;

  const cancelDeviceReading=(resumeInput=false)=>{
    const active=deviceReadingRef.current;
    if(!active)return false;
    deviceReadingRef.current=null;++deviceReadVersion.current;
    active.handle?.cancel();
    setDeviceReading(false);setLiveIsSpeaking(false);
    if(liveSessionRef.current===active.session){
      liveManualPauseRef.current=!resumeInput;
      active.session.finishDevicePlayback(resumeInput);
      setLivePaused(!resumeInput);
      setInteractionState(resumeInput?'LISTENING':'IDLE');
      setLiveAvatarState(resumeInput?'listening':'idle');
    }
    return true;
  };

  const readWithDevice=(text:string,chooseMode=false)=>{
    const session=liveSessionRef.current,read=deviceReadHandler.current;
    if(!session||!read||!text||text.length>1500||text!==liveCheckedReplyRef.current)return false;
    const resumeOnEnd=chooseMode||!liveManualPauseRef.current;
    cancelDeviceReading(false);
    if(chooseMode)liveManualPauseRef.current=false;
    session.beginDevicePlayback();setLivePaused(true);setMicVolume(0);
    if(!chooseMode&&audioMutedRef.current){
      session.finishDevicePlayback(false);setLiveUnavailable(true);
      setSpeechFeedbackMsg('O som está silenciado. Ative o som para ouvir a resposta no aparelho.');
      return false;
    }
    const active={id:++deviceReadVersion.current,session,handle:null as DeviceSpeechHandle|null};
    deviceReadingRef.current=active;setDeviceReading(true);setInteractionState('PROCESSING');
    let accepted=false;
    let pending:{result:'end'|'error'|'cancel';message?:string}|null=null;
    const current=()=>deviceReadingRef.current===active&&deviceReadVersion.current===active.id&&liveSessionRef.current===session;
    const finish=(result:'end'|'error'|'cancel',message?:string)=>{
      if(!accepted){pending={result,message};return;}
      if(!current())return;
      deviceReadingRef.current=null;
      setDeviceReading(false);setLiveIsSpeaking(false);
      const resume=result==='end'&&resumeOnEnd&&!liveManualPauseRef.current;
      if(result!=='end')liveManualPauseRef.current=true;
      session.finishDevicePlayback(resume);setLivePaused(!resume);
      setInteractionState(resume?'LISTENING':'IDLE');
      setLiveAvatarState(resume?'listening':'idle');
      if(result==='error'){setLiveUnavailable(true);setSpeechFeedbackMsg(message||'A voz do aparelho está indisponível. Sua resposta continua por texto.');}
      else if(result==='cancel')setSpeechFeedbackMsg('Leitura interrompida. O microfone está pausado.');
    };
    const handle=read(text,{
      onStart:()=>{if(current()){setInteractionState('SPEAKING');setLiveIsSpeaking(true);setLiveAvatarState('speaking');}},
      onEnd:()=>finish('end'),onError:message=>finish('error',message),onCancel:()=>finish('cancel'),
    });
    if(!handle){
      if(current()){deviceReadingRef.current=null;++deviceReadVersion.current;setDeviceReading(false);session.finishDevicePlayback(false);setInteractionState('IDLE');setLiveIsSpeaking(false);setLiveAvatarState('idle');}
      return false;
    }
    active.handle=handle;
    if(chooseMode&&!session.setSpeechOutput('device')){cancelDeviceReading(false);setSpeechFeedbackMsg('A sessão de voz foi encerrada. Você pode continuar por texto.');return false;}
    accepted=true;
    deviceModeRef.current=true;setDeviceMode(true);
    setLiveUnavailable(false);setSpeechFeedbackMsg(null);setLiveRetryAt(0);
    if(pending){const result=pending as {result:'end'|'error'|'cancel';message?:string};finish(result.result,result.message);}
    return true;
  };

  const chooseDeviceVoice=()=>{
    const session=liveSessionRef.current;
    if(!session)return;
    session.pauseMicrophone(true);setLivePaused(true);
    // Changing output mode discards any unfinished utterance from the old mode.
    session.interruptPlayback();
    if(!deviceConsentHandler.current?.()){liveManualPauseRef.current=true;return;}
    if(!session.setSpeechOutput('device')){setSpeechFeedbackMsg('A sessão de voz foi encerrada. Você pode continuar por texto.');return;}
    deviceModeRef.current=true;setDeviceMode(true);
    liveManualPauseRef.current=false;
    setLiveRetryAt(0);setLiveUnavailable(false);setSpeechFeedbackMsg(null);
    session.finishDevicePlayback(true);setLivePaused(false);
  };

  useEffect(()=>{if(isAudioMuted)cancelDeviceReading(false);},[isAudioMuted]);

  // Track online network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync ref values
  useEffect(() => {
    isListeningRef.current = isListening;
    isSpeakingRef.current = isSpeaking;
    isLoadingRef.current = isLoading;
  }, [isListening, isSpeaking, isLoading]);

  useEffect(() => {
    let cancelled=false; setHistoryReady(false);setHistoryError('');memoryRef.current.historyReady=false;
    loadSessions(userId).then(list=>{if(cancelled||auth.currentUser?.uid!==userId)return;memoryRef.current.historyReady=true;setSessions(list);setHistoryReady(true);}).catch(()=>{if(!cancelled&&auth.currentUser?.uid===userId)setHistoryError('Histórico indisponível. A gravação está pausada para preservar suas conversas.');});
    return ()=>{cancelled=true;};
  },[userId,historyAttempt]);
  useEffect(()=>{setCurrentSessionId(memory.metadata.current?.id||null);},[memory]);
  useEffect(()=>{memory.draft.text=inputText;memory.draft.image=selectedImage;},[memory,inputText,selectedImage]);
  useEffect(()=>()=>{
    if(auth.currentUser?.uid!==memory.uid)return;
    void flushSession().catch(()=>onHistoryError?.('Não foi possível salvar a última conversa. Ela permanece aberta neste aparelho; tente salvar novamente antes de atualizar.'));
  },[memory]);
  useEffect(()=>{
    if(!historyReady || isLoading || !messages.some(m=>m.role==='user'))return;
    queueConversationSnapshot(memory,messages,isLoading);
    if(memory.metadata.current?.id!==currentSessionId)setCurrentSessionId(memory.metadata.current?.id||null);
    if(!pendingSave.current)return;
    let cancelled=false;
    const timer=setTimeout(()=>{flushSession().then(()=>{if(!cancelled&&memory.savedSession)setSessions(list=>mergeSavedSession(list,memory.savedSession!));}).catch(()=>{if(!cancelled)setSpeechFeedbackMsg('Não foi possível salvar esta conversa. O histórico anterior foi preservado. Verifique a conexão e tente novamente.');});},500);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[historyReady,messages,isLoading,userId,currentSessionId,memory]);

  // Live session management. A limpeza usa a instância local para impedir
  // que o cleanup de uma sessão antiga encerre uma sessão nova.
  useEffect(() => {
    if (chatMode !== 'live' || onlinePreview || aiConnection!=='ready') return;

    stopListening();
    stopSpeaking();
    setLiveSubtitle('');
    setLiveCheckedReply('');
    liveCheckedReplyRef.current='';
    deviceModeRef.current=false;setDeviceMode(false);setDeviceReading(false);
    liveManualPauseRef.current=false;
    setInterimSpeech('');
    setSpeechFeedbackMsg(null);
    setInteractionState('CONNECTING');
    setLivePaused(false);
    setLiveCaptureActive(false);
    setLiveUnavailable(false);
    setLiveRetryAt(0);
    setMicPermissionError(false);

    let disposed = false;
    // A sessão guarda a versão da conta/conversa que a iniciou.
    const saveVoiceTurn=voiceTurnHandler.current;
    const session = new GeminiLiveSession({
      onStateChange: (state) => {
        if (disposed || liveSessionRef.current !== session) return;
        if(deviceReadingRef.current?.session===session&&(state==='idle'||state==='listening'))return;
        switch (state) {
          case 'connecting':
            setInteractionState('CONNECTING');
            break;
          case 'listening':
            setInteractionState('LISTENING');
            setLiveIsSpeaking(false);
            break;
          case 'userSpeaking':
            setInteractionState('USER_SPEAKING');
            setLiveIsSpeaking(false);
            break;
          case 'processing':
            setInteractionState('PROCESSING');
            setLiveIsSpeaking(false);
            break;
          case 'assistantSpeaking':
            setInteractionState('SPEAKING');
            setLiveIsSpeaking(true);
            break;
          case 'error':
            setInteractionState('ERROR');
            setLiveIsSpeaking(false);
            break;
          case 'idle':
            setInteractionState('IDLE');
            setLiveIsSpeaking(false);
            break;
        }
      },
      onAvatarStateChange: (state) => {
        if (disposed || liveSessionRef.current !== session) return;
        setLiveAvatarState(state);
      },
      onInputLevel: (rms) => {
        if (disposed || liveSessionRef.current !== session) return;
        setMicVolume(Math.min(1, rms * 12));
      },
      onMicrophoneActivityChange:active=>{
        if(disposed||liveSessionRef.current!==session)return;
        setLiveCaptureActive(active);if(!active)setMicVolume(0);
      },
      onInputTranscription: (text) => {
        if (disposed || liveSessionRef.current !== session) return;
        cancelDeviceReading(false);
        setInterimSpeech(text);
        setLiveSubtitle('');
        setLiveCheckedReply('');
        liveCheckedReplyRef.current='';
        voiceInput.current=text;voiceOutput.current='';
      },
      onOutputTranscription: (text) => {
        if (disposed || liveSessionRef.current !== session) return;
        setLiveSubtitle((prev) => prev + text);
        voiceOutput.current+=text;
      },
      onTurnComplete:()=>{if(disposed||liveSessionRef.current!==session)return;if(voiceInput.current&&voiceOutput.current){liveCheckedReplyRef.current=voiceOutput.current;setLiveCheckedReply(voiceOutput.current);saveVoiceTurn?.(voiceInput.current,voiceOutput.current);}voiceInput.current='';voiceOutput.current='';},
      onDeviceSpeech:text=>{
        if(disposed||liveSessionRef.current!==session||!deviceModeRef.current)return;
        if(!text||text.length>1500||text!==liveCheckedReplyRef.current||!deviceReadHandler.current){
          session.finishDevicePlayback(false);setLivePaused(true);setLiveUnavailable(true);
          setSpeechFeedbackMsg('A resposta não está pronta para leitura. Você pode continuar por texto.');
          return;
        }
        if(!readWithDevice(text)){session.finishDevicePlayback(false);setLivePaused(true);}
      },
      onInterrupted:()=>{if(disposed||liveSessionRef.current!==session)return;voiceInput.current='';voiceOutput.current='';setInterimSpeech('');setLiveSubtitle(previous=>liveCheckedReplyRef.current===previous?previous:'');},
      onSpeechUnavailable:(message,retryAfterMs)=>{
        if(disposed||liveSessionRef.current!==session)return;
        setSpeechFeedbackMsg(message);
        setLiveUnavailable(true);
        setLivePaused(true);
        setMicPermissionError(false);
        setMicVolume(0);
        setLiveRetryAt(retryAfterMs?Date.now()+retryAfterMs:0);
      },
      onError: (errMsg) => {
        if (disposed || liveSessionRef.current !== session) return;
        cancelDeviceReading(false);
        setSpeechFeedbackMsg(errMsg);
        setLiveUnavailable(true);
        setMicPermissionError(/permissão|microfone/i.test(errMsg));
      },
      onClose: () => {
        if (disposed || liveSessionRef.current !== session) return;
        cancelDeviceReading(false);
        liveSessionRef.current = null;
        setLiveAvatarState(null);
        setLiveIsSpeaking(false);
        setLiveCaptureActive(false);
        setMicVolume(0);
        setInteractionState('IDLE');
      },
    });

    liveSessionRef.current = session;
    session.setMuted(!!isAudioMuted);
    void session.start();

    return () => {
      disposed = true;
      if(deviceReadingRef.current?.session===session)cancelDeviceReading(false);
      session.stop();
      if (liveSessionRef.current === session) liveSessionRef.current = null;
      setMicVolume(0);
    };
  }, [chatMode,userId,liveSessionVersion]);

  // Clean interim speech when response arrives
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      setInterimSpeech('');
      latestFinalRef.current = '';
      latestInterimRef.current = '';
      latestFullRef.current = '';
      accumulatedTranscriptRef.current = '';
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const stopMicStream = () => {
    if (audioRecorderRef.current) {
      try { audioRecorderRef.current.stop(); } catch (e) {}
      audioRecorderRef.current = null;
    }
    if (vadRef.current) {
      try { vadRef.current.stop(); } catch (e) {}
      vadRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.error('Erro ao encerrar faixas de áudio:', e);
      }
      mediaStreamRef.current = null;
    }
  };

  const stopListening = () => {
    ++legacyCaptureVersion.current;
    if (silenceBufferTimerRef.current) {
      window.clearTimeout(silenceBufferTimerRef.current);
      silenceBufferTimerRef.current = null;
    }
    if (audioTimeoutRef.current) {
      window.clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch (e) {
        console.error('Erro ao parar reconhecimento de voz:', e);
      }
    }
    stopMicStream();
    setInteractionState('IDLE');
    setMicVolume(0);
  };

  useEffect(() => {
    if (isSpeechRecognitionSupported()) {
      try {
        recognizerRef.current = new SpeechRecognizer();
      } catch (e) {
        console.error('Erro ao inicializar SpeechRecognizer:', e);
      }
    }
    return () => {
      if (silenceBufferTimerRef.current) {
        window.clearTimeout(silenceBufferTimerRef.current);
      }
      if (audioTimeoutRef.current) {
        window.clearTimeout(audioTimeoutRef.current);
      }
      stopSpeaking();
      stopListening();
    };
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    if (!isUserScrolledUp) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, interimSpeech, isUserScrolledUp]);

  const handleScrollFeed = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    setIsUserScrolledUp(false);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAutoSubmitRecordedSpeech = (rawText: string) => {
    const text = rawText.trim();
    if (isSendingRef.current || isLoadingRef.current) return;

    if (!text || /^[^a-zA-Z0-9áàâãéèêíïóôõöúçÑñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]+$/.test(text)) {
      setSpeechFeedbackMsg('Não consegui ouvir. Pode falar novamente?');
      setTimeout(() => setSpeechFeedbackMsg(null), 3000);
      return;
    }

    if (text.toLowerCase() === lastSentPromptRef.current.toLowerCase()) {
      return;
    }

    isSendingRef.current = true;
    lastSentPromptRef.current = text;
    setSpeechFeedbackMsg(null);

    stopListening();
    onSendMessage(text);

    setTimeout(() => {
      isSendingRef.current = false;
    }, 1000);
  };

  const startListeningWithPermission = async (isRestart = false) => {
    // Live capture belongs exclusively to GeminiLiveSession.
    const legacyMode=()=>chatModeRef.current==='text'&&!liveSessionRef.current;
    if(!legacyMode())return;
    if(messages.length>=198){setSpeechFeedbackMsg(conversationLimitMessage);return;}
    const captureVersion=++legacyCaptureVersion.current;
    const captureCurrent=()=>captureVersion===legacyCaptureVersion.current&&legacyMode();
    if(!voiceConnectionReady()){setShowPermissionPrompt(false);return;}
    if(onlinePreview){setShowPermissionPrompt(false);setSpeechFeedbackMsg(voiceUnavailable);return;}
    if(!await voiceAllowed())return;
    const useProviderTranscription=['adult-synthetic','local-synthetic','adult-gemini'].includes((await getAiStatus()).ai?.mode||'');
    if(!captureCurrent())return;
    // STATE MACHINE BLOCKER
    if (interactionState === 'PROCESSING' || isLoading) {
      console.warn('Cannot start listening while processing');
      return;
    }

    if (isSpeaking) {
      stopSpeaking();
    }

    setMicPermissionError(false);

    latestFinalRef.current = '';
    latestInterimRef.current = '';
    latestFullRef.current = '';
    accumulatedTranscriptRef.current = '';
    setInterimSpeech('');

    if (!isRestart) {
      hasAudioStartedRef.current = false;
      hasSpeechStartedRef.current = false;
    }

    if (audioTimeoutRef.current) {
      window.clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }

    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if(!captureCurrent()){stream.getTracks().forEach(track=>track.stop());return;}
        mediaStreamRef.current = stream;
      }
    } catch (err: any) {
      if(!captureCurrent())return;
      console.error('Erro de permissão no microfone (getUserMedia):', err);
      setMicPermissionError(true);
      setInteractionState('IDLE');
      stopMicStream();
      return;
    }

    if (!stream) {
      setInteractionState('IDLE');
      return;
    }

    hasAudioStartedRef.current = true;
    setInteractionState('LISTENING');

    if (audioRecorderRef.current) {
      try { audioRecorderRef.current.stop(); } catch (e) {}
    }
    const recorder = new AudioRecorder();
    recorder.start(stream);
    audioRecorderRef.current = recorder;

    const vad = new VoiceActivityDetector({
      minVoiceDurationMs: 350,
      silenceDurationMs: 900,
      minVolumeThreshold: 0.02,
    });

    vad.onVolumeChange = (vol) => {
      if(!captureCurrent())return;
      setMicVolume(vol);
    };

    vad.onVoiceStart = () => {
      if(!captureCurrent())return;
      hasSpeechStartedRef.current = true;
      setInteractionState('USER_SPEAKING');
    };

    vad.onSilenceDetected = async () => {
      if(!captureCurrent())return;
      setInteractionState('LISTENING');

      if (!hasSpeechStartedRef.current) return;
      hasSpeechStartedRef.current = false;

      const currentRecorder = audioRecorderRef.current;
      if (!currentRecorder) return;

      let audioBlob = await currentRecorder.stopAndGetBlob();
      if(!captureCurrent())return;
      if(audioBlob&&useProviderTranscription){try{audioBlob=await recordingToWave(audioBlob);}catch(error){setSpeechFeedbackMsg(error instanceof Error?error.message:'Não foi possível preparar o áudio.');stopListening();return;}}
      const audioSize = audioBlob ? audioBlob.size : 0;

      if (audioBlob && audioSize > 100) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          if(!captureCurrent())return;
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            const resp = await apiFetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio, mimeType: audioBlob.type }),
            });
            const data = await resp.json();
            if(!captureCurrent())return;
            if(!resp.ok || data.status==='unavailable'){setSpeechFeedbackMsg('Transcrição indisponível. Use texto e tente mais tarde.');stopListening();return;}
            const text = (data.text || '').trim();

            if (text && text !== 'NO_SPEECH') {
              handleAutoSubmitRecordedSpeech(text);
            } else {
              setSpeechFeedbackMsg('Não consegui ouvir. Pode falar novamente?');
              setTimeout(() => setSpeechFeedbackMsg(null), 3000);

              if (isListeningRef.current && mediaStreamRef.current) {
                const nextRecorder = new AudioRecorder();
                nextRecorder.start(mediaStreamRef.current);
                audioRecorderRef.current = nextRecorder;
              }
            }
          } catch (err: any) {
            if(!captureCurrent())return;
            setSpeechFeedbackMsg('Transcrição indisponível. Verifique a conexão e use texto.');
            setTimeout(() => setSpeechFeedbackMsg(null), 3000);

            if (isListeningRef.current && mediaStreamRef.current) {
              const nextRecorder = new AudioRecorder();
              nextRecorder.start(mediaStreamRef.current);
              audioRecorderRef.current = nextRecorder;
            }
          }
        };
        reader.readAsDataURL(audioBlob);
      } else {
        if (isListeningRef.current && mediaStreamRef.current) {
          const nextRecorder = new AudioRecorder();
          nextRecorder.start(mediaStreamRef.current);
          audioRecorderRef.current = nextRecorder;
        }
      }
    };

    vad.start(stream);
    vadRef.current = vad;

    if (!useProviderTranscription && !recognizerRef.current && isSpeechRecognitionSupported()) {
      try {
        recognizerRef.current = new SpeechRecognizer();
      } catch (e) {
        console.error('Erro ao inicializar SpeechRecognizer:', e);
      }
    }

    if (!useProviderTranscription && isSpeechRecognitionSupported() && recognizerRef.current) {
      audioTimeoutRef.current = window.setTimeout(() => {
        if (!hasAudioStartedRef.current) {
          console.warn('O navegador não entregou áudio ao reconhecimento de voz dentro de 3 segundos.');
        }
      }, 3000);

      recognizerRef.current.start({
        onAudioStart: () => {
          if(!captureCurrent())return;
          hasAudioStartedRef.current = true;
          if (audioTimeoutRef.current) {
            window.clearTimeout(audioTimeoutRef.current);
            audioTimeoutRef.current = null;
          }
        },
        onResult: (data) => {
          if(!captureCurrent())return;
          const { interim, final, full } = data;
          latestInterimRef.current = interim;
          latestFinalRef.current = final;
          latestFullRef.current = full;

          const displaySpeech = full || final || interim;
          accumulatedTranscriptRef.current = displaySpeech;
          setInterimSpeech(displaySpeech);

          if (displaySpeech && displaySpeech.trim().length >= 1) {
            hasSpeechStartedRef.current = true;
            setInteractionState('USER_SPEAKING');
          }
          onSpeechRecognized?.(displaySpeech);

          if (final && final.trim().length >= 1) {
            if (silenceBufferTimerRef.current) {
              window.clearTimeout(silenceBufferTimerRef.current);
            }
            silenceBufferTimerRef.current = window.setTimeout(() => {
              const textToSend = latestFinalRef.current || latestFullRef.current;
              if (textToSend && textToSend.trim().length >= 1) {
                handleAutoSubmitRecordedSpeech(textToSend);
              }
              silenceBufferTimerRef.current = null;
            }, 600);
          }
        },
        onError: (err: any) => {
          const errCode = err?.error || err;
          // Ignore normal non-error events like silence pause or user abort
          if (errCode === 'no-speech' || errCode === 'aborted') {
            return;
          }
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            console.warn('Permissão de microfone negada pelo usuário ou navegador.');
          } else {
            console.warn('Aviso do reconhecimento de voz:', errCode);
          }
        },
        onEnd: () => {},
      });
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(switchLock.current||historyMutation.current)return;
    const generation=++imagePreparation.current.generation;
    imagePreparation.current.pending=true;setIsPreparingImage(true);setSpeechFeedbackMsg(null);
    const current=()=>componentActive.current&&memoryRef.current===memory&&auth.currentUser?.uid===userId&&generation===imagePreparation.current.generation;
    try{
      const image=await prepareImage(file);
      if(current())updateSelectedImage(image);
    }catch(error){if(current())setSpeechFeedbackMsg(error instanceof Error?error.message:'Imagem indisponível.');}
    finally{if(current()){imagePreparation.current.pending=false;setIsPreparingImage(false);}}
  };

  const handleRemoveImage = () => {
    cancelImagePreparation(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(imagePreparation.current.pending||switchLock.current||!componentActive.current||memoryRef.current!==memory||auth.currentUser?.uid!==userId)return;
    const image=selectedImageRef.current;
    if (!inputText.trim() || isLoading || historyMutation.current) return;
    if(messages.length>=198){setSpeechFeedbackMsg(conversationLimitMessage);return;}

    const imageToSend = image
      ? { data: image.data, mimeType: image.mimeType }
      : undefined;

    onSendMessage(inputText.trim(), imageToSend);
    setInputText('');
    cancelImagePreparation(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInterruptSpeech = () => {
    if(chatMode==='live'&&cancelDeviceReading(true)){setSpeechFeedbackMsg(null);return;}
    if(chatMode==='live'){liveSessionRef.current?.interruptPlayback();return;}
    stopSpeaking();
  };

  const toggleMicListening = async () => {
    if(chatMode==='live'){
      if(cancelDeviceReading(false)){setSpeechFeedbackMsg('Microfone pausado. Toque no microfone para continuar.');return;}
      if(liveRetryAt>Date.now())return;
      if(!liveSessionRef.current){setLiveSessionVersion(v=>v+1);return;}
      const next=!livePaused;
      liveManualPauseRef.current=next;
      liveSessionRef.current.pauseMicrophone(next);
      setLivePaused(next);
      if(!next&&liveUnavailable){setLiveUnavailable(false);setSpeechFeedbackMsg(null);setLiveRetryAt(0);}
      return;
    }
    if(messages.length>=198){setSpeechFeedbackMsg(conversationLimitMessage);return;}
    if(!voiceConnectionReady()){setShowPermissionPrompt(false);return;}
    if(onlinePreview){setShowPermissionPrompt(false);setSpeechFeedbackMsg(voiceUnavailable);return;}
    if(!isListening&&!await voiceAllowed())return;
    if (isSpeaking) {
      handleInterruptSpeech();
    }

    if (isListening) {
      isManuallyPausedRef.current = true;
      stopListening();
    } else {
      isManuallyPausedRef.current = false;
      if (!localStorage.getItem('vigia_mic_explained:'+(userId||'guest'))) {
        setShowPermissionPrompt(true);
      } else {
        startListeningWithPermission();
      }
    }
  };

  const handleConfirmMicPermission = () => {
    if(!voiceConnectionReady()){setShowPermissionPrompt(false);return;}
    if(onlinePreview){setShowPermissionPrompt(false);setSpeechFeedbackMsg(voiceUnavailable);return;}
    localStorage.setItem('vigia_mic_explained:'+(userId||'guest'), 'true');
    setShowPermissionPrompt(false);
    startListeningWithPermission();
  };

  const handleCopyMessage = async (text: string, msgId: string) => {
    try{await navigator.clipboard.writeText(text);}catch{setSpeechFeedbackMsg('Não foi possível copiar. Selecione o texto manualmente.');return;}
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Create new chat
  const endLiveConversation=()=>{
    cancelDeviceReading(false);
    const session=liveSessionRef.current;
    liveSessionRef.current=null;
    session?.stop();
    voiceInput.current='';voiceOutput.current='';
    setLiveIsSpeaking(false);setLivePaused(false);setLiveCaptureActive(false);setMicVolume(0);
    setLiveRetryAt(0);setLiveUnavailable(false);setLiveSubtitle('');setLiveCheckedReply('');setInterimSpeech('');
    liveCheckedReplyRef.current='';deviceModeRef.current=false;setDeviceMode(false);setDeviceReading(false);
    if(chatMode==='live')setChatMode('text');
  };
  memory.stopAudio=()=>{endLiveConversation();stopListening();};
  useEffect(()=>{
    if(messages.length<198)return;
    if(chatModeRef.current==='live')endLiveConversation();
    if(isListeningRef.current)stopListening();
    setSpeechFeedbackMsg(conversationLimitMessage);
  },[messages.length]);

  const handleNewChat = async () => {
    if(switchLock.current)return;
    if (inputText.trim()||selectedImageRef.current||imagePreparation.current.pending) {
      if (!window.confirm('Você tem uma mensagem não enviada. Deseja iniciar um novo chat mesmo assim?')) {
        return;
      }
    }
    if(isLoading)return;
    cancelImagePreparation();
    endLiveConversation();
    switchLock.current=true;try{await flushSession();}catch{setSpeechFeedbackMsg('Não foi possível salvar. A conversa atual permanece aberta.');return;}finally{switchLock.current=false;}
    restoredMessages.current=null; sessionMetadata.current=null;
    onResetChat?.();
    setCurrentSessionId(null);
    setInputText('');
    updateSelectedImage(null);
    setShowHistoryDrawer(false);
  };

  // Switch to a chat session
  const handleSelectSession = async (session: ChatSession) => {
    if(isLoading || switchLock.current)return;
    if((inputText.trim()||selectedImageRef.current||imagePreparation.current.pending)&&!window.confirm('Há uma mensagem não enviada. Deseja abrir outra conversa? O texto digitado será preservado; imagens serão removidas após a troca.'))return;
    cancelImagePreparation();
    endLiveConversation();
    switchLock.current=true;try{await flushSession();}catch{setSpeechFeedbackMsg('Não foi possível salvar. A conversa atual permanece aberta.');return;}finally{switchLock.current=false;}
    restoredMessages.current=session.messages;
    sessionMetadata.current={id:session.id,title:session.title,createdAt:session.createdAt};
    onLoadSession?.(session.messages,sessionMetadata.current,session.updatedAt);
    setCurrentSessionId(session.id);
    updateSelectedImage(null);
    setShowHistoryDrawer(false);
  };

  // Confirm and delete session
  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete || isLoading || historyMutation.current) return;
    const target=sessionToDelete,current=()=>componentActive.current&&memoryRef.current===memory&&auth.currentUser?.uid===userId;
    historyMutation.current=true;setHistoryMutationError('');
    try{
      endLiveConversation();stopListening();await flushSession();if(!current())return;
      await deleteSession(target.id,userId);if(!current())return;
      const updated=sessions.filter(session=>session.id!==target.id);setSessions(updated);
      if(pendingSave.current?.session.id===target.id)pendingSave.current=null;
      if(currentSessionId===target.id){
        if(updated.length)await handleSelectSession(updated[0]);
        else {cancelImagePreparation(true);restoredMessages.current=null;sessionMetadata.current=null;onResetChat?.();setCurrentSessionId(null);}
      }
      setSessionToDelete(null);
    }catch{if(current())setHistoryMutationError('Não foi possível apagar esta conversa. A conversa aberta foi preservada. Tente novamente.');}
    finally{historyMutation.current=false;}
  };

  // Delete all sessions
  const handleConfirmDeleteAll = async () => {
    if(isLoading||historyMutation.current)return;
    const current=()=>componentActive.current&&memoryRef.current===memory&&auth.currentUser?.uid===userId;
    historyMutation.current=true;setHistoryMutationError('');
    try{
      endLiveConversation();stopListening();await flushSession();if(!current())return;
      await deleteAllSessions(userId);if(!current())return;
      cancelImagePreparation(true);
      pendingSave.current=null;setSessions([]);restoredMessages.current=null;sessionMetadata.current=null;onResetChat?.();setCurrentSessionId(null);
      setIsConfirmDeleteAllOpen(false);setShowHistoryDrawer(false);
    }catch{if(current())setHistoryMutationError('Não foi possível concluir a exclusão. As conversas restantes e a conversa aberta foram preservadas. Tente novamente.');}
    finally{historyMutation.current=false;}
  };

  // Rename session
  const handleSaveRename = async (sessionId: string) => {
    if (!editingTitleText.trim() || isLoading || historyMutation.current) return;
    const title=editingTitleText.trim(),current=()=>componentActive.current&&memoryRef.current===memory&&auth.currentUser?.uid===userId;
    historyMutation.current=true;setHistoryMutationError('');
    try{
      endLiveConversation();stopListening();await flushSession();if(!current())return;
      const renamed=await renameSession(sessionId,title,userId);if(!current())return;
      setSessions(list=>mergeSavedSession(list,renamed));
      if(sessionMetadata.current?.id===sessionId)sessionMetadata.current={...sessionMetadata.current,title};
      if(memory.savedSession?.id===sessionId)memory.savedSession=renamed;
      setEditingSessionId(null);setEditingTitleText('');
    }catch{if(current())setHistoryMutationError('Não foi possível renomear. O título anterior e o texto digitado foram preservados. Tente novamente.');}
    finally{historyMutation.current=false;}
  };

  const [isConfirmEndCallOpen, setIsConfirmEndCallOpen] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  // Status Badge Configuration
  const getAvatarStatusBadge = () => {
    if (!isOnline) {
      return {
        text: 'Sem conexão',
        color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        icon: <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
      };
    }
    if (micPermissionError) {
      return {
        text: 'Erro de áudio',
        color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
      };
    }
    if(chatMode==='live'&&liveUnavailable)return {text:'Voz indisponível',color:'bg-amber-500/20 text-amber-200 border-amber-400/40',icon:<VolumeX className="w-3.5 h-3.5 shrink-0"/>};
    if (interactionState==='CONNECTING')return {text:'Conectando a voz…',color:'bg-violet-500/20 text-violet-200 border-violet-400/40',icon:<Sparkles className="w-3.5 h-3.5 animate-pulse shrink-0"/>};
    if (isLoading||interactionState==='PROCESSING') {
      return {
        text: chatMode==='live'&&liveSubtitle?'Preparando a voz…':'Preparando a resposta…',
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        icon: <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />,
      };
    }
    if (currentIsSpeaking) {
      return {
        text: chatMode==='live'?'Interrompa pelo botão':'A Vigia está falando…',
        color: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
        icon: <Volume2 className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />,
      };
    }
    if(chatMode==='live'&&livePaused)return {
      text:'Microfone pausado',
      color:'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon:<MicOff className="w-3.5 h-3.5 text-amber-400 shrink-0"/>,
    };
    if (isListening) {
      return {
        text: isSpeakingUser ? 'Estou ouvindo...' : 'Pode falar!',
        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
        icon: <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />,
      };
    }
    if (chatMode === 'live' && !isListening) {
      return {
        text: 'Microfone desativado',
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        icon: <MicOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    }
    return {
      text: 'Toque para iniciar',
      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
      icon: <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />,
    };
  };

  const statusBadge = getAvatarStatusBadge();
  const liveMicrophoneActive=chatMode==='live'&&!!liveSessionRef.current&&liveCaptureActive;
  const liveAutomaticPause=chatMode==='live'&&!livePaused&&(interactionState==='PROCESSING'||interactionState==='SPEAKING');
  const liveRetryWaiting=liveRetryAt>Date.now();

  // Filter sessions by search query
  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(historySearchQuery.toLowerCase()))
  );

  // Group sessions by date
  const groupSessionsByDate = (list: ChatSession[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const sevenDaysAgo = today - 7 * 86400000;

    const groups: { [key: string]: ChatSession[] } = {
      Hoje: [],
      Ontem: [],
      'Últimos 7 dias': [],
      'Mais antigas': [],
    };

    list.forEach((s) => {
      const time = new Date(s.updatedAt).getTime();
      if (time >= today) {
        groups['Hoje'].push(s);
      } else if (time >= yesterday) {
        groups['Ontem'].push(s);
      } else if (time >= sevenDaysAgo) {
        groups['Últimos 7 dias'].push(s);
      } else {
        groups['Mais antigas'].push(s);
      }
    });

    return groups;
  };

  const groupedSessions = groupSessionsByDate(filteredSessions);

  return (
    <div className="w-full h-full flex-1 min-h-0 min-w-0 max-w-5xl mx-auto px-1 sm:px-3 py-1 sm:py-2 flex flex-col overflow-hidden">
      {/* QUADRO AZUL PRINCIPAL COMPLETO DE CONVERSA */}
      <div className="w-full h-full flex-1 min-h-0 min-w-0 bg-gradient-to-b from-indigo-950 via-slate-950 to-slate-900 border border-indigo-900/60 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">

        {/* COMPACT HEADER WITH SMALL AVATAR AND CONTROLS */}
        <div className="bg-slate-900/95 border-b border-slate-800 p-2 sm:p-3 flex items-center justify-between gap-1.5 sm:gap-2 z-30 shrink-0 backdrop-blur-md min-w-0 w-full">
          {/* Left: Small Avatar (56-72px) + Status & Title */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            {chatMode === 'text' && (
              <div className="w-10 h-10 sm:w-14 sm:h-14 shrink-0 relative flex items-center justify-center bg-slate-800/80 rounded-2xl border border-indigo-500/30 p-1 shadow-inner overflow-hidden">
                <Avatar
                  state={currentAvatarState}
                  isSpeaking={currentIsSpeaking}
                  isListening={isListening}
                  size="sm"
                  showSubtitle={false}
                />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-xs sm:text-base font-black text-white tracking-wide truncate">Vigia</h2>
                <span className="hidden md:inline-block text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full shrink-0">
                  Defesa Civil
                </span>
              </div>

              {/* Small Status Pill */}
              <div className={`mt-0.5 px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-extrabold flex items-center gap-1 w-fit max-w-full truncate ${statusBadge.color}`}>
                {statusBadge.icon}
                <span className="truncate">{statusBadge.text}</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Mode Switcher Segmented Control */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-0.5 shadow-inner">
              <button
                onClick={endLiveConversation}
                aria-label="Conversa por texto"
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                  chatMode === 'text'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Texto</span>
              </button>
              <button
                onClick={() => void switchToVoice()}
                disabled={aiConnection==='checking'}
                title={aiConnection==='checking'?'Verificando conexão':aiConnection==='error'?'Verificar conexão':onlinePreview?'Voz indisponível nesta prévia':'Conversa por voz'}
                aria-label={aiConnection==='checking'?'Verificando conexão':aiConnection==='error'?'Verificar conexão':onlinePreview?'Voz indisponível nesta prévia':'Conversa por voz'}
                aria-busy={aiConnection==='checking'}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                  chatMode === 'live'
                    ? 'bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {aiConnection==='ready'?<Mic className="w-3.5 h-3.5"/>:<RefreshCw className={`w-3.5 h-3.5 ${aiConnection==='checking'?'animate-spin':''}`}/>}
                <span className="hidden sm:inline">{aiConnection==='checking'?'Verificando conexão':aiConnection==='error'?'Verificar conexão':onlinePreview?'Voz indisponível':'Voz'}</span>
              </button>
            </div>

            {/* Novo Chat Button */}
            <button
              onClick={handleNewChat}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              title="Iniciar uma nova conversa"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span className="hidden md:inline">Novo chat</span>
            </button>

            {/* Conversas / Histórico Drawer Toggle */}
            <button
              onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
              className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                showHistoryDrawer
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Abrir histórico de conversas"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Ideias (Sugestões Opcionais) */}
            <button
              onClick={() => setShowIdeasModal(!showIdeasModal)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
              title="Ver ideias de perguntas"
            >
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="hidden lg:inline">Ideias</span>
            </button>

            {/* Diagnostic Toggle */}
            {import.meta.env.DEV && (<button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="p-2 text-slate-400 hover:text-amber-400 bg-slate-800 rounded-xl border border-slate-700 transition-colors cursor-pointer"
              title="Painel de diagnóstico técnico"
            >
              <Bug className="w-4 h-4" />
            </button>)}
          </div>
        </div>

        {historyError&&<div role="alert" className="px-3 py-2 bg-amber-500/20 text-amber-200 text-xs border-b border-amber-500/30">{historyError} <button className="font-bold underline ml-2" onClick={()=>setHistoryAttempt(value=>value+1)}>Tentar carregar histórico</button></div>}

        {/* TECHNICAL DEBUG MODAL */}
        <AnimatePresence>
          {showDebugPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-slate-950 border-b border-slate-800 p-3 text-white text-xs z-30 shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
                <div className="flex items-center gap-2 font-mono font-bold text-amber-400">
                  <Bug className="w-4 h-4 shrink-0" />
                  <span>Painel de Diagnóstico Técnico</span>
                </div>
                <button onClick={() => setShowDebugPanel(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">🎙️ Transcrição de Voz:</span>
                  <span className="text-emerald-400 font-semibold break-words">
                    {interimSpeech || debugInfo?.lastRecognizedSpeech || 'Aguardando áudio...'}
                  </span>
                </div>

                <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block font-bold">❓ Último Prompt:</span>
                  <span className="text-sky-300 font-semibold break-words">{debugInfo?.lastSentPrompt || 'Nenhum'}</span>
                </div>

                <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 sm:col-span-2">
                  <span className="text-slate-400 block font-bold">💬 Resposta API:</span>
                  <span className="text-slate-200 break-words">{debugInfo?.lastApiResponse || 'Aguardando...'}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* IDEIAS POPUP / MODAL */}
        <AnimatePresence>
          {showIdeasModal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute top-14 right-2 sm:right-4 z-40 bg-slate-900 border border-slate-700 p-3.5 sm:p-4 rounded-2xl shadow-2xl max-w-[calc(100vw-1.5rem)] sm:max-w-xs w-80 text-white"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs">
                  <Lightbulb className="w-4 h-4" />
                  <span>Ideias de perguntas</span>
                </div>
                <button onClick={() => setShowIdeasModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectPrompt(prompt.replace(/^[^\w\s]+/, '').trim());
                      setShowIdeasModal(false);
                    }}
                    className="w-full text-left text-xs font-semibold p-2 rounded-xl bg-slate-800/80 hover:bg-orange-500 hover:text-white text-slate-200 border border-slate-700/60 transition-all cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PERMISSION MODAL */}
        <AnimatePresence>
          {showPermissionPrompt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl border border-slate-200 text-slate-900"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 mx-auto flex items-center justify-center shadow-inner">
                  <Mic className="w-6 h-6" />
                </div>

                <h3 className="font-black text-base text-slate-900">Acesso ao Microfone</h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  A transcrição e a voz seguem a modalidade informada no aviso de consentimento da IA. Com Gemini, a gravação é enviada ao Google e a resposta é gerada por IA. Use somente sua própria fala, sem informações pessoais nem conteúdo de menores. Gravações de mensagem têm até 15 segundos. Na simulação, a voz ao vivo está indisponível.
                </p>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowPermissionPrompt(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl cursor-pointer"
                  >
                    Agora não
                  </button>
                  <button
                    onClick={handleConfirmMicPermission}
                    className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-extrabold text-xs rounded-2xl shadow-md cursor-pointer"
                  >
                    Permitir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* DELETE CONFIRMATION MODAL */}
        <AnimatePresence>
          {sessionToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 text-white shadow-2xl"
              >
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>

                <div className="text-center">
                  <h3 className="font-black text-sm text-white">Apagar esta conversa?</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Essa ação não poderá ser desfeita.</p>
                  {historyMutationError&&<p role="alert" className="text-xs text-amber-200 mt-2">{historyMutationError}</p>}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSessionToDelete(null)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmDeleteSession}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl shadow-md cursor-pointer"
                  >
                    Apagar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* DELETE ALL CONFIRMATION MODAL */}
        <AnimatePresence>
          {isConfirmDeleteAllOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-rose-500/40 rounded-3xl p-5 max-w-sm w-full space-y-4 text-white shadow-2xl"
              >
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>

                <div className="text-center">
                  <h3 className="font-black text-sm text-white">Apagar TODO o histórico?</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Isso apagará permanentemente todas as suas conversas gravadas.
                  </p>
                  {historyMutationError&&<p role="alert" className="text-xs text-amber-200 mt-2">{historyMutationError}</p>}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsConfirmDeleteAllOpen(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmDeleteAll}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md cursor-pointer"
                  >
                    Sim, apagar tudo
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* END CALL CONFIRMATION MODAL */}
        <AnimatePresence>
          {isConfirmEndCallOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 text-white shadow-2xl"
              >
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
                  <PhoneOff className="w-6 h-6" />
                </div>

                <div className="text-center">
                  <h3 className="font-black text-sm text-white">Encerrar a conversa por voz?</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Você voltará ao modo texto. O histórico da conversa continua salvo.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsConfirmEndCallOpen(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl cursor-pointer"
                  >
                    Continuar falando
                  </button>
                  <button
                    onClick={() => {
                      stopListening();
                      stopSpeaking();
                      endLiveConversation();
                      setIsConfirmEndCallOpen(false);
                    }}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md cursor-pointer"
                  >
                    Sim, encerrar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MAIN BODY LAYOUT: SIDEBAR (CONVERSAS) + CHAT FEED */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative">

          {/* HISTÓRICO DE CONVERSAS DRAWER / SIDEBAR (ROLO LATERAL) */}
          <AnimatePresence>
            {showHistoryDrawer && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowHistoryDrawer(false)}
                  className="absolute inset-0 bg-black/60 z-20 backdrop-blur-xs cursor-pointer"
                />
                <motion.div
                  initial={{ x: -280, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -280, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] bg-slate-900/98 border-r border-slate-800 p-3.5 flex flex-col justify-between shadow-2xl backdrop-blur-md"
                >
                <div className="space-y-3 overflow-hidden flex flex-col h-full">
                  {/* Header & Storage Indicator */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
                    <div>
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <History className="w-4 h-4 text-indigo-400" />
                        <span>Conversas</span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        {currentUser ? '🔒 Salvo na conta' : '📱 Salvo neste dispositivo'}
                      </p>
                    </div>

                    <button
                      onClick={() => setShowHistoryDrawer(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Buscar conversa..."
                      className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-8 pr-3 py-1.5 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Sessions List Grouped */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {Object.keys(groupedSessions).map((groupKey) => {
                      const groupList = groupedSessions[groupKey];
                      if (groupList.length === 0) return null;

                      return (
                        <div key={groupKey} className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block px-1">
                            {groupKey}
                          </span>

                          {groupList.map((session) => {
                            const isSelected = session.id === currentSessionId;
                            const isEditing = editingSessionId === session.id;

                            return (
                              <div
                                key={session.id}
                                className={`group relative rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 border cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-950/80 border-indigo-500/50 text-white shadow-sm'
                                    : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                                }`}
                                onClick={() => !isEditing && handleSelectSession(session)}
                              >
                                {isEditing ? (
                                  <div className="w-full" onClick={(e) => e.stopPropagation()}><div className="flex items-center gap-1 w-full">
                                    <input
                                      type="text"
                                      value={editingTitleText}
                                      onChange={(e) => setEditingTitleText(e.target.value)}
                                      className="bg-slate-900 border border-indigo-500 text-white text-xs px-2 py-1 rounded-lg w-full focus:outline-none"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSaveRename(session.id)}
                                      className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>{historyMutationError&&<p role="alert" className="text-xs text-amber-200 mt-2">{historyMutationError}</p>}</div>
                                ) : (
                                  <>
                                    <div className="overflow-hidden flex-1">
                                      <button type="button" className="text-xs font-bold truncate leading-snug max-w-full text-left" onClick={e=>{e.stopPropagation();handleSelectSession(session);}}><p>{session.title}</p></button>
                                      {session.lastMessagePreview && (
                                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                          {session.lastMessagePreview}
                                        </p>
                                      )}
                                    </div>

                                    {/* Action icons on hover or active */}
                                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingSessionId(session.id);
                                          setEditingTitleText(session.title);
                                          setHistoryMutationError('');
                                        }}
                                        className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-md"
                                        title="Renomear conversa"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSessionToDelete(session);
                                          setHistoryMutationError('');
                                        }}
                                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md"
                                        title="Apagar conversa"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {filteredSessions.length === 0 && (
                      <div className="text-center py-8 text-slate-500 text-xs">
                        Nenhuma conversa encontrada.
                      </div>
                    )}
                  </div>

                  {/* Delete All Action */}
                  {sessions.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 shrink-0">
                      <button
                        onClick={() => setIsConfirmDeleteAllOpen(true)}
                        className="w-full py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Apagar todas as conversas</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
          </AnimatePresence>

          {chatMode==='live'&&speechFeedbackMsg&&<div className="shrink-0 px-4 py-3 text-sm text-amber-100 bg-amber-900/40 border-b border-amber-500/30">
            <p role="alert">{speechFeedbackMsg}</p>
            {liveUnavailable&&<div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={endLiveConversation} className="px-3 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 cursor-pointer">Continuar por texto</button>
              {onReadDevice&&liveSessionRef.current&&liveCheckedReply&&liveSubtitle===liveCheckedReply&&<button onClick={()=>readWithDevice(liveCheckedReply,true)} className="px-3 py-2 rounded-xl border border-sky-400/50 text-sky-100 font-semibold hover:bg-sky-500/10 cursor-pointer">Usar voz do aparelho</button>}
              <button onClick={()=>void toggleMicListening()} disabled={liveRetryWaiting} className="px-3 py-2 rounded-xl border border-amber-500/50 font-semibold enabled:hover:bg-amber-500/10 enabled:cursor-pointer disabled:opacity-60">{liveRetryWaiting?`Tentar voz em ${liveRetrySeconds||Math.ceil((liveRetryAt-Date.now())/1000)} s`:'Tentar voz novamente'}</button>
              <span className="text-xs text-amber-100/80">{liveSubtitle?'A resposta continua disponível na conversa.':'Você pode continuar escrevendo.'}</span>
            </div>}
          </div>}
          {chatMode === 'live' ? (
            <div className="flex-1 min-h-0 min-w-0 bg-slate-950 flex flex-col relative overflow-hidden">
              {!deviceMode&&onDeviceSpeechConsent&&isListening&&<div className="shrink-0 px-3 py-1.5 flex justify-end">
                <button onClick={chooseDeviceVoice} className="text-xs px-2.5 py-1.5 rounded-lg border border-sky-400/30 text-sky-200 hover:bg-sky-500/10 cursor-pointer">Voz do aparelho</button>
              </div>}
              {deviceMode&&<div role="status" className="shrink-0 px-3 py-2 text-center text-xs text-sky-200 bg-sky-950/40 border-b border-sky-500/20">
                <span className="font-bold">Voz do aparelho</span>{deviceReading?' · Microfone pausado · interrompa pelo botão':''}
              </div>}
              
              {/* ZONA SUPERIOR: FAIXA DE LEGENDAS (Ocupa espaço apenas se ativada) */}
              <AnimatePresence>
                {showSubtitles && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="shrink-0 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md overflow-hidden"
                  >
                    <div className="p-3 sm:p-4 text-center max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60px] sm:min-h-[80px]">
                      <p className="text-[10px] font-black text-amber-500/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Subtitles className="w-3 h-3" /> Transcrição
                      </p>
                      <p className={`text-xs sm:text-sm font-semibold text-slate-200 italic break-words [overflow-wrap:anywhere] ${liveUnavailable?'max-h-40 overflow-y-auto':'line-clamp-3'}`} aria-live="polite">
                        {liveSubtitle || interimSpeech || (interactionState==='CONNECTING'?'Preparando nossa conversa…':liveUnavailable?'A voz está pausada. Você pode continuar por texto.':livePaused?'Microfone pausado. Toque no microfone para continuar.':'Oi! Pode falar. Estou na escuta.')}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ONDAS SONORAS (Abaixo da Legenda, Acima do Avatar) */}
              <div className="shrink-0 flex items-center justify-center pt-4 pb-2 bg-transparent pointer-events-none z-10 min-h-[40px]">
                {(isListening || currentIsSpeaking) && (
                  <div className="flex items-center justify-center gap-1.5 h-6">
                      <motion.span animate={{ height: isListening ? [6, Math.max(10, micVolume * 20), 6] : [6, 14, 6] }} transition={{ repeat: Infinity, duration: 0.4 }} className={`w-1 rounded-full ${currentIsSpeaking ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                      <motion.span animate={{ height: isListening ? [10, Math.max(14, micVolume * 30), 10] : [10, 20, 10] }} transition={{ repeat: Infinity, duration: 0.5 }} className={`w-1 rounded-full ${currentIsSpeaking ? 'bg-sky-300' : 'bg-emerald-300'}`} />
                      <motion.span animate={{ height: isListening ? [14, Math.max(18, micVolume * 40), 14] : [14, 24, 14] }} transition={{ repeat: Infinity, duration: 0.3 }} className={`w-1 rounded-full ${currentIsSpeaking ? 'bg-sky-200' : 'bg-emerald-200'}`} />
                      <motion.span animate={{ height: isListening ? [8, Math.max(12, micVolume * 25), 8] : [8, 16, 8] }} transition={{ repeat: Infinity, duration: 0.6 }} className={`w-1 rounded-full ${currentIsSpeaking ? 'bg-sky-300' : 'bg-emerald-300'}`} />
                      <motion.span animate={{ height: isListening ? [5, Math.max(8, micVolume * 15), 5] : [5, 10, 5] }} transition={{ repeat: Infinity, duration: 0.4 }} className={`w-1 rounded-full ${currentIsSpeaking ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                  </div>
                )}
              </div>

              {/* ZONA CENTRAL: O PALCO DO AVATAR (Livre, Limpo e Expansivo) */}
              <div className="flex-1 min-h-0 relative flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950">
                
                {/* O Avatar ocupa 100% dessa zona livremente */}
                <Avatar
                  state={currentAvatarState}
                  isSpeaking={currentIsSpeaking}
                  isListening={isListening}
                  size="lg"
                  showSubtitle={false}
                />
              </div>

              {/* ZONA INFERIOR: DOCK COMPACTO (Apenas Ícones) */}
              <div className="shrink-0 pb-4 sm:pb-6 px-4 bg-transparent relative z-20 flex justify-center">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-2 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center justify-center gap-2 sm:gap-4 max-w-fit mx-auto">
                  
                  {/* Legendas Toggle */}
                  <button
                    onClick={() => setShowSubtitles(!showSubtitles)}
                    className={`p-3 rounded-full transition-all cursor-pointer flex-shrink-0 ${
                      showSubtitles ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                    title="Ativar/Desativar Legendas"
                    aria-label={showSubtitles?'Ocultar legendas':'Mostrar legendas'}
                    aria-pressed={showSubtitles}
                  >
                    <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  {/* Silenciar Áudio */}
                  {onToggleAudioMute && (
                    <button
                      onClick={onToggleAudioMute}
                      className={`p-3 rounded-full transition-all cursor-pointer flex-shrink-0 ${
                        isAudioMuted ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                      }`}
                      title={isAudioMuted ? 'Áudio Mutado' : 'Silenciar'}
                      aria-label={isAudioMuted?'Ativar som da Vigia':'Silenciar som da Vigia'}
                      aria-pressed={!!isAudioMuted}
                    >
                      {isAudioMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                  )}

                  {/* A captura pode ser pausada mesmo durante a resposta. */}
                  {(currentIsSpeaking||(chatMode==='live'&&interactionState==='PROCESSING')) && (
                    <button
                      onClick={handleInterruptSpeech}
                      className="p-4 sm:p-5 rounded-full shadow-xl transition-all cursor-pointer flex-shrink-0 bg-sky-600 hover:bg-sky-700 text-white animate-pulse shadow-sky-500/30"
                      title="Interromper fala"
                      aria-label="Interromper resposta da Vigia"
                    >
                      <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  )}
                    <button
                      onClick={() => onlinePreview?setSpeechFeedbackMsg(voiceUnavailable):toggleMicListening()}
                      className={`p-4 sm:p-5 rounded-full shadow-xl transition-all cursor-pointer flex-shrink-0 ${
                        liveMicrophoneActive
                          ? `bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30 ${isListening?'animate-pulse':''}`
                          : 'bg-slate-700 hover:bg-slate-600 text-emerald-400 shadow-slate-900/50'
                      }`}
                      disabled={interactionState==='CONNECTING'||liveRetryWaiting}
                      title={deviceReading||liveMicrophoneActive||liveAutomaticPause ? 'Pausar Conversa' : 'Ativar Conversa'}
                      aria-label={interactionState==='CONNECTING'?'Conectando microfone':deviceReading?'Pausar conversa e interromper leitura':liveAutomaticPause?'Manter microfone pausado após resposta':liveMicrophoneActive?'Pausar microfone':liveUnavailable?'Tentar voz novamente':'Ativar microfone'}
                      aria-pressed={liveMicrophoneActive}
                    >
                      {liveMicrophoneActive ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}
                    </button>

                  {/* Painel de Debug */}
                  {import.meta.env.DEV && (<button
                    onClick={() => setShowDebugPanel(!showDebugPanel)}
                    className={`p-3 rounded-full transition-all cursor-pointer flex-shrink-0 ${
                      showDebugPanel ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                    title="Painel Técnico"
                  >
                    <Bug className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>)}

                  {/* Encerrar */}
                  <button
                    onClick={() => setIsConfirmEndCallOpen(true)}
                    className="p-3 rounded-full bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 transition-all cursor-pointer flex-shrink-0"
                    title="Encerrar"
                    aria-label="Encerrar conversa por voz"
                  >
                    <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                </div>
              </div>

            </div>
          ) : (
            /* MODE 1: CHATGPT-STYLE CONTINUOUS FEED */
            <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-slate-950 relative overflow-hidden">

              {/* MESSAGES SCROLL FEED */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScrollFeed}
                className="flex-1 min-h-0 min-w-0 overflow-y-auto p-2.5 sm:p-5 space-y-3.5 shadow-inner select-text"
              >
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-3 max-w-md mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 mx-auto flex items-center justify-center shadow-lg">
                      <Sparkles className="w-6 h-6 text-amber-300" />
                    </div>
                    <h3 className="text-sm font-black text-white">Como a Vigia pode ajudar você hoje?</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Faça uma pergunta sobre prevenção de acidentes, emergências, tempestades ou o que fazer em caso de perigo.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isCopied = copiedMsgId === msg.id;

                    return (
                      <motion.div
                        layout
                        key={msg.id}
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0`}
                      >
                        {/* Header Label & Time */}
                        <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] font-bold text-slate-400">
                          <span className={isUser ? 'text-amber-400 font-extrabold' : 'text-indigo-300 font-extrabold'}>
                            {isUser ? 'Você' : 'Vigia'}
                          </span>
                          <span>•</span>
                          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        {/* Message Content Bubble (Glassmorphism) */}
                        <div
                          className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm leading-relaxed shadow-lg backdrop-blur-md relative break-words [overflow-wrap:anywhere] min-w-0 border ${
                            isUser
                              ? 'bg-gradient-to-br from-orange-500/90 to-amber-600/90 border-amber-400/30 text-white rounded-tr-xs font-medium'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-100 rounded-tl-xs font-medium'
                          }`}
                        >
                          {/* Attached Image Preview in User Message */}
                          {msg.imageUrl && (
                            <div className="mb-2 overflow-hidden rounded-xl border border-white/20 max-w-xs shadow-md">
                              <img
                                src={msg.imageUrl}
                                alt="Foto enviada para análise"
                                className="max-h-52 w-full object-cover"
                              />
                            </div>
                          )}

                          <p className="learning-copy whitespace-pre-line break-words [overflow-wrap:anywhere] min-w-0">{msg.content}</p>

                          {/* Action Buttons for Assistant Message */}
                          {!isUser && (
                            <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-end gap-1.5 text-slate-400">
                              <button
                                onClick={() => onReplayAudio(msg.content)}
                                className="p-1 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Ouvir resposta"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleCopyMessage(msg.content, msg.id)}
                                className="p-1 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Copiar texto"
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}

                {/* Loading Indicator */}
                {isLoading && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start min-w-0">
                    <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-3 sm:p-3.5 rounded-2xl text-xs text-slate-300 flex items-center gap-2 shadow-lg max-w-[90%]">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                      <span className="font-semibold truncate">A Vigia está preparando a resposta...</span>
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Quick Jump to Bottom Button */}
              {isUserScrolledUp && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-20 right-4 z-20 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xl border border-indigo-400 transition-all cursor-pointer"
                  title="Ir para a mensagem mais recente"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              )}

              {/* Realtime Interim Voice Indicator */}
              {isListening && (
                <div className="px-3 py-1.5 bg-emerald-950/90 border-t border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between shrink-0 min-w-0 w-full">
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <Mic className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">{interimSpeech || (isSpeakingUser ? 'Ouvindo...' : 'Pode falar agora!')}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <motion.span animate={{ height: `${Math.max(6, micVolume * 24)}px` }} className="w-1 bg-emerald-400 rounded-full" />
                    <motion.span animate={{ height: `${Math.max(10, micVolume * 36)}px` }} className="w-1 bg-emerald-300 rounded-full" />
                    <motion.span animate={{ height: `${Math.max(6, micVolume * 20)}px` }} className="w-1 bg-emerald-400 rounded-full" />
                  </div>
                </div>
              )}

              {/* Feedback toast */}
              {speechFeedbackMsg && (
                <div className="px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-bold text-center border-t border-amber-500/30 shrink-0 truncate">
                  {speechFeedbackMsg}
                </div>
              )}

              {/* FIXED BOTTOM MESSAGE FIELD */}
              <div className="p-2 sm:p-3 bg-slate-900 border-t border-slate-800 shrink-0 z-20 w-full min-w-0">
                {isPreparingImage&&(
                  <div role="status" aria-live="polite" className="mb-2 max-w-4xl mx-auto flex items-center justify-between gap-2 text-xs text-indigo-200">
                    <span>Preparando imagem… Aguarde antes de enviar.</span>
                    <button type="button" onClick={()=>cancelImagePreparation()} className="underline cursor-pointer" title="Cancelar preparação da imagem">Cancelar</button>
                  </div>
                )}
                {/* Image Preview Area if selected */}
                {selectedImage && (
                  <div className="mb-2 max-w-4xl mx-auto flex items-center gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-700 shrink-0">
                      <img src={selectedImage.previewUrl} alt="Prévia" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 cursor-pointer"
                        title="Remover imagem"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-bold text-slate-200 truncate">Imagem pronta para enviar</p>
                      <p className="text-slate-400 text-[11px]">
                        A IA pode comentar elementos visíveis, mas pode errar e não confirma se um local é seguro.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} aria-busy={isPreparingImage} className="flex items-end gap-1.5 sm:gap-2 max-w-4xl mx-auto w-full min-w-0">
                  {/* Hidden Image Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="hidden"
                  />

                  {/* Camera / Photo Attachment Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-2.5 sm:p-3 rounded-2xl transition-all cursor-pointer shrink-0 border ${
                      selectedImage
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/50'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Anexar imagem para comentar elementos visíveis"
                  >
                    <Camera className="w-5 h-5 text-amber-300" />
                  </button>

                  {/* Expandable Textarea */}
                  <div className="flex-1 min-w-0 bg-slate-950 border border-slate-800 focus-within:border-indigo-500 rounded-2xl p-1.5 sm:p-2 transition-all">
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedImage ? "Descreva ou pergunte algo sobre esta imagem..." : "Converse com a Vigia..."}
                      rows={1}
                      className="w-full bg-transparent text-white text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none resize-none max-h-24 sm:max-h-28 min-h-[36px] min-w-0"
                    />
                  </div>

                  {/* Interrupt Speech or Microphone Action Button */}
                  {isSpeaking ? (
                    <button
                      type="button"
                      onClick={handleInterruptSpeech}
                      className="p-2.5 sm:p-3 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
                      title="Parar áudio da Vigia"
                    >
                      <VolumeX className="w-5 h-5 animate-pulse" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleMicListening}
                      disabled={aiConnection==='checking'}
                      className={`p-2.5 sm:p-3 rounded-2xl font-bold transition-all active:scale-95 cursor-pointer shrink-0 ${
                        isListening
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                      title={aiConnection==='checking'?'Verificando conexão':aiConnection==='error'?'Verificar conexão':onlinePreview?'Microfone indisponível nesta prévia':isListening ? 'Desativar microfone' : 'Falar pelo microfone'}
                      aria-label={aiConnection==='checking'?'Verificando conexão':aiConnection==='error'?'Verificar conexão':onlinePreview?'Microfone indisponível nesta prévia':isListening ? 'Desativar microfone' : 'Falar pelo microfone'}
                      aria-busy={aiConnection==='checking'}
                    >
                      {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-slate-400" />}
                    </button>
                  )}

                  {/* Send Message Button */}
                  <button
                    type="submit"
                    disabled={!inputText.trim()||isLoading||isPreparingImage}
                    className="p-2.5 sm:p-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 text-white rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
                    title="Enviar mensagem"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
