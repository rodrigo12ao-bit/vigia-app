import { TopicItem, EmergencyPhone } from '../types';

export const EMERGENCY_PHONES: EmergencyPhone[] = [
  {
    number: '199',
    name: 'Defesa Civil',
    description: 'Proteção e Prevenção de Desastres',
    color: 'bg-orange-500 text-white',
    icon: 'ShieldAlert',
    whenToCall: 'Quando notar rachaduras na casa, morros caindo, rios subindo ou tempestades fortes!',
  },
  {
    number: '193',
    name: 'Corpo de Bombeiros',
    description: 'Resgate, Incêndios e Alagamentos',
    color: 'bg-red-600 text-white',
    icon: 'Flame',
    whenToCall: 'Em caso de incêndios, fumaça, resgate de pessoas ou animais presas na água!',
  },
  {
    number: '192',
    name: 'SAMU - Ambulância',
    description: 'Socorro de Saúde de Emergência',
    color: 'bg-blue-600 text-white',
    icon: 'Ambulance',
    whenToCall: 'Quando alguém passar muito mal, se machucar gravemente ou precisar de médico urgente!',
  },
  {
    number: '190',
    name: 'Polícia Militar',
    description: 'Segurança Pública',
    color: 'bg-slate-800 text-white',
    icon: 'Shield',
    whenToCall: 'Para pedir ajuda de segurança em situações de emergência!',
  },
];

