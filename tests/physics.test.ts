import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
test('Escape: parede com corpo fixo impede atravessamento e piso sustenta o jogador',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.5,0));world.createCollider(RAPIER.ColliderDesc.cuboid(100,.5,100),floor);
  const wall=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(3,1,0));world.createCollider(RAPIER.ColliderDesc.cuboid(1,1,1),wall);
  const player=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,2,0).lockRotations().setCcdEnabled(true));world.createCollider(RAPIER.ColliderDesc.capsule(.75,.5),player);
  for(let i=0;i<180;i++){const v=player.linvel();player.setLinvel({x:6,y:v.y,z:0},true);world.step();}
  const position=player.translation();assert.ok(position.x<1.6,`Atravessou parede: ${position.x}`);assert.ok(position.y>=1.2,`Atravessou piso: ${position.y}`);world.free();
});
