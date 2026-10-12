import { useDialog } from '../hooks/useDialog';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Lock, EyeOff, UserCheck } from 'lucide-react';

interface LegalModalsProps {
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModals: React.FC<LegalModalsProps> = ({ type, onClose }) => {
  const dialogRef=useDialog(!!type,onClose);
  if (!type) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Informações de privacidade e termos"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
              <h3 className="font-extrabold text-lg">
                {type === 'privacy' ? 'Política de Privacidade Infantil' : 'Termos de Uso do Vigia'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-slate-700 text-xs sm:text-sm leading-relaxed">
            {type === 'privacy' ? (
              <>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
                  <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="font-semibold text-indigo-950">
                    O Vigia foi projetado para crianças de 6 a 14 anos, com níveis de leitura, para aprendizado de prevenção sob supervisão de um adulto.
                  </p>
                </div>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-emerald-600" /> 1. Cuidados com seus dados
                </h4>
                <p>
                  Use um apelido e não envie nomes completos, endereço, escola, localização exata ou fotografias pessoais. O campo de imagens é opcional e pode receber conteúdo pessoal se você o escolher.
                </p>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" /> 2. Responsabilidade do Adulto
                </h4>
                <p>
                  A criação de conta deve ser autorizada por um pai, mãe, responsável legal ou educador. Solicitamos apenas um e-mail do responsável para acesso seguro e um apelido para a criança.
                </p>

                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600" /> 3. Como usamos as informações
                </h4>
                <p>
                  Salvamos seu perfil e progresso para continuar o aprendizado. Não vendemos dados nem exibimos anúncios. Abra os assuntos abaixo com um adulto para conhecer os detalhes.
                </p>
                <details className="topic-detail"><summary>Conversas, imagens e voz</summary><p>{import.meta.env.MODE==='publication'?'Nesta prévia online, a IA é simulada. Texto e imagens escolhidos são enviados ao servidor do Vigia; não são enviados ao Gemini. Voz ao vivo e transcrição estão indisponíveis. Use somente dados fictícios.':'Em ambiente conectado com IA real habilitada, o conteúdo enviado à IA é processado pela API Gemini. Na demonstração local, a IA é simulada e os dados usam emuladores.'} Reconhecimento e leitura de voz do navegador podem usar serviços do fabricante do dispositivo. A análise pode falhar e não substitui avaliação profissional.</p></details>
                <details className="topic-detail"><summary>Histórico e uso sem conexão</summary><p>Para visitantes, históricos e anexos ficam neste aparelho; para contas, ficam no Firestore. Você pode excluir conversas pelo histórico. As atividades carregadas podem funcionar offline. O progresso de uma conta aguarda sincronização no mesmo perfil.</p></details>
                <details className="topic-detail"><summary>Professores e responsáveis</summary><p>O painel escolar mostra apelido, atividades e denúncias somente de alunos com vínculo aprovado pelo professor e pelo responsável. Não compartilha históricos privados nem o plano familiar. Denúncias podem ser revisadas manualmente por adultos vinculados, sem prazo garantido. Em emergência, procure ajuda imediatamente.</p></details>
                <details className="topic-detail"><summary>Exportar e excluir dados</summary><p>Você pode exportar seus dados pelo perfil. {import.meta.env.MODE==='publication'?'A exclusão de conta online exige um processo de retenção aprovado e ainda não está habilitada.':'Na demonstração local, responsáveis vinculados podem excluir contas infantis fictícias, e adultos podem excluir contas sem vínculos pendentes. Conversas compartilhadas são encerradas e o conteúdo da conta excluída é substituído. Denúncias privadas podem permanecer para revisão. A exclusão de produção exige um processo de retenção aprovado e ainda não está habilitada.'}</p></details>
                <details className="topic-detail"><summary>Avisos oficiais e localização</summary><p>Os avisos são consultados no INMET. O filtro pelo nome da região funciona neste aparelho e não coleta nem transmite sua localização.</p></details>
              </>
            ) : (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="font-semibold text-amber-950">
                    Ao utilizar o aplicativo Vigia, você concorda com nossas orientações de aprendizagem e segurança comunitária.
                  </p>
                </div>

                <h4 className="font-black text-slate-900 text-sm">1. Finalidade Educativa</h4>
                <p>
                  O aplicativo Vigia é um projeto educacional de prevenção e conscientização sobre Defesa Civil e situações de risco. As instruções não substituem o atendimento oficial de órgãos de emergência (199 / 193 / 190).
                </p>

                <h4 className="font-black text-slate-900 text-sm">2. Uso por Crianças</h4>
                <p>
                  O aplicativo deve ser utilizado sob a supervisão indireta de pais, responsáveis ou educadores em ambientes escolares ou familiares.
                </p>

                <h4 className="font-black text-slate-900 text-sm">3. Conta e Acesso</h4>
                <p>
                  O usuário é responsável por manter a confidencialidade do e-mail de acesso. A opção "Continuar como visitante" permite a utilização gratuita com armazenamento local no próprio dispositivo.
                </p>
              </>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              onClick={onClose}
              className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
