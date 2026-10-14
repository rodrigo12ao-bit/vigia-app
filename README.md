# Vigia — Aprender com a Vigia

## Versão atual: Gemini real gratuito, acesso 18+

Atualização de Conversa (14/10/2026): a sessão ao vivo usa **Gemini 3.8 Live**, voz Aoede, em vez de esperar transcrição, resposta textual e síntese separadas. O tom é mais acolhedor e breve, com sugestões úteis para continuar. Volume, pausa do microfone, interrupção e retomada controlam os recursos reais. O áudio só é liberado após transcrição e geração completas verificadas; emergências mantêm ajuda oficial. A primeira tela carrega antes dos módulos de conta/atividades; arquivos versionados usam cache persistente. Serviços pagos seguem bloqueados.

O público aprovado pelo proprietário é **18 anos ou mais**. A identidade visual, as atividades e a gamificação foram preservadas; somente acesso, consentimento, linguagem de público e permissões próprias foram ajustados. Chat, imagens e voz usam Gemini real. Serviços pagos continuam bloqueados e não há respostas prontas como substituição de uma falha do fornecedor.

A versão local testada abre em **http://localhost:3001/**. Mantenha os emuladores iniciados com `npm run emulators`, compile com `npm run build:presentation` e execute `npm run start:gemini`. Nesta máquina a chave existente fica em `.env` e sua verificação de projeto gratuito fica em `.tools/gemini/free-tier.json`; ambos são privados e ignorados pelo Git. A voz ao vivo permite interrupção por fala ou pelo botão, com cancelamento de respostas parciais. Gravações curtas de mensagem e leitura de texto mantêm os adaptadores anteriores. Se aparecer “Nova versão!”, use “Atualizar Agora” para atualizar a instalação preservando os dados.

Consulte [vigia-gemini-validacao.html](vigia-gemini-validacao.html) para roteiro, resultados positivos, falhas anteriores e limites. Passaram **86 verificações automatizadas locais**, **18 de interface local** e **2 de voz real local** com áudio sintético de adulto. Na publicação, passaram **32 verificações adicionais**: 10 de Firebase/permissões, 20 de interface em desktop/celular emulado e 2 de voz real, incluindo armazenamento da entrada/resposta no histórico e limpeza dos recursos. Compilação de apresentação, publicação e checagem final de tipos passaram. A auditoria das dependências de produção informou zero vulnerabilidades. Celular físico, Safari e microfone físico não foram testados.

Para reproduzir a avaliação: `npm test`, `npm run test:real-ai`, `npm run test:rules`, `npm run test:publication` e `node tests/adult-api.cjs` não fazem chamadas ao fornecedor real. `node --use-system-ca tests/gemini-real-api.cjs` usa a cota gratuita e gera as ilustrações/gravações fictícias para `tests/gemini-browser.cjs` e `tests/gemini-voice-browser.cjs`. Os testes de navegador exigem as contas adultas fictícias do emulador e o Chrome instalado; os acessos de demonstração não são contas de produção.

Publicado em **https://vigia-app.onrender.com/** com Gemini real e Firebase cloud. A revisão do aplicativo no Render é `d5140fd2b8be0b6c962367247d4112dd792174b5`, publicação `dep-db6r00ou01pc73b8c3r0`, de 13/10/2026. Texto, imagens e transcrição usam Gemini 3.5 Flash-Lite; voz usa Gemini 3.8 Flash-Lite TTS, estável e verificado na modalidade gratuita. O roteiro foi validado no Chrome em desktop e celular emulado; confira microfone/aparelho físico antes de apresentar. A chave Gemini já existente no Render foi verificada, com autorização específica, e corresponde ao projeto gratuito testado. Nenhum faturamento foi ativado.

