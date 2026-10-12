export type ReadingLevel='basic'|'standard'|'advanced';
export interface MissionQuestion {id:string;scene:'flood'|'storm'|'home';question:string;simple:string;options:string[];correctIndex:number;explanation:string;}
export interface MissionItem {id:string;name:string;icon:string;essential:boolean;explanation:string;}
export interface Mission {
  id:string;title:string;shortTitle:string;description:string;simple:string;skill:string;icon:string;minutes:number;
  type:'hazard'|'choice'|'kit'|'order';questions?:MissionQuestion[];items?:MissionItem[];
  steps?:{id:string;text:string}[];explanation?:string;source:{title:string;url:string};reward:number;
}
const source={title:'Defesa Civil — prevenção em chuvas intensas',url:'https://www.gov.br/mdr/pt-br/noticias/conheca-medidas-de-autoprotecao-que-a-populacao-deve-tomar-em-casos-de-chuvas-intensas'};
export const LEARNING_MISSIONS:Mission[]=[
 {id:'perigos',title:'Reconheça os perigos',shortTitle:'Perigos',description:'Observe três situações e descubra como se proteger.',simple:'Veja a cena. Ela é segura?',skill:'Reconhece perigos em enchentes',icon:'🔎',minutes:3,type:'hazard',reward:20,source,questions:[
  {id:'water',scene:'flood',question:'Uma criança quer atravessar a rua alagada. Essa atitude é segura?',simple:'Pode entrar na água da enchente?',options:['É perigoso','É seguro'],correctIndex:0,explanation:'A água pode esconder buracos, correnteza e fios. Fique longe dela e avise um adulto.'},
  {id:'wire',scene:'home',question:'Há um fio caído perto de uma poça. Aproximar-se é seguro?',simple:'Pode chegar perto do fio caído?',options:['É perigoso','É seguro'],correctIndex:0,explanation:'Mantenha distância. Não toque no fio, na água ou em objetos próximos. Peça ajuda a um adulto.'},
  {id:'adult',scene:'storm',question:'A criança fica abrigada e chama um adulto quando a tempestade começa. É uma atitude segura?',simple:'Ficar abrigado e chamar um adulto é seguro?',options:['É perigoso','É seguro'],correctIndex:1,explanation:'Fique em um abrigo seguro, longe de janelas, e siga as orientações do adulto e da Defesa Civil.'}
 ]},
 {id:'mochila',title:'Prepare sua mochila',shortTitle:'Mochila',description:'Escolha os itens de um exemplo de mochila com a ajuda de um adulto.',simple:'O que vamos levar na mochila?',skill:'Seleciona itens básicos de preparação',icon:'🎒',minutes:4,type:'kit',reward:20,source,items:[
  {id:'water',name:'Água',icon:'💧',essential:true,explanation:'Um adulto deve separar água potável em quantidade adequada para a família.'},
  {id:'light',name:'Lanterna',icon:'🔦',essential:true,explanation:'Uma lanterna com pilhas ajuda quando falta luz. Confira com um adulto.'},
  {id:'documents',name:'Cópias de documentos',icon:'📁',essential:true,explanation:'Um adulto pode proteger cópias dos documentos. Não envie documentos ao aplicativo.'},
  {id:'personal',name:'Itens pessoais necessários',icon:'🧼',essential:true,explanation:'A família combina os itens de higiene e necessidades individuais. Medicamentos ficam sob cuidado do responsável.'},
  {id:'console',name:'Videogame grande',icon:'🎮',essential:false,explanation:'Objetos grandes de lazer ocupam espaço. Priorize as necessidades combinadas com um adulto.'},
  {id:'glass',name:'Vaso de vidro',icon:'🏺',essential:false,explanation:'Vidro pode quebrar e machucar. Não é um item para essa mochila.'}
 ],explanation:'Este é um exemplo educativo. Um adulto adapta a mochila às necessidades da família e às orientações locais.'},
 {id:'atitude',title:'Escolha uma atitude segura',shortTitle:'Atitudes',description:'Acompanhe Lia em uma história curta e ajude nas escolhas.',simple:'Vamos ajudar Lia?',skill:'Escolhe atitudes seguras em uma tempestade',icon:'🛡️',minutes:3,type:'choice',reward:20,source,questions:[
  {id:'shelter',scene:'storm',question:'Lia está em um local seguro e percebe uma tempestade. O que faz?',simple:'A tempestade começou. O que Lia faz?',options:['Fica abrigada e avisa um adulto','Sai para brincar na chuva','Vai olhar os fios da rua'],correctIndex:0,explanation:'Fique em local seguro e peça orientação a um adulto. Não se aproxime de fios ou áreas expostas.'},
  {id:'route',scene:'flood',question:'Um caminho está alagado. Como Lia deve agir?',simple:'O caminho tem água de enchente. E agora?',options:['Espera em local seguro e pede ajuda','Atravessa devagar','Segue o carro que passou'],correctIndex:0,explanation:'Não atravesse áreas alagadas. Com um adulto, procure orientação oficial para uma saída segura.'},
  {id:'help',scene:'home',question:'Lia percebe um perigo real. Quem deve ajudar?',simple:'Há perigo. Quem pode ajudar?',options:['Um adulto e os serviços de emergência','Ela precisa resolver sozinha','Ela volta para buscar brinquedos'],correctIndex:0,explanation:'Peça ajuda a um adulto. Em emergência, um adulto pode chamar a Defesa Civil (199) ou os Bombeiros (193).'}
 ]},
 {id:'passos',title:'Organize os passos',shortTitle:'Preparação',description:'Organize uma preparação preventiva feita com um adulto.',simple:'O que fazemos primeiro?',skill:'Organiza uma preparação com um adulto',icon:'🧩',minutes:3,type:'order',reward:20,source,
  steps:[{id:'adult',text:'Conversar com um adulto sobre a preparação'},{id:'official',text:'Consultar orientações oficiais para a região'},{id:'kit',text:'Conferir a mochila e as necessidades da família'},{id:'review',text:'Revisar o combinado juntos'}],explanation:'Esses passos são para preparação preventiva. Em perigo real, priorize afastar-se com segurança e pedir ajuda.'}
];
export const FAMILY_MISSIONS=[
 {id:'lanterna',title:'Confira uma lanterna',steps:['Peça a um adulto para acompanhar.','Confiram se a lanterna funciona e onde ficará guardada.','Combinem quem deve ser chamado quando faltar luz.'],skill:'Prepara-se para falta de luz com supervisão'},
 {id:'mochila',title:'Conversem sobre a mochila',steps:['Convide um adulto para conversar.','Revisem os itens necessários para a família.','Combinem um lugar acessível para guardar a mochila.'],skill:'Participa de uma preparação em família'},
 {id:'ajuda',title:'Combine como pedir ajuda',steps:['Escolha com um responsável um adulto de confiança.','Conversem sobre como pedir ajuda em uma emergência.','Revisem os números 199 e 193, sem fazer uma ligação de teste.'],skill:'Sabe a quem pedir ajuda'}
] as const;
