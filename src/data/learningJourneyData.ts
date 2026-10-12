import { ModuleData, AccessoryItem } from '../types';

export const ACCESSORIES: AccessoryItem[] = [
  {
    id: 'helmet_gold',
    name: 'Capacete Dourado do Defensor',
    icon: '🪖',
    description: 'Capacete de ouro concedido aos protetores dedicados.',
    unlockRequirement: 'Complete o Módulo de Enchentes com 3 Estrelas',
    requiredXp: 100,
  },
  {
    id: 'badge_super_guard',
    name: 'Emblema de Super Guardião',
    icon: '🛡️',
    description: 'Medalha brilhante de honra da Defesa Civil.',
    unlockRequirement: 'Alcance o Nível 2 de Guardião',
    requiredXp: 200,
  },
  {
    id: 'flashlight_led',
    name: 'Lanterna Mágica de Led',
    icon: '🔦',
    description: 'Ilumina qualquer tempestade ou noite de emergência.',
    unlockRequirement: 'Conclua a Fase da Mochila de Emergência',
    requiredXp: 300,
  },
  {
    id: 'vest_elite',
    name: 'Colete Refletivo de Elite',
    icon: '🦺',
    description: 'Garante máxima visibilidade e proteção em qualquer abrigo.',
    unlockRequirement: 'Conclua 3 Módulos Completos',
    requiredXp: 500,
  },
  {
    id: 'cape_hero',
    name: 'Capa do Herói da Prevenção',
    icon: '🦸‍♂️',
    description: 'A capa oficial concedida aos Guardiões da Comunidade!',
    unlockRequirement: 'Conclua o Desafio Final',
    requiredXp: 800,
  },
];

