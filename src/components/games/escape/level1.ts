import { LevelData, TileData, HazardData, InteractiveSwitch, InteractiveGate } from './types';

// Helper to generate a matrix
const generateGrid = (width: number, height: number, fill: () => TileData | null): (TileData | null)[][] => {
  return Array.from({ length: height }, () => Array.from({ length: width }, fill));
};

// --------------------------------------------------
// PHASE 1: A TEMPESTADE COMEÇOU
// --------------------------------------------------
const p1Width = 22;
const p1Height = 18;
const p1Grid = generateGrid(p1Width, p1Height, () => ({ type: 'ground' }));

// Border walls
for (let x = 0; x < p1Width; x++) {
  p1Grid[0][x] = { type: 'wall' };
  p1Grid[p1Height - 1][x] = { type: 'wall' };
}
for (let y = 0; y < p1Height; y++) {
  p1Grid[y][0] = { type: 'wall' };
  p1Grid[y][p1Width - 1] = { type: 'wall' };
}

// Inner buildings / walls
for (let y = 4; y <= 8; y++) p1Grid[y][6] = { type: 'wall' };
for (let y = 10; y <= 14; y++) p1Grid[y][12] = { type: 'wall' };

// High ground elevation
for (let x = 16; x < 21; x++) {
  for (let y = 1; y < 6; y++) {
    p1Grid[y][x] = { type: 'highground' };
  }
}

// Items Phase 1
p1Grid[3][3] = {
  type: 'item',
  itemId: 'item_mochila',
  itemType: 'Mochila de Emergência',
  message: 'Mochila de Emergência coletada! Contém água potável, remédios e lanterna de emergência.'
};

p1Grid[15][4] = {
  type: 'item',
  itemId: 'item_medkit',
  itemType: 'Kit de Primeiros Socorros',
  message: 'Kit de Primeiros Socorros obtido! Use no menu para recuperar energia HP.'
};

p1Grid[12][2] = {
  type: 'item',
  itemId: 'item_lever',
  itemType: 'Alavanca do Disjuntor',
  message: 'Alavanca de Ferro obtida! Agora você pode encaixá-la no Disjuntor Geral para desligar a luz.'
};

p1Grid[16][16] = {
  type: 'item',
  itemId: 'item_flashlight',
  itemType: 'Lanterna Tática',
  message: 'Lanterna Tática coletada! Pressione F para iluminar áreas mais escuras.'
};

p1Grid[8][2] = {
  type: 'item',
  itemId: 'item_crowbar',
  itemType: 'Pé de Cabra',
  message: 'Pé de Cabra de resgate obtido! Útil para forçar portas travadas.'
};

// Gate blocking path to safezone at x=15, y=3
const p1Gates: InteractiveGate[] = [
  {
    id: 'gate_p1',
    x: 15 * 64,
    y: 3 * 64,
    w: 64,
    h: 128,
    isLocked: true,
    name: 'Portão Eletrônico do Abrigo',
    message: 'Portão trancado sem energia! Encontre a Alavanca e acione o Disjuntor Geral.'
  }
];

// Switch at x=10, y=15
const p1Switches: InteractiveSwitch[] = [
  {
    id: 'switch_p1',
    x: 10 * 64,
    y: 15 * 64,
    name: 'Disjuntor Geral de Energia',
    isActivated: false,
    requiredItemId: 'item_lever',
    targetGateId: 'gate_p1',
    targetHazardId: 'wire_p1',
    message: 'Alavanca encaixada! Energia elétrica desligada. Os fios na água não têm mais corrente e o portão do abrigo destravou!'
  }
];

const p1Hazards: HazardData[] = [
  {
    id: 'wire_p1',
    x: 10 * 64,
    y: 8 * 64,
    w: 128,
    h: 128,
    type: 'wire',
    message: 'PERIGO: Fio elétrico caído na água! Desligue o disjuntor para passar.',
    active: true,
    damage: 25
  },
  {
    id: 'water_p1',
    x: 4 * 64,
    y: 11 * 64,
    w: 192,
    h: 128,
    type: 'water',
    message: 'Água acumulada! Evite caminhar em enchentes.',
    active: true,
    damage: 10
  }
];

export const phase1: LevelData = {
  id: 'enchente_fase1',
  name: 'Fase 1: A Tempestade Começou',
  subtitle: 'Evite fios na água e desligue o disjuntor!',
  objective: 'Colete pelo menos 40 XP explorando a área antes de subir para o Abrigo Seguro!',
  width: p1Width * 64,
  height: p1Height * 64,
  gridSize: 64,
  startX: 2 * 64,
  startY: 2 * 64,
  tiles: p1Grid,
  hazards: p1Hazards,
  switches: p1Switches,
  gates: p1Gates,
  safeZone: { x: 18 * 64, y: 2 * 64, w: 128, h: 128 },
  vigiaTips: [
    {
      x: 5 * 64,
      y: 2 * 64,
      title: 'Dica do Vigia: Energia Elétrica',
      message: 'Nunca toque na água se houver fios caindo de postes! Vá até o disjuntor principal para cortar a corrente!'
    }
  ]
};

