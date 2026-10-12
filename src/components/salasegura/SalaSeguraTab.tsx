import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Lock,
  UserCheck,
  UserPlus,
  Send,
  Copy,
  Check,
  AlertTriangle,
  Ban,
  Flag,
  MessageSquare,
  Users,
  ChevronLeft,
  Sparkles,
  ShieldAlert,
  Clock,
  HeartHandshake,
  CheckCheck,
  Info,
} from 'lucide-react';
import {
  UserProfile,
  UserRole,
  SalaSeguraInvite,
  SalaSeguraChat,
  SalaSeguraMessage,
} from '../../types';
import {
  fetchOrCreateUserProfile,
  updateUserRole,
  sendInviteByCode,
  approveInvite,
  rejectInvite,
  subscribeUserChats,
  subscribePendingInvites,
  subscribeChatMessages,
  sendMessage,
  markChatAsRead,
  blockUser,
  unblockUser,
  submitReport,
} from '../../lib/salaSeguraService';
import { User as FirebaseUser } from '../../lib/firebase';
import { Avatar } from '../Avatar';

interface SalaSeguraTabProps {
  currentUser: FirebaseUser | null;
  isGuest: boolean;
  onOpenAuth: () => void;
}

export const SalaSeguraTab: React.FC<SalaSeguraTabProps> = ({
  currentUser,
  isGuest,
  onOpenAuth,
}) => {
  // State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<SalaSeguraChat[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SalaSeguraInvite[]>([]);
  const [activeChat, setActiveChat] = useState<SalaSeguraChat | null>(null);
  const [messages, setMessages] = useState<SalaSeguraMessage[]>([]);

  // Input fields
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Modals & Actions
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const actionLock=useRef(false);
  const [actionError,setActionError]=useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load User Profile
  useEffect(() => {
    let cancelled=false;setProfile(null);setChats([]);setPendingInvites([]);setActiveChat(null);setMessages([]);
    if (currentUser) {
      fetchOrCreateUserProfile(currentUser.uid, currentUser.email, currentUser.displayName || 'Super Protetor')
        .then((p) => {if(!cancelled)setProfile(p);})
        .catch(()=>setActionError('Não foi possível carregar o perfil.'));
    }
    return ()=>{cancelled=true;};
  }, [currentUser]);

  // Subscribe to Chats & Invites
  useEffect(() => {
    if (!currentUser) return;

    const unsubChats = subscribeUserChats(currentUser.uid, (updatedChats) => {
      setChats(updatedChats);
      if (activeChat) {
        const found = updatedChats.find((c) => c.id === activeChat.id);
        if (found) setActiveChat(found);
      }
    });

    const unsubInvites = subscribePendingInvites(currentUser.uid, (invites) => {
      setPendingInvites(invites);
    });

    return () => {
      unsubChats();
      unsubInvites();
    };
  }, [currentUser, activeChat?.id]);

  // Subscribe to Active Chat Messages
  useEffect(() => {
    if (!activeChat || !currentUser) return;

    const unsubMessages = subscribeChatMessages(activeChat.id, (msgs) => {
      setMessages(msgs);

      // Auto-scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Mark unread messages as read
      const unreadMsgs = msgs.filter((m) => m.senderUid !== currentUser.uid && !m.readBy?.includes(currentUser.uid));
      if (unreadMsgs.length > 0) {
        markChatAsRead(activeChat.id,currentUser.uid,unreadMsgs).catch(()=>setActionError('Não foi possível confirmar a leitura.'));
      }
    });

    return () => unsubMessages();
  }, [activeChat?.id, currentUser]);

  const handleCopyInviteCode = async () => {
    if (!profile?.inviteCode) return;
    try{await navigator.clipboard.writeText(profile.inviteCode);}catch{setActionError('Não foi possível copiar. Selecione o código manualmente.');return;}
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !inviteCodeInput.trim()) return;

    setInviteFeedback(null);
    if(actionLock.current)return;actionLock.current=true;
    let res;try{res=await sendInviteByCode(profile,inviteCodeInput);}catch(e){res={success:false,message:e instanceof Error?e.message:'Convite indisponível.'};}finally{actionLock.current=false;}
    setInviteFeedback(res);

    if (res.success) {
      setInviteCodeInput('');
    }
  };

  const handleApproveInvite = async (invite: SalaSeguraInvite) => {
    if (!currentUser) return;
    try{await approveInvite(invite,currentUser.uid);}catch(e){setActionError(e instanceof Error?e.message:'Aprovação indisponível.');}
  };

  const handleRejectInvite = async (inviteId: string) => {
    try{await rejectInvite(inviteId);}catch{setActionError('Não foi possível recusar.');}
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !profile || !messageInput.trim() || isSending) return;

    const recipientUid = activeChat.participants.find((uid) => uid !== profile.uid) || '';
    const textToSend = messageInput.trim();
    if(actionLock.current)return;actionLock.current=true;
    setIsSending(true);

    try {
      await sendMessage(activeChat.id, profile, textToSend, recipientUid);
      setMessageInput('');
    } catch(e) { setActionError(e instanceof Error?e.message:'Mensagem não enviada.'); } finally {
      actionLock.current=false;
      setIsSending(false);
    }
  };

  const handleBlockUser = async () => {
    if (!profile || !activeChat) return;
    const recipientUid = activeChat.participants.find((uid) => uid !== profile.uid);
    if(actionLock.current)return;actionLock.current=true;
    try {
    if (recipientUid) {
      await blockUser(profile.uid, recipientUid);
      setProfile((prev) => prev ? { ...prev, blockedUsers: [...(prev.blockedUsers || []), recipientUid] } : null);
    }
    setShowBlockConfirm(false);
    setActiveChat(null);
    }catch{setActionError('Não foi possível bloquear o contato. Tente novamente.');}finally{actionLock.current=false;}
  };

  const handleUnblockUser = async (targetUid: string) => {
    if (!profile) return;
    if(actionLock.current)return;actionLock.current=true;
    try {await unblockUser(profile.uid, targetUid);
    setProfile((prev) => prev ? { ...prev, blockedUsers: (prev.blockedUsers || []).filter((u) => u !== targetUid) } : null);
    }catch{setActionError('Não foi possível desbloquear o contato.');}finally{actionLock.current=false;}
  };

  const handleSubmitReport = async () => {
    if (!profile || !activeChat || !reportReason.trim()) return;
    const recipientUid = activeChat.participants.find((uid) => uid !== profile.uid) || '';
    const lastText = activeChat.lastMessageText || 'Chat';

    if(actionLock.current)return;actionLock.current=true;
    try {await submitReport(profile.uid, recipientUid, activeChat.id, lastText, reportReason);
    setReportSuccess(true);
    setTimeout(() => {
      setReportSuccess(false);
      setShowReportModal(false);
      setReportReason('');
    }, 2000);
    }catch{setActionError('A denúncia não foi registrada. Verifique sua conexão e tente novamente.');}finally{actionLock.current=false;}
  };

  const handleChangeRole = async (newRole: UserRole) => {
    if (!currentUser || !profile) return;
    await updateUserRole(currentUser.uid, newRole);
    setProfile((prev) => prev ? { ...prev, role: newRole } : null);
    setShowRoleSelector(false);
  };

  const getRecipientProfile = (chat: SalaSeguraChat) => {
    if (!profile) return { nickname: 'Contato', avatarId: 'default', role: 'infantil' as UserRole };
    const otherUid = chat.participants.find((uid) => uid !== profile.uid) || '';
    return chat.participantProfiles?.[otherUid] || { nickname: 'Contato', avatarId: 'default', role: 'infantil' as UserRole };
  };

  // Helper date formatter
  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // GUEST MODE PLACEHOLDER
  if (isGuest || !currentUser) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-indigo-600 text-white rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center space-y-4">
          <div className="p-3 bg-white/20 rounded-2xl inline-flex mb-1 backdrop-blur-xs">
            <Lock className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">Sala Segura Vigia</h2>
          <p className="text-sm text-orange-100 max-w-md mx-auto leading-relaxed font-medium">
            O ambiente de mensagens privadas com supervisão dos responsáveis e acesso restrito às pessoas autorizadas.
          </p>

          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-left space-y-2 max-w-md mx-auto text-xs text-slate-100">
            <div className="flex items-center gap-2 font-black text-amber-300">
              <ShieldCheck className="w-4 h-4" /> Recurso Protegido por Conta
            </div>
            <p>
              Para acessar o chat privado da Sala Segura, entre com sua conta ou crie uma gratuitamente sob aprovação do responsável.
            </p>
          </div>

          <button
            onClick={onOpenAuth}
            className="py-3.5 px-8 rounded-2xl bg-white text-orange-600 font-black text-sm shadow-xl hover:bg-orange-50 transition-all hover:scale-102 active:scale-98 cursor-pointer"
          >
            Conectar Conta Agora
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-5 select-none">
      {/* Module Header & Guardian Controls */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-3xl p-4 sm:p-5 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shrink-0">
            <Lock className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">Sala Segura</h2>
              <span className="bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                Chat Infantil Controlado
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Apenas contatos autorizados • Sem busca pública • Sem exposição
            </p>
          </div>
        </div>

        {/* Role Badge & Guardian Switcher */}
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 p-1.5 rounded-2xl self-start md:self-auto">
          <div className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-amber-300" />
            <span className="capitalize">
              {profile?.role === 'responsavel'
                ? 'Perfil Responsável'
                : profile?.role === 'educador'
                ? 'Perfil Educador'
                : 'Perfil Infantil'}
            </span>
          </div>

          <button
            onClick={() => setShowRoleSelector(!showRoleSelector)}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Sobre o perfil
          </button>
        </div>
      </div>

      {/* Role Selection Dropdown / Drawer */}
      <AnimatePresence>
        {showRoleSelector && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-indigo-950/80 border border-indigo-800/80 rounded-2xl p-4 text-white text-xs space-y-3"
          >
            <p>Perfis e vínculos de responsáveis dependem de verificação. Declarar ser adulto não muda as permissões.</p>
            <p>Vínculos reais exigem uma operação verificada fora do aplicativo. A demonstração usa vínculos fictícios previamente configurados.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ACTIVE CHAT VIEW */}
      {activeChat ? (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col h-[600px] max-h-[80vh]">
          {/* Chat Top Header */}
          <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setActiveChat(null)}
                className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Voltar para a Lista"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="shrink-0 scale-75 -ml-2">
                <Avatar size="sm" state="idle" isSpeaking={false} isListening={false} />
              </div>

              <div className="min-w-0">
                <h3 className="font-black text-sm text-white truncate">
                  {getRecipientProfile(activeChat).nickname}
                </h3>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Contato Aprovado</span>
                </div>
              </div>
            </div>

            {/* Actions: Block & Report */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowReportModal(true)}
                className="p-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl font-extrabold text-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Denunciar Comportamento"
              >
                <Flag className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline text-[11px]">Denunciar</span>
              </button>

              <button
                onClick={() => setShowBlockConfirm(true)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                title="Bloquear Contato"
              >
                <Ban className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.length === 0 ? (
              <div className="text-center py-12 space-y-2 text-slate-400">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold">Início da conversa privada na Sala Segura.</p>
                <p className="text-[11px]">Diga "Olá!" para começar o aprendizado juntos.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderUid === profile?.uid;
                const isRead = msg.readBy?.length > 1 || msg.status === 'read';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] sm:max-w-[70%] p-3 rounded-2xl text-xs sm:text-sm font-medium shadow-2xs leading-relaxed ${
                        isMe
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-tr-xs'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      }`}
                    >
                      <p className="break-words">{msg.text}</p>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold px-1 mt-1">
                      <span>{formatTime(msg.createdAt)}</span>
                      {isMe && (
                        <span>
                          {isRead ? (
                            <CheckCheck className="w-3 h-3 text-indigo-500" />
                          ) : (
                            <Check className="w-3 h-3 text-slate-400" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Safety Disclaimer Banner */}
          <div className="bg-amber-50 border-t border-amber-100 p-2 text-center text-[11px] text-amber-900 font-bold flex items-center justify-center gap-1.5 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Nunca compartilhe telefone, endereço ou nome da sua escola com amigos online.</span>
          </div>

          {/* Text Input Footer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Digite uma mensagem segura..."
              className="flex-1 py-2.5 px-4 bg-slate-100 rounded-2xl text-slate-800 text-xs sm:text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 border border-slate-200"
              maxLength={300}
            />

            <button
              type="submit"
              disabled={!messageInput.trim() || isSending}
              className={`p-3 rounded-2xl text-white font-black transition-all cursor-pointer ${
                messageInput.trim() && !isSending
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md active:scale-95'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        /* LIST & INVITES VIEW */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Left Column: My Invite Code & Add Contact */}
          <div className="space-y-4">
            {/* Invite Code Card */}
            <div className="bg-gradient-to-br from-indigo-900 to-purple-900 p-4 rounded-3xl text-white shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-black text-xs uppercase">
                <Sparkles className="w-4 h-4" />
                <span>Meu Código de Convite</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-2xl flex items-center justify-between">
                <span className="font-mono font-black text-xs sm:text-sm text-white break-all tracking-normal min-w-0 pr-2">
                  {profile?.inviteCode || 'Carregando código…'}
                </span>
                <button
                  disabled={!profile?.inviteCode} onClick={handleCopyInviteCode}
                  className="p-2 bg-amber-400 hover:bg-amber-300 text-indigo-950 font-black rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <p className="text-[11px] text-indigo-200 leading-tight">
                Compartilhe este código apenas com amigos conhecidos para solicitarem autorização ao seu responsável.
              </p>
            </div>

            {/* Add Friend Form */}
            <div className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm space-y-3">
              <h3 className="font-black text-xs uppercase text-slate-700 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-orange-500" />
                Adicionar Contato por Código
              </h3>

              <form onSubmit={handleSendInvite} className="space-y-2">
                <input
                  type="text"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="Cole o código completo VIGIA-…"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-black text-slate-800 uppercase focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  maxLength={10}
                />

                <button
                  type="submit"
                  disabled={!inviteCodeInput.trim()}
                  className={`w-full py-2.5 rounded-xl text-xs font-black text-white shadow-md transition-all cursor-pointer ${
                    inviteCodeInput.trim()
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  Enviar Solicitação
                </button>
              </form>

              {actionError && <p role="alert" className="p-3 bg-rose-50 text-rose-900">{actionError}</p>}
              {inviteFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-start gap-1.5 ${
                    inviteFeedback.success
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {inviteFeedback.success ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{inviteFeedback.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Pending Invites & Active Chats */}
          <div className="md:col-span-2 space-y-4">
            {/* PENDING GUARDIAN APPROVAL INVITES */}
            {pendingInvites.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <h3 className="font-black text-xs uppercase text-amber-950">
                    Convites Pendentes de Aprovação ({pendingInvites.length})
                  </h3>
                </div>

                <div className="space-y-2">
                  {pendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="bg-white p-3 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <span className="font-black text-xs text-slate-900 block">
                          {inv.fromUid === profile?.uid ? inv.targetNickname : inv.fromNickname}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold block">
                          {inv.fromUid === profile?.uid
                            ? 'Aguardando aprovação do responsável...'
                            : 'Solicitou contato na Sala Segura'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={!inv.reviewerUids?.includes(currentUser?.uid || '') || inv.approvals?.includes(currentUser?.uid || '')} onClick={() => handleApproveInvite(inv)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleRejectInvite(inv.id)}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CHATS LIST */}
            <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-3xl shadow-sm space-y-3 min-h-[350px]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  Minhas Conversas Privadas
                </h3>
                <span className="text-xs text-slate-500 font-bold">
                  {chats.length} {chats.length === 1 ? 'conversa' : 'conversas'}
                </span>
              </div>

              {chats.length === 0 ? (
                <div className="text-center py-16 space-y-3 text-slate-400">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="font-extrabold text-xs text-slate-600">Nenhum contato adicionado ainda.</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Use seu código de convite no painel ao lado para adicionar amigos conhecidos com aprovação do responsável.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map((chat) => {
                    const recipient = getRecipientProfile(chat);
                    const unread = profile ? chat.unreadCount?.[profile.uid] || 0 : 0;

                    return (
                      <button
                        key={chat.id}
                        onClick={() => setActiveChat(chat)}
                        className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 text-left flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0 scale-85 -ml-1">
                            <Avatar size="sm" state="idle" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-black text-xs sm:text-sm text-slate-900 truncate group-hover:text-orange-600">
                              {recipient.nickname}
                            </h4>
                            <p className="text-[11px] text-slate-500 truncate font-medium">
                              {chat.lastMessageText}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] text-slate-400 font-bold">
                            {formatTime(chat.lastMessageTimestamp)}
                          </span>

                          {unread > 0 && (
                            <span className="px-2 py-0.5 bg-orange-500 text-white font-black text-[10px] rounded-full shadow-xs">
                              {unread}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BLOCK CONFIRMATION MODAL */}
      <AnimatePresence>
        {showBlockConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 text-center shadow-2xl border border-slate-200"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
                <Ban className="w-6 h-6" />
              </div>

              <h3 className="font-black text-base text-slate-900">Bloquear Contato?</h3>
              <p className="text-xs text-slate-600 font-medium">
                Este contato não poderá mais lhe enviar mensagens na Sala Segura. Você poderá desbloqueá-lo no painel.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowBlockConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBlockUser}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md"
                >
                  Bloquear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REPORT MODAL */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 max-w-md w-full space-y-4 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center gap-2 text-rose-600">
                <Flag className="w-5 h-5" />
                <h3 className="font-black text-base text-slate-900">Registrar denúncia</h3>
              </div>

              <p className="text-xs text-slate-600 font-medium">
                Sua denúncia será registrada como pendente para consulta pelo responsável verificado. Não há prazo garantido nem atendimento imediato. Selecione o motivo:
              </p>

              {reportSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1 text-emerald-900">
                  <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="font-black text-xs">Denúncia registrada com sucesso!</p>
                  <p className="text-[11px]">Obrigado por ajudar a manter a Sala Segura protegida.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    {[
                      'Solicitação de dados pessoais (telefone/endereço/escola)',
                      'Linguagem imprópria ou desrespeitosa',
                      'Comportamento suspeito ou incômodo',
                      'Outro motivo de segurança',
                    ].map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        className={`w-full p-2.5 text-left text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                          reportReason === reason
                            ? 'bg-rose-50 border-rose-400 text-rose-900 font-extrabold'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setShowReportModal(false)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-800 font-bold text-xs rounded-xl"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSubmitReport}
                      disabled={!reportReason}
                      className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs text-white shadow-md ${
                        reportReason
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-slate-300 cursor-not-allowed'
                      }`}
                    >
                      Enviar Denúncia
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
