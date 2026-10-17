import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { discoverPwaUpdates, type PwaUpdateStatus } from '../lib/pwaUpdates';

export const PWAPrompt: React.FC<{visible?:boolean;onBeforeUpdate?:()=>Promise<void>}> = ({visible=true,onBeforeUpdate}) => {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [checkStatus, setCheckStatus] = useState<PwaUpdateStatus>('idle');
  const discovery = React.useRef<ReturnType<typeof discoverPwaUpdates> | null>(null);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registered) {
      if (registered) setRegistration(registered);
    },
    onRegisterError(error) {
      setCheckStatus('error');
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    if (!registration) return;
    const watcher = discoverPwaUpdates(registration, {
      window, document, online: () => navigator.onLine,
      onAvailable: () => setNeedRefresh(true), onStatus: setCheckStatus,
    });
    discovery.current = watcher;
    return () => {
      watcher.dispose();
      if (discovery.current === watcher) discovery.current = null;
    };
  }, [registration, setNeedRefresh]);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installing,setInstalling]=useState(false);
  const [installError,setInstallError]=useState('');
  const installLock=React.useRef(false);
  const [updating,setUpdating]=useState(false);
  const [updateError,setUpdateError]=useState('');
  const updateLock=React.useRef(false);
  const handleUpdate=async()=>{
    if(updateLock.current)return;
    updateLock.current=true;setUpdating(true);setUpdateError('');
    try{await onBeforeUpdate?.();await updateServiceWorker(true);}
    catch(error){setUpdateError(error instanceof Error?error.message:'Não foi possível salvar antes de atualizar. Tente novamente.');}
    finally{updateLock.current=false;setUpdating(false);}
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      setInstallError('');
    };
    const handleInstalled=()=>{setIsInstallable(false);setDeferredPrompt(null);setInstallError('');};

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled',handleInstalled);
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);window.removeEventListener('appinstalled',handleInstalled);};
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt||installLock.current) return;
    const prompt=deferredPrompt;
    installLock.current=true;setInstalling(true);setInstallError('');
    // A browser installation event can only be used once, even if declined.
    setDeferredPrompt(null);setIsInstallable(false);
    try {await prompt.prompt();await prompt.userChoice;}
    catch {setInstallError('Não foi possível abrir a instalação. Tente novamente pelo menu do navegador.');}
    finally {installLock.current=false;setInstalling(false);}
  };

  const closeRefresh = () => {
    setNeedRefresh(false);
  };
  
  const closeOffline = () => {
    setOfflineReady(false);
  };

  // A new release must remain discoverable even outside Help. Applying it is
  // still explicit so an open conversation or activity is never reloaded here.
  if(!visible&&!needRefresh)return null;
  return (
    <div className={needRefresh?'relative z-30 shrink-0 px-3 py-2':'fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 items-end'}>
      <AnimatePresence>
        {visible && !needRefresh && (
          <div className="bg-slate-900 border border-slate-600 rounded-2xl p-3 w-72 text-white">
            <button
              type="button"
              onClick={() => { void discovery.current?.check(true); }}
              disabled={!registration || checkStatus === 'checking' || updating}
              aria-busy={checkStatus === 'checking'}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white font-bold px-3 py-2 rounded-xl text-xs"
            >
              {checkStatus === 'checking' ? 'Verificando…' : 'Buscar atualização'}
            </button>
            <p role="status" className="text-xs text-slate-300 mt-2">
              {checkStatus === 'current' ? 'Versão atual.'
                : checkStatus === 'offline' ? 'Sem conexão. Tente quando estiver online.'
                : checkStatus === 'error' ? 'Não foi possível verificar agora. Tente novamente.'
                : checkStatus === 'available' ? 'Há uma nova versão disponível.'
                : checkStatus === 'checking' ? 'Verificando a versão do aplicativo…'
                : 'Verifique se há uma nova versão da Vigia.'}
            </p>
          </div>
        )}
        {visible&&installError&&<p role="alert" className="bg-white border border-amber-300 rounded-2xl p-3 w-72 text-sm text-slate-900">{installError}</p>}
        {/* Nova versão (Update) */}
        {needRefresh && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Atualização do aplicativo"
            className="bg-slate-900 border border-cyan-500/50 shadow-lg rounded-2xl p-3 w-full max-w-5xl mx-auto text-white"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0" />
                <h3 className="font-bold text-xs sm:text-sm">Nova versão!</h3>
                <p className="hidden md:block text-xs text-slate-300">Atualize quando terminar sua conversa.</p>
              </div>
              <button
                onClick={()=>void handleUpdate()}
                disabled={updating}
                aria-busy={updating}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer shrink-0"
              >
                {updating?'Salvando…':'Atualizar Agora'}
              </button>
              <button aria-label="Fechar aviso de atualização" onClick={closeRefresh} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {updateError&&<p role="alert" className="text-xs text-amber-200 mt-3">{updateError}</p>}
          </motion.div>
        )}

        {/* Offline Ready */}
        {visible && !needRefresh && offlineReady && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-slate-900 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)] rounded-2xl p-4 w-72 text-white"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">App Baixado!</h3>
              </div>
              <button aria-label="Fechar aviso offline" onClick={closeOffline} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300">Dicas e atividades salvas ficam disponíveis sem internet. IA, contas e Sala Segura precisam de conexão.</p>
          </motion.div>
        )}

        {/* Botão de Instalar (PWA) */}
        {visible && !needRefresh && isInstallable && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-indigo-600 border border-indigo-400 shadow-xl rounded-2xl p-4 w-72 text-white"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-200" />
                <h3 className="font-bold text-sm">Instalar Vigia</h3>
              </div>
              <button aria-label="Fechar aviso de instalação" onClick={() => setIsInstallable(false)} className="text-indigo-300 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-indigo-100 mb-3">Instale o aplicativo na sua tela inicial para acesso rápido e modo offline.</p>
            <button 
              onClick={handleInstall}
              disabled={installing}
              className="w-full bg-white text-indigo-700 hover:bg-indigo-50 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Instalar App
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
