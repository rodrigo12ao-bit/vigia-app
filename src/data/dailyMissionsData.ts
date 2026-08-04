export interface DailyMission {
  id: string;
  title: string;
  category: 'enchentes' | 'tempestades' | 'deslizamentos' | 'incendios' | 'mochila' | 'numeros' | 'geral';
  icon: string;
  badgeTag: string;
  description: string;
  starReward: number;
  question: {
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    vigiaPraise: string;
  };
  practicalTip: string;
}

export const DAILY_MISSIONS: DailyMission[] = [
  {
    id: 'mission-lantern-check',
    title: 'Missão Lanterna & Luz de Emergência',
    category: 'tempestades',
    icon: '🔦',
    badgeTag: 'Tempestades & Apagão',
    description: 'Chuva forte e raios podem causar quedas de energia elétrica. Descubra onde sua família guarda lanternas e pilhas!',
    starReward: 50,
    question: {
      prompt: 'Se faltar luz durante uma tempestade forte à noite, o que é mais seguro usar para iluminar a casa?',
      options: [
        'Velas acesas sem supervisão de um adulto',
        'Lanternas de LED ou a luz do celular com supervisão',
        'Ligar aparelhos elétricos na tomada de novo',
        'Tentar mexer no quadro de energia da casa sozinho'
      ],
      correctIndex: 1,
      explanation: 'Lanternas são muito mais seguras que velas, pois não correm risco de provocar incêndios nem queimaduras!',
      vigiaPraise: 'Excelente! A lanterna é a companheira perfeita e segura nos apagões de tempestade! 🌟'
    },
    practicalTip: 'Pergunte a um adulto onde fica a lanterna da casa e teste se as pilhas estão carregadas!'
  },
  {
    id: 'mission-flood-water',
    title: 'Missão Escudo Contra Enchentes',
    category: 'enchentes',
    icon: '🌊',
    badgeTag: 'Alagamentos',
    description: 'A água de enchentes pode parecer divertida, mas esconde buracos e contaminações. Vamos aprender a se proteger!',
    starReward: 50,
    question: {
      prompt: 'Você vê que a água da rua começou a subir perto da sua casa. Qual a atitude mais correta?',
      options: [
        'Ir para a rua brincar de nadar ou andar na água',
        'Tentar puxar objetos que estão boiando na enxurrada',
        'Avisar um adulto imediatamente e ir para um local alto e seco',
        'Esconder-se no porão ou no piso mais baixo da casa'
      ],
      correctIndex: 2,
      explanation: 'Nunca entre em águas de enchente! Elas são perigosas, têm correnteza forte e contaminação. Vá sempre para lugares altos!',
      vigiaPraise: 'Muito bem, Guardião! Ficar em local alto e longe da enxurrada é a escolha de um verdadeiro vigia!'
    },
    practicalTip: 'Se a água subir, avise os adultos para desligarem o disjuntor de energia antes de ir para um local seguro.'
  },
  {
    id: 'mission-emergency-numbers',
    title: 'Missão Números do Socorro',
    category: 'numeros',
    icon: '📞',
    badgeTag: 'Contatos Rápidos',
    description: 'Em qualquer emergência, saber para quem ligar faz toda a diferença para salvar vidas!',
    starReward: 50,
    question: {
      prompt: 'Qual é o telefone gratuito da Defesa Civil para emergências de chuvas, alagamentos e deslizamentos?',
      options: ['190', '192', '199', '193'],
      correctIndex: 2,
      explanation: 'O número 199 é o canal direto da Defesa Civil! Lembre-se também do 193 para os Bombeiros!',
      vigiaPraise: 'Sensacional! O número 199 gravado na memória é uma superpoderosa ferramenta de prevenção!'
    },
    practicalTip: 'Guarde o número 199 da Defesa Civil e 193 dos Bombeiros num papel perto do telefone da família.'
  },
  {
    id: 'mission-backpack-check',
    title: 'Missão Mochila Pronta',
    category: 'mochila',
    icon: '🎒',
    badgeTag: 'Kit de Emergência',
    description: 'Uma mochila de emergência deve conter apenas itens essenciais para sobrevivência rápida.',
    starReward: 50,
    question: {
      prompt: 'Qual destes itens é ESSENCIAL para colocar na mochila de emergência da família?',
      options: [
        'Videogame portátil e brinquedos pesados',
        'Água potável, documentos e estojo de primeiros socorros',
        'Roupas de festa e sapatos desconfortáveis',
        'Doces finos e refrigerante'
      ],
      correctIndex: 1,
      explanation: 'Água, medicamentos essenciais, documentos e lanterna são prioritários no kit de emergência!',
      vigiaPraise: 'Mandou super bem! A mochila bem equipada salva tempo precioso quando precisamos evacuar!'
    },
    practicalTip: 'Verifique com a sua família se a garrafinha de água do kit está dentro do prazo de validade.'
  },
  {
    id: 'mission-lightning-safety',
    title: 'Missão Protetor Contra Raios',
    category: 'tempestades',
    icon: '⚡',
    badgeTag: 'Raios & Trovões',
    description: 'Raios são descargas elétricas poderosas. Durante tempestades com trovões, saiba onde buscar abrigo seguro!',
    starReward: 50,
    question: {
      prompt: 'Se começar a dar trovões enquanto você está jogando futebol num campo aberto, o que deve fazer?',
      options: [
        'Continuar jogando até a chuva engrossar bastante',
        'Procurar abrigo debaixo de uma árvore isolada bem alta',
        'Sair imediatamente do campo e buscar abrigo dentro de uma construção ou carro fechado',
        'Segurar no mourão de metal da cerca para se apoiar'
      ],
      correctIndex: 2,
      explanation: 'Campos abertos e árvores isoladas são os lugares mais perigosos durante raios! Entre em uma casa, prédio ou veículo fechado.',
      vigiaPraise: 'Excelente reflexão! Abrigo fechado e seguro é a melhor proteção contra tempestades elétricas!'
    },
    practicalTip: 'Se ouvir o trovão, o raio já está perto! Não espere a chuva cair para buscar abrigo seguro.'
  },
  {
    id: 'mission-landslide-warning',
    title: 'Missão Olho Vivo no Morro',
    category: 'deslizamentos',
    icon: '⛰️',
    badgeTag: 'Encostas e Morros',
    description: 'Aprenda a reconhecer sinais de perigo em morros e encostas após longos períodos de chuva.',
    starReward: 50,
    question: {
      prompt: 'Qual é um sinal claro de que o solo do morro está em perigo de deslizar?',
      options: [
        'Flores coloridas brotando no jardim',
        'Árvores ou postes inclinados, e trincas nas paredes da casa',
        'Passarinhos cantando nos galhos',
        'O sol aparecendo entre as nuvens'
      ],
      correctIndex: 1,
      explanation: 'Árvores tortas, rachaduras no chão ou muros barrigudos indicam que a terra está se movendo. Avise um adulto e saia de lá!',
      vigiaPraise: 'Que olhar atento! Identificar os sinais precocemente permite evacuar com total segurança!'
    },
    practicalTip: 'Caso note portas ou janelas emperrando de repente em dias de muita chuva, avise os adultos imediatamente.'
  },
  {
    id: 'mission-smoke-escape',
    title: 'Missão Escape da Fumaça',
    category: 'incendios',
    icon: '🔥',
    badgeTag: 'Incêndio & Fumaça',
    description: 'A fumaça sobe rapidamente em incêndios. Saber como se deslocar salva vidas e protege a respiração.',
    starReward: 50,
    question: {
      prompt: 'Se houver fumaça em um ambiente fechado durante um princípio de incêndio, como você deve se deslocar para sair?',
      options: [
        'Correndo de pé com a cabeça erguida',
        'Agachado ou engatinhando bem perto do chão, cobrindo o nariz',
        'Pulando bem alto para ver o caminho',
        'Sentando e esperando a fumaça passar sozinha'
      ],
      correctIndex: 1,
      explanation: 'O ar limpo fica próximo ao chão porque o calor e a fumaça tóxica sobem. Engatinhar ajuda a respirar!',
      vigiaPraise: 'Você aprendeu uma regra de ouro dos bombeiros! Parabéns pelo conhecimento vital!'
    },
    practicalTip: 'Toque nas portas com as costas da mão antes de abrir. Se estiver quente, não abra!'
  }
];

export function getTodayMission(): DailyMission {
  // Use current date string YYYY-MM-DD to deterministically select a daily mission
  const todayStr = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = (hash << 5) - hash + todayStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DAILY_MISSIONS.length;
  return DAILY_MISSIONS[index];
}

export function getTimeUntilNextMission(): { hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const diffMs = tomorrow.getTime() - now.getTime();
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return { hours, minutes, seconds };
}