// --------------------------------------------------
// PHASE 2: A RUA PRINCIPAL ALAGOU
// --------------------------------------------------
const p2Width = 26;
const p2Height = 20;
const p2Grid = generateGrid(p2Width, p2Height, () => ({ type: 'ground' }));

// Border
for (let x = 0; x < p2Width; x++) {
  p2Grid[0][x] = { type: 'wall' };
  p2Grid[p2Height - 1][x] = { type: 'wall' };
}
for (let y = 0; y < p2Height; y++) {
  p2Grid[y][0] = { type: 'wall' };
  p2Grid[y][p2Width - 1] = { type: 'wall' };
}

// Torrent River Canal down column 12-13
for (let y = 1; y < 19; y++) {
  p2Grid[y][12] = { type: 'water' };
  p2Grid[y][13] = { type: 'water' };
}
// Bridge crossing at y=9, 10
p2Grid[9][12] = { type: 'ground' };
p2Grid[9][13] = { type: 'ground' };

// Pushable Crates in the water channel
p2Grid[4][12] = { type: 'crate' };
p2Grid[5][13] = { type: 'crate' };
p2Grid[7][12] = { type: 'crate' };

p2Grid[3][5] = {
  type: 'item',
  itemId: 'item_valve',
  itemType: 'Volante de Válvula',
  message: 'Volante da Válvula encontrado! Leve até a Tubulação de Drenagem para escoar a água da enchente.'
};

p2Grid[16][18] = {
  type: 'item',
  itemId: 'item_radio',
  itemType: 'Rádio a Pilha da Defesa Civil',
  message: 'Rádio a pilha obtido! Sintonize no canal 199 para ouvir alertas meteorológicos.'
};

const p2Gates: InteractiveGate[] = [
  {
    id: 'gate_p2',
    x: 12 * 64,
    y: 8 * 64,
    w: 128,
    h: 64,
    isLocked: true,
    name: 'Comporta de Contenção da Ponte',
    message: 'Comporta fechada pela pressão da água! Encontre o Volante da Válvula para drenar a enxurrada.'
  }
];

const p2Switches: InteractiveSwitch[] = [
  {
    id: 'valve_p2',
    x: 4 * 64,
    y: 16 * 64,
    name: 'Tubulação de Drenagem',
    isActivated: false,
    requiredItemId: 'item_valve',
    targetGateId: 'gate_p2',
    targetHazardId: 'current_p2',
    message: 'Volante instalado e girado! A água foi drenada com sucesso para os bueiros de vazão e a comporta abriu!'
  }
];

const p2Hazards: HazardData[] = [
  {
    id: 'current_p2',
    x: 11 * 64,
    y: 2 * 64,
    w: 192,
    h: 384,
    type: 'current',
    message: 'Correnteza forte! Abra a Válvula de Drenagem para diminuir a pressão.',
    active: true,
    damage: 20
  }
];

export const phase2: LevelData = {
  id: 'enchente_fase2',
  name: 'Fase 2: Enxurrada Urbana',
  subtitle: 'Drene a água antes de cruzar a ponte!',
  objective: 'Encontre a Válvula de Drenagem para abrir a Comporta da Ponte e atravessar com segurança!',
  width: p2Width * 64,
  height: p2Height * 64,
  gridSize: 64,
  startX: 2 * 64,
  startY: 10 * 64,
  tiles: p2Grid,
  hazards: p2Hazards,
  switches: p2Switches,
  gates: p2Gates,
  safeZone: { x: 21 * 64, y: 15 * 64, w: 128, h: 128 },
  vigiaTips: [
    {
      x: 7 * 64,
      y: 10 * 64,
      title: 'Dica do Vigia: Correnteza',
      message: 'Apenas 15cm de água em movimento rápido podem derrubar uma pessoa! Sempre busque rotas secas!'
    }
  ]
};

// --------------------------------------------------
// PHASE 3: ALERTA DE DESLIZAMENTO NA ENCOSTA
// --------------------------------------------------
const p3Width = 28;
const p3Height = 22;
const p3Grid = generateGrid(p3Width, p3Height, () => ({ type: 'ground' }));

// Border
for (let x = 0; x < p3Width; x++) {
  p3Grid[0][x] = { type: 'wall' };
  p3Grid[p3Height - 1][x] = { type: 'wall' };
}
for (let y = 0; y < p3Height; y++) {
  p3Grid[y][0] = { type: 'wall' };
  p3Grid[y][p3Width - 1] = { type: 'wall' };
}

// Mudslide area in middle
for (let y = 6; y <= 14; y++) {
  for (let x = 8; x <= 16; x++) {
    p3Grid[y][x] = { type: 'mud' };
  }
}

// Safe highground at top right
for (let y = 1; y <= 6; y++) {
  for (let x = 20; x < 27; x++) {
    p3Grid[y][x] = { type: 'highground' };
  }
}

p3Grid[3][3] = {
  type: 'item',
  itemId: 'item_keycard',
  itemType: 'Chaveiro da Defesa Civil',
  message: 'Chaveiro Mestre coletado! Abre a barreira da encosta.'
};

