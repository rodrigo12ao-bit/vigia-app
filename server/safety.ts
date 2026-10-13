export function isEmergency(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(socorro|pegando fogo|tem fogo|incendio (aqui|na|em)|(?:esta|ta) queimando|agua (?:esta |ta )?(?:subindo|entrando)|enchente (aqui|na)|(?:esta|ta) inundando|alagou (a|aqui)|fio caido|soltando faisca|(?:tomei|levou|tomou) choque|barranco (?:esta |ta )?caindo|deslizamento (aqui|na)|machuquei|machucado grave|(?:esta|ta) sangrando|cortou.*fundo|me ajuda urgente|alguem desmaiou|emergencia real)\b/.test(normalized);
}
export const emergencyReply = {
  status: 'emergency', reply: '[ALERTA DE SEGURANÇA] Afaste-se do perigo se puder fazer isso com segurança e chame um adulto agora. Peça ajuda à Defesa Civil (199) ou aos Bombeiros (193). Não toque em fios ou aparelhos molhados e não tente resolver o perigo sozinho.',
  avatarState: 'alert', topicIllustration: 'geral', interactiveOptions: ['Já chamei um adulto!'], suggestedFollowUps: [],
  emergencyTip: 'Chame um adulto agora. Em perigo real, peça ajuda pelo 199 ou 193.',
};
export const adultEmergencyReply={...emergencyReply,reply:'[ALERTA DE SEGURANÇA] Afaste-se do perigo se puder fazer isso com segurança e peça ajuda aos serviços oficiais. Ligue 199 (Defesa Civil) ou 193 (Bombeiros); em urgência médica, 192 (SAMU). Não toque em fios ou aparelhos molhados, não atravesse água de enchente e não tente enfrentar o perigo sozinho.',interactiveOptions:['Já pedi ajuda'],emergencyTip:'Peça ajuda oficial pelo 199 ou 193; em urgência médica, 192.'};
export function validQuiz(q: any): boolean { return !!q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 3 && q.options.every((s: unknown) => typeof s === 'string') && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length && typeof q.explanation === 'string'; }
export function validScenario(q: any): boolean { return !!q && ['Baixo','Médio','Alto'].includes(q.riskLevel) && Number.isInteger(q.riskScore) && q.riskScore >= 1 && q.riskScore <= 100 && typeof q.summary === 'string' && ['actionSteps','essentialKitItems','emergencyNumbersToCall'].every(k => Array.isArray(q[k]) && q[k].every((s: unknown) => typeof s === 'string')) && validQuiz(q.customQuiz); }
