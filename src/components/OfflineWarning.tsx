import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const OfflineWarning: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div 
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-rose-500 text-white px-4 py-2 rounded-full shadow-lg pointer-events-none"
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-xs font-bold">Sem conexão. Funções de Inteligência (IA) indisponíveis.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