p3Grid[18][5] = {
  type: 'item',
  itemId: 'item_apito',
  itemType: 'Apito de Emergência',
  message: 'Apito de emergência obtido! Utilizado para emitir pedidos de socorro.'
};

const p3Gates: InteractiveGate[] = [
  {
    id: 'gate_p3',
    x: 20 * 64,
    y: 7 * 64,
    w: 128,
    h: 64,
    isLocked: true,
    requiredKeyId: 'item_keycard',
    name: 'Barreira da Encosta',
    message: 'Barreira trancada! Requer o Chaveiro da Defesa Civil.'
  }
];

const p3Hazards: HazardData[] = [
  {
    id: 'mud_p3',
    x: 8 * 64,
    y: 7 * 64,
    w: 512,
    h: 448,
    type: 'mud',
    message: 'Lamaçal de Deslizamento! Risco de escorregões e erosão. Contorne pela borda!',
    active: true,
    damage: 15
  }
];

export const phase3: LevelData = {
  id: 'deslizamento_fase3',
  name: 'Fase 3: Alerta na Encosta',
  subtitle: 'Cuidado com terrenos declivosos e barro instável!',
  objective: 'Encontre o Chaveiro da Defesa Civil no oeste, evite a lama do centro e suba a encosta!',
  width: p3Width * 64,
  height: p3Height * 64,
  gridSize: 64,
  startX: 2 * 64,
  startY: 18 * 64,
  tiles: p3Grid,
  hazards: p3Hazards,
  switches: [],
  gates: p3Gates,
  safeZone: { x: 22 * 64, y: 2 * 64, w: 128, h: 128 },
  vigiaTips: [
    {
      x: 3 * 64,
      y: 12 * 64,
      title: 'Dica do Vigia: Sinais de Deslizamento',
      message: 'Trincas nas paredes, inclinação de árvores e água barrenta brotando do morro são sinais de perigo iminente!'
    }
  ]
};

// --------------------------------------------------
// PHASE 4: O GRANDE ESCAPE COLETIVO
// --------------------------------------------------
const p4Width = 32;
const p4Height = 24;
const p4Grid = generateGrid(p4Width, p4Height, () => ({ type: 'ground' }));

// Border
for (let x = 0; x < p4Width; x++) {
  p4Grid[0][x] = { type: 'wall' };
  p4Grid[p4Height - 1][x] = { type: 'wall' };
}
for (let y = 0; y < p4Height; y++) {
  p4Grid[y][0] = { type: 'wall' };
  p4Grid[y][p4Width - 1] = { type: 'wall' };
}

// Helicopter pad highground
for (let y = 1; y <= 7; y++) {
  for (let x = 24; x < 31; x++) {
    p4Grid[y][x] = { type: 'highground' };
  }
}

p4Grid[4][4] = {
  type: 'item',
  itemId: 'item_masterkey',
  itemType: 'Cartão Mestre de Evacuação',
  message: 'Cartão Mestre obtido! Liberado acesso ao Heliporto de Resgate.'
};

const p4Gates: InteractiveGate[] = [
  {
    id: 'gate_p4',
    x: 24 * 64,
    y: 8 * 64,
    w: 128,
    h: 64,
    isLocked: true,
    requiredKeyId: 'item_masterkey',
    name: 'Acesso ao Heliporto',
    message: 'Portão do Heliporto trancado! Requer o Cartão Mestre de Evacuação.'
  }
];

const p4Switches: InteractiveSwitch[] = [
  {
    id: 'substation_p4',
    x: 16 * 64,
    y: 20 * 64,
    name: 'Transformador Central',
    isActivated: false,
    targetHazardId: 'power_hazard_p4',
    message: 'Transformador isolado com sucesso! Área da praça limpa de descargas elétricas!'
  }
];

const p4Hazards: HazardData[] = [
  {
    id: 'power_hazard_p4',
    x: 10 * 64,
    y: 10 * 64,
    w: 512,
    h: 384,
    type: 'wire',
    message: 'PERIGO EXTREMO: Subestação inundada! Desative o Transformador Central.',
    active: true,
    damage: 30
  }
];

export const phase4: LevelData = {
  id: 'resgate_fase4',
  name: 'Fase 4: Heliporto de Resgate',
  subtitle: 'A grande evacuação comunitária!',
  objective: 'Desative o Transformador Central, pegue o Cartão Mestre e chegue ao Heliporto de Resgate!',
  width: p4Width * 64,
  height: p4Height * 64,
  gridSize: 64,
  startX: 2 * 64,
  startY: 20 * 64,
  tiles: p4Grid,
  hazards: p4Hazards,
  switches: p4Switches,
  gates: p4Gates,
  safeZone: { x: 26 * 64, y: 2 * 64, w: 192, h: 192 },
  vigiaTips: [
    {
      x: 8 * 64,
      y: 20 * 64,
      title: 'Dica do Vigia: Ponto de Encontro',
      message: 'Em emergências municipais, dirija-se sempre aos pontos de apoio pré-definidos pela Defesa Civil (199)!'
    }
  ]
};

export const level1Phases = [phase1, phase2, phase3, phase4];
