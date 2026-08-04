import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatMessage, AvatarState, Badge, DebugInfo } from './types';
import { INITIAL_BADGES } from './data/quizzes';
import { speakText, stopSpeaking } from './utils/speech';
import { Navbar } from './components/Navbar';
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
  User as FirebaseUser,
} from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'games' | 'topics' | 'phones' | 'sala_segura'>('chat');

  const [isDailyMissionOpen, setIsDailyMissionOpen] = useState(false);
  const [isScenarioAnalyzerOpen, setIsScenarioAnalyzerOpen] = useState(false);
  const [isDynamicQuizOpen, setIsDynamicQuizOpen] = useState(false);

  // Auth & Entry Flow States
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem('dc_nickname') || 'Super Protetor';
  });
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    return localStorage.getItem('dc_is_guest') === 'true';
  });
  const [avatarGender, setAvatarGender] = useState<'female' | 'male'>(() => {
    return (localStorage.getItem('dc_avatar_gender') as 'female' | 'male') || 'female';
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
    modelName: 'gemini-3.6-flash',
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
    const saved = localStorage.getItem('dc_stars_score');
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  const [badges, setBadges] = useState<Badge[]>(() => {
    try {
      const saved = localStorage.getItem('dc_badges');
      return saved ? JSON.parse(saved) : INITIAL_BADGES;
    } catch {
      return INITIAL_BADGES;
    }
  });

  // Firebase Auth State Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsGuest(false);
        localStorage.setItem('dc_is_guest', 'false');
        setIsWelcomeOpen(false);

        // Fetch user progress from Firestore
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.nickname) {
              setNickname(data.nickname);
              localStorage.setItem('dc_nickname', data.nickname);
            }
            if (typeof data.starsScore === 'number') {
              setStarsScore(data.starsScore);
            }
            if (data.avatarGender === 'male' || data.avatarGender === 'female') {
              setAvatarGender(data.avatarGender);
              localStorage.setItem('dc_avatar_gender', data.avatarGender);
            }
            if (Array.isArray(data.badges)) {
              setBadges((prev) =>
                prev.map((b) => ({
                  ...b,
                  unlocked: data.badges.includes(b.id) || b.unlocked,
                }))
              );
            }
          } else {
            // First time login - set doc
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email || '',
              nickname: user.displayName || 'Super Protetor',
              avatarId: 'default',
              starsScore: starsScore || 50,
              badges: badges.filter((b) => b.unlocked).map((b) => b.id),
              completedGames: [],
              isAdultConfirmed: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error('Erro ao sincronizar dados do usuário:', err);
        }
      } else {
        setCurrentUser(null);
        if (!localStorage.getItem('dc_is_guest')) {
          setIsWelcomeOpen(true);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync state to localStorage & Firestore
  useEffect(() => {
    localStorage.setItem('dc_stars_score', starsScore.toString());
    localStorage.setItem('dc_nickname', nickname);
    localStorage.setItem('dc_avatar_gender', avatarGender);

    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        updateDoc(userRef, {
          starsScore,
          nickname,
          avatarGender,
          badges: badges.filter((b) => b.unlocked).map((b) => b.id),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch (e) {}
    }
  }, [starsScore, badges, nickname, avatarGender, currentUser]);

  useEffect(() => {
    localStorage.setItem('dc_badges', JSON.stringify(badges));
  }, [badges]);

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('dc_is_guest', 'true');
    setIsWelcomeOpen(false);
    setIsAuthModalOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setIsGuest(false);
    localStorage.removeItem('dc_is_guest');
    setIsProfileModalOpen(false);
    setIsWelcomeOpen(true);
  };

  const handleResetProgress = async () => {
    setStarsScore(0);
    setBadges(INITIAL_BADGES);
    localStorage.setItem('dc_stars_score', '0');
    localStorage.setItem('dc_badges', JSON.stringify(INITIAL_BADGES));

    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          starsScore: 0,
          badges: [],
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}
    }
  };

  const handleUpdateNickname = async (newNick: string) => {
    setNickname(newNick);
    localStorage.setItem('dc_nickname', newNick);

    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          nickname: newNick,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}
    }
  };

  const handleAddStars = (points: number) => {
    setStarsScore((prev) => prev + points);
  };

  const handleUnlockBadge = (badgeId: string) => {
    setBadges((prevBadges) =>
      prevBadges.map((b) => {
        if (b.id === badgeId && !b.unlocked) {
          return { ...b, unlocked: true, unlockedAt: new Date().toLocaleDateString() };
        }
        return b;
      })
    );
  };

  const speakMessage = (text: string) => {
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
    if ((!text.trim() && !image) || sendingRef.current) return;

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

    // Unlock chat badge
    handleUnlockBadge('b_chat');
    handleAddStars(5);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || 'Analise esta imagem sobre segurança e riscos.',
          chatHistory: messages.map((m) => ({ role: m.role, content: m.content })),
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

      const data = await response.json();

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'Você está de parabéns em aprender segurança! Lembre-se sempre de avisar um adulto de confiança se precisar de ajuda.',
        timestamp: new Date(),
        emotion: (data.avatarState as AvatarState) || 'speaking',
        emergencyTip: data.emergencyTip,
        challengeOrQuestion: data.challengeOrQuestion,
        interactiveOptions: data.interactiveOptions,
        suggestedFollowUps: data.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setAvatarState(assistantMsg.emotion || 'speaking');

      // record approximate avatar render time on next animation frame (non-blocking)
      requestAnimationFrame(() => {
        const ar = performance.now();
        setDebugInfo((prev) => ({
          ...prev,
          avatarRenderedTimestamp: ar,
          duration_voiceStart_to_avatarRender: prev.voiceStartTimestamp ? Math.round(ar - (prev.voiceStartTimestamp as number)) : null,
        }));
      });

      // Update diagnostic debug info
      if (data.debugInfo) {
        setDebugInfo((prev) => ({
          ...prev,
          lastSentPrompt: text,
          lastApiResponse: data.reply || 'Sem resposta',
          apiStatus: data.debugInfo.status || 'Sucesso',
          modelName: data.debugInfo.modelUsed || 'gemini-3.6-flash',
          lastError: data.debugInfo.error || 'Nenhum erro registrado',
        }));
      } else {
        setDebugInfo((prev) => ({
          ...prev,
          lastSentPrompt: text,
          lastApiResponse: data.reply || 'Sem resposta',
          apiStatus: 'Sucesso',
          lastError: 'Nenhum erro registrado',
        }));
      }

      // Speak assistant message asynchronously (do not wait to render text)
      speakMessage(assistantMsg.content);
    } catch (err: any) {
      if (err && err.name === 'AbortError') {
        // previous request aborted — ignore and return silently
        setDebugInfo((prev) => ({ ...prev, apiStatus: 'Requisição abortada' }));
        return;
      }

      console.error('Chat error:', err);
      const errorMsg = String(err?.message || err);
      const fallbackMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          'Tive um pequeno imprevisto técnico na conexão! Em qualquer situação de emergência real, avise um adulto responsável e ligue 199 (Defesa Civil) ou 193 (Bombeiros)!',
        timestamp: new Date(),
        emotion: 'serious',
        emergencyTip: 'Avisar um adulto de confiança é o passo número 1 para sua segurança!',
        challengeOrQuestion: 'Quer tentar me perguntar de novo?',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      setAvatarState('serious');

      setDebugInfo((prev) => ({
        ...prev,
        lastSentPrompt: text,
        lastApiResponse: fallbackMsg.content,
        apiStatus: 'Erro de Rede',
        lastError: errorMsg,
      }));

      speakMessage(fallbackMsg.content);
    } finally {
      setIsLoading(false);
      sendingRef.current = false;
      chatAbortRef.current = null;
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

  const handleResetChat = () => {
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
    stopSpeaking();
    setIsSpeaking(false);
    setMessages(sessionMessages);
    setAvatarState('idle');
  };

  const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className={`bg-gradient-to-b from-orange-50/40 via-slate-100/90 to-blue-50/30 text-slate-900 font-sans flex flex-col antialiased transition-colors duration-500 ease-in-out ${
      activeTab === 'chat' ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'
    }`}>
      {/* Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
        setIsAudioMuted={(muted) => {
          setIsAudioMuted(muted);
          if (muted) {
            stopSpeaking();
            setIsSpeaking(false);
          }
        }}
      />

      {/* Main View Area */}
      <main className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={`w-full ${activeTab === 'chat' ? 'h-full flex flex-col min-h-0' : 'min-h-full'}`}
          >
            {activeTab === 'chat' && (
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
                  <GameHubTab
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

            {activeTab === 'phones' && (
              <React.Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-xs">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
                    Carregando Telefones úteis...
                  </div>
                }
              >
                <EmergencyNumbersCard onSpeak={speakMessage} />
              </React.Suspense>
            )}

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
        </AnimatePresence>
      </main>


      {/* Footer */}
      {activeTab !== 'chat' && (
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs font-semibold text-slate-500 shrink-0">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              🛡️ Vigia - Assistente Virtual Educativa de Proteção e Defesa Civil
            </span>
            <span className="text-[11px] bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-bold">
              Defesa Civil Brasil • Emergência 199 / 193
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
      <DailyMissionModal
        isOpen={isDailyMissionOpen}
        onClose={() => setIsDailyMissionOpen(false)}
        onAddStars={handleAddStars}
        onUnlockBadge={handleUnlockBadge}
        starsScore={starsScore}
      />

      {/* AI Scenario Risk Analyzer Modal */}
      <ScenarioAnalyzerModal
        isOpen={isScenarioAnalyzerOpen}
        onClose={() => setIsScenarioAnalyzerOpen(false)}
        onAddStars={handleAddStars}
        onSpeak={speakMessage}
      />

      {/* AI Dynamic Quiz Generator Modal */}
      <DynamicAIQuizModal
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
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userEmail={currentUser?.email || null}
        nickname={nickname}
        onUpdateNickname={handleUpdateNickname}
        starsScore={starsScore}
        badges={badges}
        completedGamesCount={badges.filter((b) => b.unlocked).length}
        isGuest={isGuest}
        onSignOut={handleSignOut}
        onResetProgress={handleResetProgress}
      />

      {/* Terms and Privacy Legal Modals */}
      <LegalModals
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />

      {/* PWA Components */}
      <PWAPrompt />
      <OfflineWarning />
    </div>
  );
}
