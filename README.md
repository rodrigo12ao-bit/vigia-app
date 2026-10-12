# Vigia — Aprender com a Vigia

A versão local abre em **http://localhost:3000**. A demonstração usa contas fictícias, Firebase em emuladores e respostas de IA identificadas como simulações. Os avisos do INMET são consultados na fonte pública real. Voz ao vivo e transcrição real estão indisponíveis. O Escape permanece pausado; os arquivos e as trilhas anteriores foram preservados.

O visual usa azul, roxo, laranja e cartões coloridos. A navegação tem quatro áreas: **Início, Conversar, Aprender e Ajuda**. Em Aprender, oito cartões dão acesso direto a quatro missões, desafios, situações educativas, missão diária e trilhas anteriores. Todas essas atividades somam ao mesmo progresso, XP, níveis e conquistas. Atividades em família também dão XP após confirmação do responsável. Explicações têm níveis de leitura e opção de texto maior. Configurações e fontes ficam recolhidas até serem abertas.

Sons curtos, vibração leve e celebrações acompanham as atividades e podem ser desligados individualmente em **Sons, vibração e animações**. Os efeitos sonoros são locais e começam ao interagir. A vibração depende do aparelho e do navegador. Animações respeitam a preferência de movimento reduzido. Cada conta guarda suas próprias preferências. As estrelas anteriores são preservadas como XP; fases antigas entram no total sem conceder outra recompensa.

O painel escolar permite criar turmas, indicar atividades e acompanhar as habilidades de alunos vinculados. A entrada depende da aprovação do professor e do responsável. O painel familiar confirma atividades e revisa pedidos. Conversas privadas não aparecem no acompanhamento escolar. A atribuição de papéis reais depende de uma verificação externa; escolher o papel na tela não concede permissão.

Consulte o roteiro e os resultados da repaginação em [repaginacao-vigia.html](repaginacao-vigia.html). As etapas anteriores estão preservadas em [melhorias-vigia.html](melhorias-vigia.html) e [demonstracao-vigia.html](demonstracao-vigia.html), e a auditoria original em [auditoria-vgia-relatorio-e-plano.html](auditoria-vgia-relatorio-e-plano.html).

## Iniciar novamente nesta máquina

Abra terminais na pasta deste projeto. É necessário Node.js; o Java 21 e a ferramenta Firebase local estão em .tools/. Nenhuma chave de IA é necessária.

1. Primeiro terminal: `npm run emulators`; aguarde **All emulators ready** e mantenha aberto.
2. Segundo terminal: `npm run start:demo`; mantenha aberto.
3. Terceiro terminal: execute `npm run demo:seed`, `npm run demo:contacts` e `npm run demo:school`, nessa ordem.
4. Abra **http://localhost:3000**. Após alterações no código, execute `npm run build` antes do passo 2. Se o aplicativo instalado oferecer uma atualização, aceite para abrir a nova versão.

Os emuladores usam somente 127.0.0.1:8080 e 127.0.0.1:9099, no projeto fictício demo-vigia. Os dados são temporários: repita o passo 3 após reiniciá-los. A preparação preserva perfis e progresso já existentes. Se uma porta estiver ocupada, identifique o processo antes de encerrá-lo. Para desenvolvimento, use `npm run dev:demo` no lugar de start:demo.

## Contas fictícias

Todas usam a senha **DemoLocal!123**, somente no emulador:

| E-mail | Finalidade |
| --- | --- |
| demo-ana@example.invalid | Aurora — perfil infantil vinculado |
| demo-bruno@example.invalid | Sol — perfil infantil vinculado |
| demo-professor@example.invalid | Professor fictício — turma demonstrativa |
| demo-responsavel@example.invalid | Responsável fictício — aprovações e atividades em família |
| demo-terceiro@example.invalid | Conta sem vínculo — testes de negação |

## Verificações

`npm run build` inclui checagem de tipos. Testes: `npm test`, `npm run test:rules`, `npm run test:sala`, `npm run test:api`, `npm run test:school`, `npm run test:adventure`, `npm run test:browser`, `npm run test:innovation` e `npm run test:gamification`.

**test:rules usa o projeto isolado demo-vigia-rules e não limpa os dados da demonstração demo-vigia.** test:sala pressupõe uma preparação nova; para preparar uma apresentação, use demo:contacts. test:school e test:adventure usam suas próprias contas fictícias. Para os testes de navegador, prepare demo:seed, demo:contacts e demo:school; use o Chrome instalado em C:/Program Files/Google/Chrome/Application/chrome.exe. Resultados e capturas ficam em artifacts/.

O progresso das novas missões funciona offline após carregamento e sincroniza por conta quando a conexão retorna. Recompensas aguardando conexão são identificadas; o XP da conta só sobe após confirmação do servidor. Cada missão, fase ou desafio concluído conta uma vez; a missão diária recompensa uma vez por dia. Desafios e situações exigem a resposta correta e um comprovante exclusivo da conta. A sequência da missão diária antiga ainda é local por conta, sem sincronização entre dispositivos; seu XP confirmado faz parte do progresso comum. Fontes e explicações são educativas; o aplicativo não determina se uma situação real é segura.

Os relatórios locais acima descrevem as versões testadas antes da publicação. A etapa de publicação foi autorizada posteriormente, com IA simulada e um novo Firebase gratuito separado. Permanecem fora da validação: autenticação social real, dispositivos físicos e Safari, qualidade de voz real, auditoria completa com leitores de tela e avaliação pedagógica/jurídica especializada. A exclusão de conta implementada é restrita à demonstração; produção exige um processo de retenção aprovado. A verificação real de adultos, a revisão de vínculos/troca de turma e a operação contínua de moderação precisam de processo externo. As denúncias têm revisão manual, sem prazo garantido.

## Prévia online com IA simulada

Destino autorizado: **https://vigia-app.onrender.com**. O estado efetivo da publicação e os testes online ficam em `artifacts/publication-validation.json`; a presença deste endereço no README não confirma uma publicação concluída.

O novo projeto `vigia-aplicativo-7ba1a` usa o Firestore Standard gratuito, banco `(default)`, em São Paulo (`southamerica-east1`). O projeto anterior permanece intacto; contas e históricos antigos não são transferidos automaticamente. As senhas e contas da demonstração local não existem automaticamente na prévia online. Use apenas dados fictícios. Os responsáveis/professores precisam de verificação e vínculo pelo operador; o cadastro público não concede esses privilégios.

No Render, mantenha a instância Free, configure `npm ci --include=dev && npm run build:publication` como compilação e `npm run start:publication` como inicialização. As ferramentas de compilação são necessárias mesmo com `NODE_ENV=production`. As variáveis públicas e o caminho do arquivo privado estão descritos em `render.yaml`. Guarde a credencial do servidor exclusivamente em Secret Files como `firebase-service-account.json`; nunca no repositório, no pacote do navegador ou em relatórios. O servidor precisa apenas de `roles/datastore.user` no novo projeto; não recebe permissão para administrar usuários do Firebase.

`build:publication` gera os arquivos em `dist/publication/`, separado da demonstração local. A inicialização recusa emuladores, credenciais de outro projeto e IA real. `/api/status` deve informar `demo: true`, `localDemo: false`, `realAI: false`, `firebase: "cloud"`. Texto e imagem usam respostas educativas simuladas; voz ao vivo e transcrição permanecem indisponíveis. A prévia não deve receber dados reais de crianças.

<details><summary>Documentação original de geração (preservada; use as instruções de demonstração acima)</summary>

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/17c2ec98-07cf-42c9-83c2-78479b5ec7ae

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

</details>