export const MODULES_DATA: ModuleData[] = [
  {
    id: 'm1',
    title: 'Conhecendo os Riscos',
    subtitle: 'Aprenda a identificar perigos antes que eles aconteçam!',
    icon: '🔎',
    colorTheme: 'from-amber-500 to-orange-600',
    badgeTitle: 'Detetive de Riscos',
    levels: [
      {
        id: 'm1_l1',
        title: 'Detetive da Natureza',
        type: 'true_false',
        description: 'Descubra quais fenômenos da natureza precisam de atenção e cuidado.',
        xpReward: 30,
        content: {
          questions: [
            {
              statement: 'A Defesa Civil serve para proteger e orientar a população em emergências.',
              isTrue: true,
              explanation: 'Correto! A Defesa Civil (ligue 199) trabalha para prevenir e ajudar em desastres!',
            },
            {
              statement: 'É seguro brincar na rua durante uma tempestade muito forte com raios.',
              isTrue: false,
              explanation: 'Exato! Em tempestades devemos ficar abrigados dentro de casa longe de janelas!',
            },
            {
              statement: 'Avisar um adulto quando notar rachaduras na parede é um dever de segurança.',
              isTrue: true,
              explanation: 'Muito bem! Rachaduras podem indicar risco de deslizamento!',
            },
          ],
        },
      },
      {
        id: 'm1_l2',
        title: 'Onde Chamar Ajuda?',
        type: 'quiz_challenge',
        description: 'Teste seus conhecimentos sobre os números de emergência!',
        xpReward: 40,
        content: {
          questions: [
            {
              question: 'Qual o número de telefone gratuito da Defesa Civil?',
              options: ['199', '190', '192', '193'],
              correctIndex: 0,
              explanation: 'O 199 é o número direto da Defesa Civil para emergências de enchentes e deslizamentos!',
            },
            {
              question: 'Em caso de incêndio ou resgate, qual número devemos discar?',
              options: ['199', '193 (Bombeiros)', '100', '180'],
              correctIndex: 1,
              explanation: 'O 193 é o número dos Bombeiros, especialistas em apagar fogos e fazer resgates!',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'm2',
    title: 'Enchentes e Alagamentos',
    subtitle: 'Proteja-se das águas de chuvas fortes e enxurradas!',
    icon: '🌊',
    colorTheme: 'from-blue-500 to-cyan-600',
    badgeTitle: 'Guardião da Chuva',
    levels: [
      {
        id: 'm2_l1',
        title: 'Fase 1: Identifique os Perigos no Cenário',
        type: 'hazard_finder',
        description: 'Clique nas imagens do bairro para identificar o que é PERIGOSO e o que é SEGURO!',
        xpReward: 50,
        badgeRewardId: 'b_hazard_detective',
        badgeRewardTitle: 'Detetive de Perigos de Enchente',
        content: {
          scenarioTitle: 'Bairro no Início da Enchente',
          instructions: 'Encontre os 4 perigos perigosos e os 2 comportamentos seguros clicando nos ícones!',
          hotspots: [
            {
              id: 'h1',
              title: 'Criança Andando na Água de Alagamento',
              isHazard: true,
              icon: '🚶‍♂️🌊',
              explanation: 'PERIGO ABSOLUTO! A água de enchente esconde buracos de bueiros abertos, sujeira e doenças como leptospirose. Nunca entre na água!',
              praise: 'Você encontrou uma atitude perigosa! Água de enchente não é piscina!',
            },
            {
              id: 'h2',
              title: 'Lixo Entupindo o Bueiro da Rua',
              isHazard: true,
              icon: '🗑️🚫',
              explanation: 'PERIGO! O lixo jogado na rua entope os bueiros e faz a água subir muito mais rápido invadindo as casas!',
              praise: 'Excelente observação! Lixo deve ir sempre na lixeira!',
            },
            {
              id: 'h3',
              title: 'Fio Elétrico Desencapado na Poça',
              isHazard: true,
              icon: '⚡⚠️',
              explanation: 'PERIGO EXTREMO! Água conduz eletricidade. Um fio caído pode causar choque elétrico gravíssimo!',
              praise: 'Atenção nota mil! Fios elétricos e água são uma combinação perigosa!',
            },
            {
              id: 'h4',
              title: 'Carro Tentando Atravessar a Enxurrada',
              isHazard: true,
              icon: '🚗🌊',
              explanation: 'PERIGO! A força da enxurrada pode arrastar até caminhões. Nunca tente atravessar ruas alagadas de carro ou a pé!',
              praise: 'Mandou bem! Ninguém deve desafiar a força da enxurrada!',
            },
            {
              id: 'h5',
              title: 'Família em Local Seguro com um Adulto',
              isHazard: false,
              icon: '🏠🎒',
              explanation: 'Procure com um adulto um local seguro indicado pela Defesa Civil, fora da área de risco. Não atravesse alagamentos nem volte para buscar objetos. Se a saída estiver perigosa, peça socorro.',
              praise: 'Muito bem! Essa é uma atitude nota 10 de prevenção!',
            },
            {
              id: 'h6',
              title: 'Adulto Ligando 199 para Defesa Civil',
              isHazard: false,
              icon: '📞🛡️',
              explanation: 'ATITUDE EXCELENTE! Avisar a Defesa Civil no 199 ajuda a trazer o socorro rápido para a comunidade!',
              praise: 'Parabéns! Chamar ajuda pelo 199 salva vidas!',
            },
          ],
        },
      },
      {
        id: 'm2_l2',
        title: 'Fase 2: Escolha o Caminho Seguro',
        type: 'path_choice',
        description: 'Guie Caio e Bia pelo caminho correto até o Ponto de Apoio seguro!',
        xpReward: 50,
        content: {
          scenarios: [
            {
              stepTitle: 'Etapa 1: A água da chuva começou a subir rápido na calçada...',
              question: 'Qual caminho Caio e Bia devem escolher para seguir com segurança?',
              options: [
                {
                  text: 'Entrar pelo atalho do túnel da rua de baixo que parece mais curto.',
                  isSafe: false,
                  feedback: 'Cuidado! Túneis e passagens subterrâneas enchem de água muito rápido e podem prender as pessoas. Vamos escolher a rota alta!',
                },
                {
                  text: 'Subir pela ladeira iluminada em direção ao segundo andar da escola.',
                  isSafe: true,
                  feedback: 'Sensacional! Caminhos elevados e altos são sempre as opções mais seguras nas chuvas!',
                },
              ],
            },
            {
              stepTitle: 'Etapa 2: Na metade do caminho, há um rio transbordando perto da ponte baixa...',
              question: 'Como a dupla deve proceder?',
              options: [
                {
                  text: 'Usar a passarela oficial elevada e longe da margem do rio.',
                  isSafe: true,
                  feedback: 'Excelente escolha! Ficar longe de margens de rios cheios evita quedas e acidentes!',
                },
                {
                  text: 'Tentar correr pela ponte baixa que já tem água cobrindo os pés.',
                  isSafe: false,
                  feedback: 'Nunca atravesse pontes onde a água já cobriu o piso. A estrutura pode estar enfraquecida!',
                },
              ],
            },
            {
              stepTitle: 'Etapa 3: Chegando perto do abrigo, o vento sopra forte com enxurrada na rua...',
              question: 'O que fazer agora?',
              options: [
                {
                  text: 'Correr no meio da rua para pegar a bola de futebol que caiu.',
                  isSafe: false,
                  feedback: 'Bens materiais podem ser substituídos, sua vida e segurança não! Esqueça a bola e busque abrigo!',
                },
                {
                  text: 'Entrar no Ponto de Apoio elevado junto com os adultos e aguardar.',
                  isSafe: true,
                  feedback: 'Parabéns! Você concluiu o caminho com 100% de segurança!',
                },
              ],
            },
          ],
        },
      },
      {
        id: 'm2_l3',
        title: 'Fase 3: Organize a Sequência Correta',
        type: 'sequence_order',
        description: 'Coloque as atitudes de prevenção na ordem exata de segurança!',
        xpReward: 50,
        content: {
          title: 'Sequência de Ação em Alagamentos',
          instruction: 'Clique nas frases na ordem certa (do 1º ao 4º passo):',
          correctSequence: [
            '1. Perceber que a chuva é forte e a água começou a acumular no quintal.',
            '2. Avisar imediatamente um adulto de confiança da casa.',
            '3. Desligar aparelhos elétricos com ajuda do adulto e pegar a mochila de emergência.',
            '4. Subir com a família para o local mais alto e seguro até a chuva passar.',
          ],
        },
      },
      {
        id: 'm2_l4',
        title: 'Fase 4: Monte uma Mochila de Emergência',
        type: 'backpack_builder',
        description: 'Escolha os itens essenciais para levar na mochila de resgate em enchentes!',
        xpReward: 60,
        badgeRewardId: 'b_backpack_master',
        badgeRewardTitle: 'Mestre da Mochila',
        content: {
          maxItems: 6,
          requiredEssentialsCount: 5,
          items: [
            { id: 'water', name: 'Garrafa de Água Potável', isEssential: true, icon: '💧', desc: 'Fundamental para manter a hidratação.' },
            { id: 'light', name: 'Lanterna com Pilhas Extras', isEssential: true, icon: '🔦', desc: 'Essencial se faltar luz à noite.' },
            { id: 'whistle', name: 'Apito de Resgate', isEssential: true, icon: '🔊', desc: 'Serve para fazer sinal sonoro e chamar ajuda.' },
            { id: 'first_aid', name: 'Kit Primeiros Socorros', isEssential: true, icon: '🩹', desc: 'Para curativos e remédios essenciais.' },
            { id: 'docs', name: 'Documentos em Sacola Plástica', isEssential: true, icon: '📄', desc: 'Protege seus documentos da água.' },
            { id: 'clothes', name: 'Muda de Roupa Seca', isEssential: true, icon: '👕', desc: 'Evita a hipotermia e o frio.' },
            { id: 'game', name: 'Videogame de Mesa Pesado', isEssential: false, icon: '🎮', desc: 'Muito pesado e precisa de tomada. Não leve!' },
            { id: 'glass', name: 'Jarro de Vidro Frágil', isEssential: false, icon: '🏺', desc: 'Pode quebrar e causar cortes perigosos.' },
            { id: 'bear', name: 'Urso de Pelúcia Gigante', isEssential: false, icon: '🧸', desc: 'Ocupa todo o espaço e absorve água.' },
          ],
        },
      },
      {
        id: 'm2_l5',
        title: 'Fase 5: História Interativa - O Resgate do Guardião',
        type: 'interactive_story',
        description: 'Tome decisões estratégicas nesta aventura de tempestade!',
        xpReward: 70,
        badgeRewardId: 'b_rain_guardian',
        badgeRewardTitle: 'Guardião da Chuva',
        content: {
          storyTitle: 'A Aventura de Sofia e o Rio Transbordante',
          nodes: {
            start: {
              text: 'Sofia está em casa estudando quando ouve trovões bem altos. Da janela, ela vê que o riacho do bairro está enchendo muito rápido e a água começou a entrar pelo portão.',
              question: 'O que Sofia deve fazer primeiro?',
              choices: [
                {
                  text: 'Gritar para a vovó, pegar a mochila de emergência e ir para o segundo andar.',
                  nextScenario: 'high_ground',
                  isCorrect: true,
                  feedback: 'Atitude perfeita! Avisar um adulto e buscar abrigo alto é prioridade!',
                },
                {
                  text: 'Pegar uma caneca e tentar tirar a água do quintal sozinha.',
                  nextScenario: 'retry_start',
                  isCorrect: false,
                  feedback: 'A água do rio sobe muito mais rápido do que podemos baldeá-la. A segurança vem primeiro!',
                },
              ],
            },
            high_ground: {
              text: 'No segundo andar com a vovó, elas veem que a água na rua já passou do joelho. A vovó pergunta qual telefone ligar para avisar a Defesa Civil do município.',
              question: 'Qual o número que Sofia deve indicar para a vovó?',
              choices: [
                {
                  text: 'Discar 199 para a Defesa Civil.',
                  nextScenario: 'rescue_arrival',
                  isCorrect: true,
                  feedback: 'Exato! O 199 aciona a equipe da Defesa Civil imediatamente!',
                },
                {
                  text: 'Discar 000 ou 100.',
                  nextScenario: 'retry_phone',
                  isCorrect: false,
                  feedback: 'Lembre-se: O número da Defesa Civil é 199!',
                },
              ],
            },
            rescue_arrival: {
              text: 'Pouco tempo depois, a equipe da Defesa Civil chega em um barco inflável seguro para remover as pessoas da área de risco. O socorrista oferece coletes salvas-vidas.',
              question: 'Como Sofia deve agir ao subir no barco?',
              choices: [
                {
                  text: 'Vestir o colete, sentar calmamente e obedecer os bombeiros.',
                  nextScenario: 'victory',
                  isCorrect: true,
                  feedback: 'Incrível! Você demonstrou maturidade e ajudou a salvar o dia!',
                },
                {
                  text: 'Tentar ficar em pé no barco tirando fotos com o celular.',
                  nextScenario: 'retry_boat',
                  isCorrect: false,
                  feedback: 'Em barcos de resgate devemos ficar sentados de colete sem fazer movimentos bruscos!',
                },
              ],
            },
          },
        },
      },
    ],
  },
  {
    id: 'm3',
    title: 'Tempestades e Raios',
    subtitle: 'Proteja-se de raios, ventanias e raios assustadores!',
    icon: '⚡',
    colorTheme: 'from-purple-600 to-indigo-700',
    badgeTitle: 'Protetor dos Raios',
    levels: [
      {
        id: 'm3_l1',
        title: 'Raio X do Raio',
        type: 'true_false',
        description: 'Verdadeiro ou Falso sobre como se proteger de raios!',
        xpReward: 40,
        content: {
          questions: [
            {
              statement: 'Durante uma tempestade, é seguro se abrigar debaixo de uma árvore alta isolada.',
              isTrue: false,
              explanation: 'Falso! Árvores altas atraem raios! Nunca fique debaixo de árvores em tempestades!',
            },
            {
              statement: 'Devemos retirar os aparelhos eletrônicos da tomada durante tempestades com raios.',
              isTrue: true,
              explanation: 'Verdadeiro! O raio pode viajar pelos fios elétricos e queimar os aparelhos!',
            },
            {
              statement: 'Estar dentro de um carro de janelas fechadas é um abrigo seguro contra raios.',
              isTrue: true,
              explanation: 'Verdadeiro! A estrutura metálica do carro conduz a eletricidade por fora até o chão (Gaiola de Faraday)!',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'm4',
    title: 'Deslizamentos e Morros',
    subtitle: 'Observe os sinais do solo e previna acidentes em morros!',
    icon: '⛰️',
    colorTheme: 'from-amber-700 to-yellow-800',
    badgeTitle: 'Guardião dos Morros',
    levels: [
      {
        id: 'm4_l1',
        title: 'Sinais de Perigo no Morro',
        type: 'quiz_challenge',
        description: 'Aprenda a reconhecer os alertas da natureza no morro!',
        xpReward: 40,
        content: {
          questions: [
            {
              question: 'Qual destes é um sinal claro de risco de deslizamento de terra no morro?',
              options: [
                'Árvores e postes inclinados com rachaduras no chão',
                'Pássaros cantando na árvore',
                'Sol brilhando forte',
                'Grama verdinha e sem barranco',
              ],
              correctIndex: 0,
              explanation: 'Árvores ou postes inclinados e barrancos estalando indicam que a terra está se movendo!',
            },
            {
              question: 'O que fazer ao ouvir barulhos de estalos no morro durante a chuva?',
              options: [
                'Sair imediatamente com a família para um abrigo seguro e ligar 199',
                'Continuar dormindo com a janela fechada',
                'Ir jogar água com a mangueira no barranco',
                'Esperar até o dia seguinte',
              ],
              correctIndex: 0,
              explanation: 'Estalos indicam movimento do solo. Saia na hora para abrigo seguro e avise a Defesa Civil no 199!',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'm5',
    title: 'Incêndios e Casa Segura',
    subtitle: 'Inspeção de perigos domésticos, fogo e fumaça!',
    icon: '🏠',
    colorTheme: 'from-red-500 to-amber-600',
    badgeTitle: 'Mestre do Lar Seguro',
    levels: [
      {
        id: 'm5_l1',
        title: 'Fase 1: Inspeção da Casa Segura',
        type: 'home_safety',
        description: 'Examine os cômodos da casa e encontre os riscos elétricos, fogo e calhas!',
        xpReward: 50,
        badgeRewardId: 'b_home_inspector',
        badgeRewardTitle: 'Inspector da Casa Segura',
        content: {},
      },
      {
        id: 'm5_l2',
        title: 'Fase 2: Ação na Fumaça',
        type: 'true_false',
        description: 'Sabe o que fazer se houver fumaça no ambiente?',
        xpReward: 40,
        content: {
          questions: [
            {
              statement: 'Se houver fumaça no corredor, devemos andar abaixados (agachados) perto do chão.',
              isTrue: true,
              explanation: 'Verdadeiro! O ar limpo e frio fica mais perto do chão, enquanto a fumaça quente sobe!',
            },
            {
              statement: 'Brincar com fósforos, velas e fogos de artifício é uma brincadeira divertida.',
              isTrue: false,
              explanation: 'Falso! Fogo não é brinquedo e pode causar queimaduras graves e grandes incêndios!',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'm6',
    title: 'Mochila de Emergência',
    subtitle: 'Esteja sempre preparado para qualquer imprevisto!',
    icon: '🎒',
    colorTheme: 'from-emerald-600 to-teal-700',
    badgeTitle: 'Mestre da Mochila',
    levels: [
      {
        id: 'm6_l1',
        title: 'Checklist do Guardião',
        type: 'backpack_builder',
        description: 'Monte a mochila ideal de sobrevivência preventiva!',
        xpReward: 50,
        content: {
          maxItems: 6,
          requiredEssentialsCount: 5,
          items: [
            { id: 'water', name: 'Garrafa de Água Potável', isEssential: true, icon: '💧', desc: 'Hidratação básica.' },
            { id: 'flashlight', name: 'Lanterna Recarregável', isEssential: true, icon: '🔦', desc: 'Iluminação essencial.' },
            { id: 'radio', name: 'Rádio Portátil a Pilhas', isEssential: true, icon: '📻', desc: 'Para ouvir alertas da Defesa Civil.' },
            { id: 'firstaid', name: 'Ataduras e Remédios', isEssential: true, icon: '🩹', desc: 'Cuidados de saúde.' },
            { id: 'food', name: 'Alimentos Não Perecíveis', isEssential: true, icon: '🍞', desc: 'Barras de cereal e enlatados.' },
            { id: 'whistle', name: 'Apito Forte', isEssential: true, icon: '🔊', desc: 'Sinalizador sonoro.' },
            { id: 'tv', name: 'Televisão de 50 polegadas', isEssential: false, icon: '📺', desc: 'Impossível carregar na mochila!' },
          ],
        },
      },
    ],
  },
  {
    id: 'm7',
    title: 'Central de Emergência e Telefones',
    subtitle: 'Aprenda quando chamar 199, 193, 192 e como pedir ajuda!',
    icon: '☎️',
    colorTheme: 'from-indigo-500 to-blue-700',
    badgeTitle: 'Operador de Emergências',
    levels: [
      {
        id: 'm7_l1',
        title: 'Fase 1: Despacho na Central de Emergência',
        type: 'emergency_central',
        description: 'Atenda aos chamados e decida se deve acionar a Defesa Civil (199), Bombeiros (193) ou SAMU (192)!',
        xpReward: 60,
        badgeRewardId: 'b_emergency_dispatcher',
        badgeRewardTitle: 'Especialista em Emergências',
        content: {},
      },
      {
        id: 'm7_l2',
        title: 'Fase 2: A Rota de Fuga da Escola',
        type: 'quiz_challenge',
        description: 'Como agir nos treinos de simulação na escola?',
        xpReward: 40,
        content: {
          questions: [
            {
              question: 'Durante uma simulação de evacuação de emergência na escola, como os alunos devem caminhar?',
              options: [
                'Em fila organizada, sem correr, sem empurrar e ouvindo os professores',
                'Correndo desesperadamente gritando',
                'Voltando para a sala para pegar a mochila de rodinha',
                'Saindo para brincar no pátio molhado',
              ],
              correctIndex: 0,
              explanation: 'Em evacuações, calma e organização evitam quedas e garantem a saída de todos!',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'm8',
    title: 'Desafio Final: Guardião da Prevenção',
    subtitle: 'O teste supremo de sabedoria e coragem da Defesa Civil!',
    icon: '🏆',
    colorTheme: 'from-amber-500 via-orange-500 to-red-600',
    badgeTitle: 'Guardião da Prevenção',
    levels: [
      {
        id: 'm8_l1',
        title: 'O Grande Quiz do Guardião Supremo',
        type: 'quiz_challenge',
        description: 'Prove que você domina todos os conceitos de prevenção!',
        xpReward: 100,
        badgeRewardId: 'b_supreme_guardian',
        badgeRewardTitle: 'Guardião da Prevenção Supremo',
        content: {
          questions: [
            {
              question: 'Qual o telefone da Defesa Civil para relatar emergências de chuva e enchentes?',
              options: ['199', '190', '193', '192'],
              correctIndex: 0,
              explanation: '199 é o canal oficial da Defesa Civil!',
            },
            {
              question: 'Qual a regra número 1 de segurança para crianças em qualquer risco?',
              options: [
                'Avisar e procurar imediatamente um adulto de confiança',
                'Tentar resolver o perigo sozinho',
                'Gravar vídeos para a internet',
                'Esconder-se debaixo da cama em silêncio sem avisar ninguém',
              ],
              correctIndex: 0,
              explanation: 'Sempre avise um adulto de confiança! Eles sabem como agir e proteger você!',
            },
            {
              question: 'O que devemos colocar na mochila de emergência?',
              options: [
                'Água potável, lanterna, apito, remédios e documentos',
                'Brinquedos de vidro, pratos finos e pedra',
                'Televisão e computadores pesados',
                'Apenas doces e refrigerantes',
              ],
              correctIndex: 0,
              explanation: 'Mochila de emergência carrega o essencial para saúde e sobrevivência!',
            },
          ],
        },
      },
    ],
  },
];