`build:publication` gera `dist/publication/`. O modo `adult-live` exige Firebase cloud, origem HTTPS explícita, audiência `18plus`, fornecedor `gemini`, chave privada correspondente ao projeto gratuito verificado e `AI_COST_AUTHORIZED=false`. Veja `render.yaml`; chaves nunca entram em variáveis `VITE_`, Git ou relatórios. A chave privada do Firebase permanece no Secret Files existente, somente com acesso ao novo banco. Publicação automática permanece desligada. Alterações posteriores somente nos testes/relatório não modificam o aplicativo publicado.

A modalidade gratuita do Google pode usar o conteúdo para melhoria e revisão humana: não envie dados pessoais, confidenciais ou conteúdo de menores. As cotas podem interromper chamadas; Render Free pode demorar a iniciar após inatividade. O sistema informa indisponibilidade, sem ativar faturamento ou fornecedor pago. A declaração de idade não verifica identidade nem concede papel escolar; docentes dependem de verificação externa. A exclusão integral de conta online ainda exige processo de retenção. Consulte os [termos](https://ai.google.dev/gemini-api/terms) e [preços/modalidades](https://ai.google.dev/gemini-api/docs/pricing) oficiais.

As seções abaixo descrevem etapas anteriores e estão preservadas como histórico. OpenAI pago e o protótipo de IA local estão inativos; suas restrições não devem ser confundidas com o modo Gemini atual.

## Integrações reais — avaliação local, ainda não liberada

A edição mais recente de avaliação abre em **http://localhost:3001**. Chat, análise de imagens, transcrição e voz têm um caminho real pela API OpenAI, sem respostas prontas nesse modo. As chamadas estão **bloqueadas até autorização de custo e configuração privada da chave**. Não considerar pronto para apresentação antes dos testes com o fornecedor real.

Os termos atuais do Gemini e do Google Cloud impedem reativar a integração anterior para o público de 6 a 14 anos. A alternativa desta etapa restringe a IA a contas adultas fictícias autorizadas, nos emuladores locais. O uso com crianças continua bloqueado; para dados pessoais de menores de 13 anos, a orientação da OpenAI exige retenção zero previamente aprovada, além dos cuidados para menores. `store:false` não equivale a retenção zero. Produção não foi alterada nem republicada.

Consulte **[integracoes-reais-vigia.html](integracoes-reais-vigia.html)** para resultados, custos e bloqueios. Para iniciar esta edição: mantenha `npm run emulators` aberto, prepare as contas com `npm run demo:seed`, compile com `npm run build:presentation` e execute `npm run start:presentation` em outro terminal. O endereço padrão é localhost:3001. A pasta de compilação é `dist/presentation`, separada da publicação. A chave deve ficar exclusivamente no ambiente privado do servidor; nunca use uma variável `VITE_` nem cole a chave na conversa. O exemplo sem segredos está em `ai-local.example.txt`; `.env.ai-local` é ignorado pelo Git. Não mude `AI_COST_AUTHORIZED` antes da autorização do proprietário.

As integrações são testadas por `npm run test:real-ai`, `node tests/real-ai-api.cjs` e `node tests/real-ai-browser.cjs`. Os dois últimos usam um fornecedor de teste isolado, explicitamente fictício, sem chamadas pagas. A interface deste modo não troca um erro por simulação. O controle conservador de orçamento real persiste em `.tools/ai-spend/adult-synthetic.json`; não apague esse registro para renovar limite sem autorização. O modo real é rejeitado no Render, com Firebase online, para visitantes ou contas infantis. A voz funciona por turnos: transcrição, resposta verificada e síntese. O modelo TTS atual tem migração necessária antes de 6 de janeiro de 2027, conforme o aviso oficial; não oferece estabilidade indefinida sem manutenção.

O navegador pode guardar uma edição anterior em localhost:3000. O endereço 3001 abre esta avaliação separadamente; o armazenamento anterior não foi apagado. A demonstração antiga descrita abaixo continua preservada.

## Demonstração anterior

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
