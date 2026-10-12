import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hydrateBadges} from '../src/lib/badges';
test('hidratação preserva conquistas antigas e não herda conquistas de outra conta',()=>{
  const a=hydrateBadges(['b_chat','legacy_badge','escape_mundo_1']);
  assert.deepEqual(a.filter(b=>b.unlocked).map(b=>b.id).sort(),['b_chat','escape_mundo_1','legacy_badge'].sort());
  assert.equal(hydrateBadges([]).filter(b=>b.unlocked).length,0);
});