export const TOPICS_DATA: TopicItem[] = [
  {
    id: 'enchentes',
    title: 'Enchentes e Alagamentos',
    subtitle: 'Como se proteger quando a água do rio sobe!',
    category: 'enchentes',
    iconName: 'Waves',
    colorTheme: 'from-blue-500 to-cyan-600',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
    shortSummary: 'Aprenda o que fazer quando chove muito e a água começa a subir nas ruas.',
    fullContent: {
      whatIsIt:
        'A enchente acontece quando chove muito e a água dos rios ou bueiros não consegue escorrer, subindo pelas ruas e casas.',
      whatToDoBefore: [
        'Ajude a manter as ruas limpas e nunca jogue lixo no chão ou nos bueiros.',
        'Guarde documentos e itens importantes em locais altos da casa.',
        'Conheça com seus pais o caminho mais seguro para um local alto no seu bairro.',
      ],
      whatToDoDuring: [
        'Avise imediatamente um adulto de confiança assim que a água começar a subir.',
        'Mantenha distância de aparelhos e fios molhados. Peça ajuda a um adulto; não tente desligá-los.',
        'Siga com um adulto as orientações oficiais para um local seguro. Não atravesse áreas alagadas nem volte para buscar objetos.',
      ],
      whatNeverToDo: [
        'NUNCA entre na água do alagamento! Ela pode ter sujeiras perigosas e buracos escondidos.',
        'Não tente atravessar enxurradas a pé ou brincar na água da chuva.',
        'Nunca toque em tomadas ou fios que estejam molhados.',
      ],
      adultRule:
        'REGRA DE OURO: Viu a água subindo? Chame os pais ou responsáveis e vá direto para um local seguro e alto!',
    },
    funFact:
      'Você sabia que apenas 15 centímetros de água corrente em alta velocidade já conseguem derrubar uma pessoa adulta? Por isso a água da enxurrada deve ser respeitada!',
    quizQuestion: {
      question: 'O que você deve fazer se a água da chuva começar a subir na rua da sua casa?',
      options: [
        'Ir brincar na água para tomar banho de chuva',
        'Avisar um adulto imediatamente e ir para um local alto e seguro',
        'Tentar pegar os brinquedos no quintal no meio da enxurrada',
      ],
      correctIndex: 1,
      explanation:
        'Isso mesmo! O mais seguro é avisar os adultos e ir para um lugar alto bem longe da água suja!',
    },
  },
  {
    id: 'deslizamentos',
    title: 'Deslizamentos em Morros',
    subtitle: 'Fique atento aos sinais que a terra nos dá!',
    category: 'deslizamentos',
    iconName: 'Mountain',
    colorTheme: 'from-amber-600 to-yellow-700',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
    shortSummary: 'Saiba reconhecer os sinais antes do barranco cair e proteja sua família.',
    fullContent: {
      whatIsIt:
        'Quando chove por muitos dias, a terra dos morros fica encharcada e pesada como uma lama, podendo deslizar montanha abaixo.',
      whatToDoBefore: [
        'Não jogue lixo nos barrancos do morro.',
        'Não corte árvores da encosta, pois as raízes seguram a terra firmemente!',
        'Acompanhe os alertas da Defesa Civil pelo celular dos seus pais.',
      ],
      whatToDoDuring: [
        'Fique atento a estalos na madeira da casa, rachaduras em paredes ou postes tortos.',
        'Se escutar barulho de lama descendo ou terra estalando, saia da casa com a família imediatamente.',
        'Ligue para a Defesa Civil no número 199.',
      ],
      whatNeverToDo: [
        'Nunca volte para pegar brinquedos ou móveis se houver risco de deslizamento.',
        'Não fique em casas perto de barrancos inclinados durante tempestades fortes.',
      ],
      adultRule:
        'REGRA DE OURO: Ao menor sinal de racha na parede ou estalo no morro, saia da casa com os adultos e ligue 199!',
    },
    funFact:
      'As raízes das árvores funcionam como redes de segurança invisíveis debaixo da terra que seguram os barrancos!',
    quizQuestion: {
      question: 'Qual destes é um sinal de que o morro pode deslizar?',
      options: [
        'O sol brilhar bem forte no céu',
        'Árvores e postes ficando tortos ou rachaduras nas paredes',
        'O barulho dos passarinhos cantando de manhã',
      ],
      correctIndex: 1,
      explanation:
        'Exatamente! Postes inclinados e rachaduras indicam que a terra está se movendo. Hora de avisar os pais e ir para um lugar seguro!',
    },
  },
  {
    id: 'tempestades',
    title: 'Tempestades e Raios',
    subtitle: 'Proteja-se do barulho dos trovões e da força dos raios!',
    category: 'tempestades',
    iconName: 'Zap',
    colorTheme: 'from-purple-600 to-indigo-700',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
    shortSummary: 'Dicas valiosas para ficar seguro dentro de casa durante chuvas de vento e raios.',
    fullContent: {
      whatIsIt:
        'Tempestades trazem ventos fortes, chuva pesada e descargas elétricas no céu chamas de raios com o som forte de trovões.',
      whatToDoBefore: [
        'Ao ver o céu muito escuro, entre para dentro de casa com seus bichinhos.',
        'Ajude seus pais a tirar da tomada aparelhos como TV, computador e videogames.',
        'Feche janelas e portas para o vento não quebrar nada.',
      ],
      whatToDoDuring: [
        'Fique protegido dentro de uma casa ou prédio fechado.',
        'Mantenha distância de janelas de vidro e portões de ferro.',
        'Se estiver no carro com seus pais, fiquem dentro do carro com os vidros fechados.',
      ],
      whatNeverToDo: [
        'NUNCA fique embaixo de árvores isoladas durante uma tempestade!',
        'Não use celular carregando na tomada enquanto cai raios.',
        'Não vá para praias, piscinas, campos de futebol ou áreas abertas.',
      ],
      adultRule:
        'REGRA DE OURO: Trovoada forte? Vá para dentro de casa, fique longe de janelas e aparelhos na tomada!',
    },
    funFact:
      'A luz do raio viaja super rápido! Por isso vemos o clarão do raio primeiro e só depois ouvimos o estrondo do trovão!',
    quizQuestion: {
      question: 'Onde é o lugar MAIS seguro para ficar durante uma tempestade com raios?',
      options: [
        'Embaixo de uma árvore bem alta num campo aberto',
        'Dentro da piscina ou no mar',
        'Dentro de casa ou prédio seguro, longe de janelas',
      ],
      correctIndex: 2,
      explanation:
        'Parabéns! Ficar dentro de casa é o lugar mais protegido do mundo contra raios!',
    },
  },
  {
    id: 'incendios',
    title: 'Incêndios e Queimadas',
    subtitle: 'Aprenda a evitar o fogo e a se proteger da fumaça!',
    category: 'incendios',
    iconName: 'Flame',
    colorTheme: 'from-orange-500 to-red-600',
    badgeBg: 'bg-red-100 text-red-800 border-red-300',
    shortSummary: 'Saiba como agir em caso de incêndio e por que nunca devemos soltar balões.',
    fullContent: {
      whatIsIt:
        'O incêndio é o fogo descontrolado em casas ou florestas que produz calor intenso e fumaça tóxica perigosa.',
      whatToDoBefore: [
        'Nunca brinque com fósforos, isqueiros, velas ou fogão.',
        'Ensine a todos que soltar balões é crime e causa incêndios florestais horríveis.',
      ],
      whatToDoDuring: [
        'Se houver fumaça no ambiente, caminhe bem abaixado (agachado), pois o ar limpo fica perto do chão.',
        'Cubra o nariz e a boca com um pano úmido ou camiseta para não respirar fumaça.',
        'Saia imediatamente da casa e vá para a rua.',
        'Ligue rápido para o Corpo de Bombeiros no número 193.',
      ],
      whatNeverToDo: [
        'Nunca se esconda debaixo da cama ou dentro do guarda-roupa em um incêndio.',
        'Não use elevador se houver incêndio num prédio (use sempre as escadas).',
        'Nunca volte para dentro de um local pegando fogo.',
      ],
      adultRule:
        'REGRA DE OURO: Viu fogo ou fumaça? Saia agachado da casa, chame os adultos e ligue 193!',
    },
    funFact:
      'A fumaça do fogo sobe porque o ar quente é mais leve. Por isso, ficar pertinho do chão ajuda a respirar ar mais limpo!',
    quizQuestion: {
      question: 'Se houver fumaça dentro de um cômodo em caso de incêndio, qual é a postura correta para sair?',
      options: [
        'Andar em pé pulando alto',
        'Ir engatinhando/abaixado perto do chão cobrindo o nariz com pano',
        'Se esconder dentro do armário trancado',
      ],
      correctIndex: 1,
      explanation:
        'Isso aí! O ar limpo fica embaixo perto do chão. Você agiu como um verdadeiro bombeiro mirim!',
    },
  },
  {
    id: 'prevencao',
    title: 'Prevenção e Mochila de Emergência',
    subtitle: 'Estar preparado torna qualquer criança um herói da segurança!',
    category: 'prevencao',
    iconName: 'Briefcase',
    colorTheme: 'from-emerald-500 to-teal-700',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    shortSummary: 'Monte um kit de emergência com sua família e saiba os números certos.',
    fullContent: {
      whatIsIt:
        'A prevenção é se preparar antes das coisas acontecerem. Ter uma mochila de emergência pronta economiza tempo precioso.',
      whatToDoBefore: [
        'Combine com sua família um ponto de encontro seguro caso fiquem sem sinal de celular.',
        'Deixe a mochila de emergência pronta num local fácil de pegar.',
        'Mantenha uma lista com os telefones dos seus pais e da Defesa Civil (199).',
      ],
      whatToDoDuring: [
        'Pegue a mochila de emergência ao sair de casa em um alerta de evacuação.',
        'Mantenha a calma e siga as instruções dos seus pais e agentes da Defesa Civil.',
      ],
      whatNeverToDo: [
        'Não encha a mochila com brinquedos pesados ou videogames; priorize o essencial.',
        'Nunca passe trote para os números de emergência (199, 193, 192, 190). Trote pode atrapalhar o resgate de quem precisa!',
      ],
      adultRule:
        'REGRA DE OURO: Decore o número 199 (Defesa Civil) e 193 (Bombeiros) e saiba o nome completo dos seus pais!',
    },
    funFact:
      'O apito de emergência é super útil no kit porque o som dele alcança muito mais longe do que gritar, gastando bem menos energia!',
    quizQuestion: {
      question: 'Qual destes itens NÃO deve ser prioridade na mochila de emergência?',
      options: [
        'Garrafa de água mineral e lanterna',
        'Videogame console grande e pesado',
        'Kit de primeiros socorros e apito',
      ],
      correctIndex: 1,
      explanation:
        'Excelente! O videogame é pesado e precisa de tomada. Na emergência o mais importante é água, lanterna e medicamentos!',
    },
  },
];
