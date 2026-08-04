export interface PlayerAvatarOption {
  id: string;
  name: string;
  icon: string;
  title: string;
  bgColor: string;
  badgeBg: string;
  description: string;
}

export const PLAYER_AVATARS: PlayerAvatarOption[] = [
  {
    id: 'hero_shield',
    name: 'Cadete Defesa',
    icon: '🛡️',
    title: 'Defensor Mirim',
    bgColor: 'from-amber-500 to-orange-600',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Especialista em prevenção e rotas de segurança na comunidade.',
  },
  {
    id: 'hero_water',
    name: 'Guardiã Gotinha',
    icon: '💧',
    title: 'Mestre da Água',
    bgColor: 'from-cyan-500 to-blue-600',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Perita em monitorar rios, enchentes e segurança na chuva.',
  },
  {
    id: 'hero_spark',
    name: 'Guardião Faísca',
    icon: '⚡',
    title: 'Protetor dos Raios',
    bgColor: 'from-purple-500 to-indigo-600',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Rápido como um raio em desligar eletrônicos e evitar acidentes.',
  },
  {
    id: 'hero_sprout',
    name: 'Super Broto',
    icon: '🌱',
    title: 'Vigia da Terra',
    bgColor: 'from-emerald-500 to-teal-600',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Conhece as vegetações, morros e prevenção contra deslizamentos.',
  },
  {
    id: 'hero_sun',
    name: 'Guardiã Sol',
    icon: '☀️',
    title: 'Líder Prevenção',
    bgColor: 'from-amber-400 to-yellow-500',
    badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    description: 'Ilumina os caminhos de emergência e organiza a mochila preventiva.',
  },
  {
    id: 'hero_fire',
    name: 'Cadete Brigada',
    icon: '🔥',
    title: 'Inspetor da Fumaça',
    bgColor: 'from-red-500 to-orange-600',
    badgeBg: 'bg-red-500/20 text-red-300 border-red-500/40',
    description: 'Cuida da prevenção de queimadas e saídas de emergência com fogo.',
  },
];
