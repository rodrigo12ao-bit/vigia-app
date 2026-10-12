import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const PWAPrompt: React.FC<{visible?:boolean}> = ({visible=true}) => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  const closeRefresh = () => {
    setNeedRefresh(false);
  };
  
  const closeOffline = () => {
    setOfflineReady(false);
  };

  if(!visible)return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 items-end">
      <AnimatePresence>
        {/* Nova versão (Update) */}
        {needRefresh && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-slate-900 border border-cyan-500/50 shadow-[0_0_20px_rgba(0,210,211,0.3)] rounded-2xl p-4 w-72 text-white"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                <h3 className="font-bold text-sm">Nova versão!</h3>
              </div>
              <button aria-label="Fechar aviso de atualização" onClick={closeRefresh} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-3">O Vigia tem uma nova atualização disponível. Instale para usar as novas funções.</p>
            <button 
              onClick={() => updateServiceWorker(true)}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Atualizar Agora
            </button>
          </motion.div>
        )}

        {/* Offline Ready */}
        {offlineReady && (
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
        {isInstallable && (
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
              <button onClick={() => setIsInstallable(false)} className="text-indigo-300 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-indigo-100 mb-3">Instale o aplicativo na sua tela inicial para acesso rápido e modo offline.</p>
            <button 
              onClick={handleInstall}
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
