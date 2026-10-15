import { useDialog } from '../hooks/useDialog';
import { salaRequest } from '../lib/api';
import {adultAudience} from '../lib/audience';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Lock,
  Mail,
  UserCheck,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  HeartHandshake,
  AlertCircle,
  KeyRound,
  Check,
} from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from '../lib/firebaseAuth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
  onOpenLegal: (type: 'terms' | 'privacy') => void;
}

type AuthTab = 'login' | 'register' | 'forgot';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onContinueAsGuest,
  onOpenLegal,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('login');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isAdultConfirmed, setIsAdultConfirmed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const busy=React.useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetSentMessage, setResetSentMessage] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setEmail(''); setPassword(''); setNickname('');
    setIsAdultConfirmed(false); setShowPassword(false);
    setErrorMessage(''); setResetSentMessage(''); setActiveTab('login');
  }, [isOpen]);

  const dialogRef=useDialog(isOpen,onClose);
  if (!isOpen) return null;
  const translateAuthError = (code: string) => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos. Verifique os dados e tente novamente.';
      case 'auth/email-already-in-use':
        return 'Este e-mail já está cadastrado. Tente fazer login ou recuperar a senha.';
      case 'auth/weak-password':
        return 'A senha é muito fraca. Digite pelo menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'Endereço de e-mail inválido.';
      case 'auth/popup-closed-by-user':
        return 'A janela do Google foi fechada antes de concluir o login.';
      default:
        return 'Ocorreu um erro ao conectar. Verifique sua conexão e tente novamente.';
    }
  };

  const handleCreateUserDocument = async (uid: string, userEmail: string | null, userNickname: string, isAdult: boolean, updateNickname = true) => {
    const requireCurrentAccount=()=>{if(auth.currentUser?.uid!==uid)throw new Error('A conta mudou. Entre novamente para concluir.');};
    requireCurrentAccount();
    await salaRequest('profile',{nickname:userNickname});
    requireCurrentAccount();
    const {db,doc,updateDoc}=await import('../lib/firebase');
    requireCurrentAccount();
    await updateDoc(doc(db,'users',uid),{...(updateNickname?{nickname:userNickname||'Super Protetor'}:{}),isAdultConfirmed:isAdult,consentVersion:'2026-10-12',consentAt:new Date().toISOString()});
    requireCurrentAccount();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || busy.current) return;
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Preencha o e-mail e a senha.');
      return;
    }

    busy.current=true;setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      onClose();
    } catch (err: any) {
      setErrorMessage(translateAuthError(err?.code));
    } finally {
      busy.current=false;setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || busy.current) return;
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Preencha o e-mail e crie uma senha.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    if (!isAdultConfirmed) {
      setErrorMessage('É necessário confirmar que você tem 18 anos ou mais e usa sua própria conta.');
      return;
    }

    busy.current=true;setLoading(true);
    try {
      sessionStorage.setItem('vigia_pending_nickname',nickname.trim() || 'Super Protetor');
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await handleCreateUserDocument(cred.user.uid, cred.user.email, nickname.trim(), isAdultConfirmed);
      sessionStorage.removeItem('vigia_pending_nickname');
      onClose();
    } catch (err: any) {
      setErrorMessage(translateAuthError(err?.code));
    } finally {
      sessionStorage.removeItem('vigia_pending_nickname');
      busy.current=false;setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading || busy.current) return;
    setErrorMessage('');
    if(!window.confirm('Confirmo que sou adulto e autorizo este acesso. Li as informações de privacidade. Esta confirmação não atribui o papel de responsável verificado na Sala Segura.'))return;
    busy.current=true;setLoading(true);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await handleCreateUserDocument(cred.user.uid, cred.user.email, 'Super Protetor', true, false);
      onClose();
    } catch (err: any) {
      setErrorMessage(translateAuthError(err?.code));
    } finally {
      busy.current=false;setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || busy.current) return;
    setErrorMessage('');
    setResetSentMessage('');

    if (!email.trim()) {
      setErrorMessage('Digite seu e-mail cadastrado.');
      return;
    }

    busy.current=true;setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSentMessage('Enviamos um e-mail com as instruções para redefinir sua senha!');
    } catch (err: any) {
      setErrorMessage(translateAuthError(err?.code));
    } finally {
      busy.current=false;setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto">
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Acessar sua conta"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col my-auto"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-5 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-black">Bem-vindo ao Vigia</h2>
            </div>
            <p className="text-xs text-orange-100 font-medium">
              Acesse sua conta para salvar suas estrelas, medalhas e progresso de aprendizagem!
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => {
                setActiveTab('login');
                setErrorMessage('');
              }}
              className={`flex-1 py-3 text-xs font-black transition-all ${
                activeTab === 'login'
                  ? 'bg-white text-orange-600 border-b-2 border-orange-500 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setActiveTab('register');
                setErrorMessage('');
              }}
              className={`flex-1 py-3 text-xs font-black transition-all ${
                activeTab === 'register'
                  ? 'bg-white text-orange-600 border-b-2 border-orange-500 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 space-y-4">
            {/* Error Message Alert */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2 text-rose-800 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Reset Email Sent Banner */}
            {resetSentMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2 text-emerald-900 text-xs font-semibold">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{resetSentMessage}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-600 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email" aria-label="E-mail" autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-black uppercase text-slate-600">Senha</label>
                    <button
                      type="button"
                      onClick={() => setActiveTab('forgot')}
                      className="text-[11px] font-bold text-orange-600 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      aria-label="Senha" autoComplete="current-password" type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword?'Ocultar senha':'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    loading
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-98'
                  }`}
                >
                  {loading ? 'Entrando...' : 'Entrar na Conta'}
                </button>
              </form>
            )}

            {/* REGISTER FORM */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                {/* Child Safety Box */}
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-[11px] text-amber-950 font-medium space-y-1">
                  <span className="font-extrabold flex items-center gap-1 text-amber-900">
                    <ShieldCheck className="w-4 h-4 text-amber-600" /> {adultAudience?'Acesso adulto':'Proteção Infantil'}
                  </span>
                  <p>
                    A conta é exclusiva para pessoas de 18 anos ou mais. Use seu próprio e-mail e um apelido. Não cadastre menores nem envie dados de terceiros.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-600 mb-1">
                    Seu apelido (Opcional)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Ex: Super Vítor ou Campeã Sofia"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-600 mb-1">{adultAudience?'Seu e-mail':'E-mail do Responsável'}</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={adultAudience?'seu.email@exemplo.com':'responsavel@exemplo.com'}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-600 mb-1">Crie uma Senha</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Responsible Adult Confirmation Checkbox */}
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAdultConfirmed}
                    onChange={(e) => setIsAdultConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <span className="text-[11px] font-bold text-slate-700 leading-tight">
                    Confirmo que tenho 18 anos ou mais e estou criando minha própria conta.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    loading
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-98'
                  }`}
                >
                  {loading ? 'Criando conta...' : 'Criar Conta de Aprendizagem'}
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {activeTab === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-3.5">
                <p className="text-xs text-slate-600 font-medium">
                  Digite o e-mail cadastrado e enviaremos um link para você redefinir sua senha com segurança.
                </p>

                <div>
                  <label className="block text-[11px] font-black uppercase text-slate-600 mb-1">E-mail Cadastrado</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('login')}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md"
                  >
                    {loading ? 'Enviando...' : 'Enviar Link de Redefinição'}
                  </button>
                </div>
              </form>
            )}

            {/* Divider */}
            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-2 text-[10px] uppercase font-black text-slate-400 absolute">
                ou
              </span>
            </div>

            {/* GOOGLE SIGN IN */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Entrar com o Google</span>
            </button>

            {/* GUEST MODE BUTTON */}
            <button
              type="button"
              onClick={() => {
                onContinueAsGuest();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <HeartHandshake className="w-4 h-4 text-emerald-600" />
              <span>Continuar como Visitante</span>
            </button>
          </div>

          {/* Footer Legal Links */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-500 font-medium flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:underline hover:text-slate-800"
            >
              Política de Privacidade
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="hover:underline hover:text-slate-800"
            >
              Termos de Uso
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
