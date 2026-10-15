const {describe, test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Inspect the real Vite output graph. Source imports alone cannot detect an
// eager manualChunk that has combined an optional SDK with authentication.
const root = path.resolve(__dirname, '..');
const graphFiles = ['publication', 'presentation']
  .map(mode => ({mode, file: path.join(root, '.tools', 'build', `graph-${mode}.json`)}))
  .filter(({file}) => fs.existsSync(file));

const normalized = value => value.replaceAll('\\', '/').replace(/^\.?\//, '');
const sourceModule = (module, source) => {
  const value = normalized(module).split('?')[0];
  return value === source || value.endsWith('/' + source);
};
const firestoreSdk = module => /(?:^|\/)(?:@firebase\/firestore(?:-compat)?|firebase\/(?:compat\/)?firestore)(?:\/|$)/.test(normalized(module));
const authSdk = module => /(?:^|\/)(?:@firebase\/auth(?:-compat)?|firebase\/(?:compat\/)?auth)(?:\/|$)/.test(normalized(module));
const firestoreModule = module => firestoreSdk(module)
  || /(?:^|\/)@firebase\/webchannel-wrapper(?:\/|$)/.test(normalized(module))
  || /(?:^|\/)node_modules\/re2js(?:\/|$)/.test(normalized(module))
  || sourceModule(module, 'src/lib/firebase.ts');
const authModule = module => authSdk(module) || sourceModule(module, 'src/lib/firebaseAuth.ts');
const conversationModule = module => [
  'src/components/ChatTab.tsx',
  'src/utils/geminiLive.ts',
  'src/lib/chatHistoryService.ts',
].some(source => sourceModule(module, source));
const graphicsModule = module => /(?:^|\/)node_modules\/(?:three\/|@react-three\/|@dimforge\/)/.test(normalized(module))
  || sourceModule(module, 'src/components/Avatar3D.tsx')
  || /(?:^|\/)src\/components\/games\/escape\//.test(normalized(module));
const modalModule = module => /(?:^|\/)src\/components\/(?:[^/]+\/)*[^/]*Modals?\.tsx$/.test(normalized(module).split('?')[0]);
const lazyTabModule = module => [
  'src/components/HomeTab.tsx',
  'src/components/ChatTab.tsx',
  'src/components/HelpTab.tsx',
  'src/components/TopicsTab.tsx',
  'src/components/EmergencyNumbersCard.tsx',
  'src/components/SchoolDashboard.tsx',
  'src/components/learning/LearningCenter.tsx',
  'src/components/learning/LearningTrailMap.tsx',
  'src/components/games/hub/GameHubTab.tsx',
  'src/components/salasegura/SalaSeguraTab.tsx',
].some(source => sourceModule(module, source));

function closure(chunks, seeds, includeDynamic = false) {
  const reached = new Set();
  const pending = [...seeds];
  while (pending.length) {
    const name = normalized(pending.pop());
    if (reached.has(name)) continue;
    const chunk = chunks.get(name);
    assert.ok(chunk, `Chunk ausente no grafo: ${name}`);
    reached.add(name);
    pending.push(...chunk.imports);
    if (includeDynamic) pending.push(...chunk.dynamicImports);
  }
  return [...reached].map(name => chunks.get(name));
}

function assertNoModules(chunks, forbidden, reason) {
  const found = chunks.flatMap(chunk => chunk.modules
    .filter(forbidden).map(module => `${chunk.fileName}: ${module}`));
  assert.deepEqual(found, [], `${reason}\n${found.slice(0, 20).join('\n')}`);
}

test('há um grafo de build real para validar o carregamento', () => {
  assert.ok(graphFiles.length, 'Gere .tools/build/graph-publication.json ou graph-presentation.json com o build Vite antes deste teste.');
});

for (const {mode, file} of graphFiles) {
  describe(`carregamento do build ${mode}`, () => {
    let graph;
    let chunks;
    const chunkFor = source => {
      const matches = graph.chunks.filter(chunk => chunk.modules.some(module => sourceModule(module, source)));
      assert.equal(matches.length, 1, `O grafo precisa identificar um único chunk para ${source}.`);
      return matches[0];
    };

    before(() => {
      graph = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(graph.mode, mode, 'O modo do artefato deve corresponder ao build verificado.');
      assert.ok(Array.isArray(graph.chunks) && graph.chunks.length, 'O grafo precisa conter chunks.');
      assert.ok(Array.isArray(graph.precache) && graph.precache.every(value => typeof value === 'string'), 'precache deve listar URLs de arquivos.');
      chunks = new Map();
      for (const chunk of graph.chunks) {
        assert.equal(typeof chunk.fileName, 'string');
        assert.equal(typeof chunk.isEntry, 'boolean');
        for (const field of ['modules', 'imports', 'dynamicImports']) {
          assert.ok(Array.isArray(chunk[field]) && chunk[field].every(value => typeof value === 'string'), `${chunk.fileName}: ${field} inválido.`);
        }
        const name = normalized(chunk.fileName);
        assert.ok(!chunks.has(name), `Chunk duplicado: ${name}`);
        chunks.set(name, chunk);
      }
      // Validate every edge as well, so a missing chunk cannot hide an SDK.
      for (const chunk of graph.chunks) {
        for (const name of [...chunk.imports, ...chunk.dynamicImports]) {
          assert.ok(chunks.has(normalized(name)), `${chunk.fileName} aponta para chunk ausente: ${name}`);
        }
      }
    });

    test('a tela 18+ não depende de Auth, Firestore, conversa ou 3D', () => {
      const main = chunkFor('src/main.tsx');
      assert.equal(main.isEntry, true, 'main.tsx deve pertencer ao ponto de entrada real.');
      const initial = closure(chunks, [main.fileName]);
      assertNoModules(initial, module => authModule(module) || firestoreModule(module)
        || conversationModule(module) || graphicsModule(module), 'A primeira tela recebeu funcionalidades que deveriam ser carregadas depois.');
      assertNoModules(initial, module => sourceModule(module, 'src/App.tsx'), 'App precisa permanecer atrás da entrada dinâmica do acesso 18+.');
    });

    test('App e Home visitante não dependem de Firestore, conversa ou modais', () => {
      const initial = closure(chunks, [
        chunkFor('src/main.tsx').fileName,
        chunkFor('src/App.tsx').fileName,
        chunkFor('src/components/HomeTab.tsx').fileName,
      ]);
      assertNoModules(initial, module => firestoreModule(module) || conversationModule(module)
        || modalModule(module) || graphicsModule(module), 'A navegação inicial do visitante recebeu módulos opcionais.');
      assert.ok(initial.some(chunk => chunk.modules.some(authSdk)), 'A identidade da conta deve continuar disponível para App.');
    });

    test('a conversa visitante não carrega Firestore ou 3D para usar o histórico local', () => {
      const chat = chunkFor('src/components/ChatTab.tsx');
      const initial = closure(chunks, [
        chunkFor('src/main.tsx').fileName,
        chunkFor('src/App.tsx').fileName,
        chat.fileName,
      ]);
      assertNoModules(initial, module => firestoreModule(module) || graphicsModule(module), 'A conversa visitante recebeu dependências reservadas ao histórico autenticado ou ao avatar 3D.');
      const reachable = closure(chunks, [chat.fileName], true);
      assert.ok(reachable.some(chunk => chunk.modules.some(firestoreSdk)), 'O histórico autenticado deve conservar acesso dinâmico ao Firestore.');
    });

    test('abrir o login não carrega Firestore antes da autenticação', () => {
      const modal = chunkFor('src/components/AuthModal.tsx');
      const initial = closure(chunks, [modal.fileName]);
      assertNoModules(initial, module => firestoreModule(module) || graphicsModule(module), 'O formulário de acesso recebeu dependências de dados antes da autenticação.');
      const reachable = closure(chunks, [modal.fileName], true);
      assert.ok(reachable.some(chunk => chunk.modules.some(firestoreSdk)), 'Cadastro e Google devem conservar a gravação dinâmica do perfil autenticado.');
    });

    test('Firestore e conversa continuam disponíveis por importação dinâmica', () => {
      const app = chunkFor('src/App.tsx');
      const eager = closure(chunks, [app.fileName]);
      const reachable = closure(chunks, [app.fileName], true);
      const eagerNames = new Set(eager.map(chunk => normalized(chunk.fileName)));
      for (const [label, predicate] of [['Firestore', firestoreSdk], ['Conversa', conversationModule]]) {
        const featureChunks = reachable.filter(chunk => chunk.modules.some(predicate));
        assert.ok(featureChunks.length, `${label} foi removido ou ficou inacessível no build.`);
        assert.ok(featureChunks.every(chunk => !eagerNames.has(normalized(chunk.fileName))), `${label} precisa atravessar uma fronteira dinâmica.`);
      }
      assert.ok(reachable.some(chunk => chunk.modules.some(module => sourceModule(module, 'src/components/salasegura/SalaSeguraTab.tsx'))), 'A Sala Segura deve permanecer disponível.');
    });

    test('Auth e Firestore não são empacotados juntos', () => {
      const authentication = graph.chunks.filter(chunk => chunk.modules.some(authSdk));
      const database = graph.chunks.filter(chunk => chunk.modules.some(firestoreSdk));
      assert.ok(authentication.length && database.length, 'Os dois SDKs devem existir no build.');
      assertNoModules(authentication, firestoreModule, 'O chunk de autenticação também contém Firestore.');
      assertNoModules(database, authSdk, 'O chunk de Firestore também contém autenticação.');
    });

    test('o precache não baixa Firestore, conversa, 3D, modais ou abas opcionais', () => {
      assert.ok(graph.precache.length, 'A lista real de precache precisa ser registrada; uma lista ausente não comprova isolamento.');
      const cached = new Set(graph.precache.map(url => normalized(url.split(/[?#]/)[0])));
      const optional = graph.chunks.filter(chunk => chunk.modules.some(module => firestoreModule(module)
        || conversationModule(module) || graphicsModule(module) || modalModule(module) || lazyTabModule(module)));
      const unwanted = optional.filter(chunk => cached.has(normalized(chunk.fileName))).map(chunk => chunk.fileName);
      assert.deepEqual(unwanted, [], 'O service worker está baixando recursos opcionais na instalação inicial.');
    });
  });
}
