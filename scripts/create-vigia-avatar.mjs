import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// An original, texture-free character. Articulated meshes keep the GLB portable
// and inexpensive to render without a network, external textures or paid tools.
// --male creates a human tutor with the same rig. Existing game assets and the
// already approved female model are left untouched when this option is used.
const male = process.argv.includes('--male');
const assetName = male ? 'vigia-original-male' : 'vigia-original';
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}).catch(error=>this.onerror?.(error));}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();}).catch(error=>this.onerror?.(error));}
};
const scene=new THREE.Scene();scene.name=male?'VigiaOriginalMale':'VigiaOriginal';
const materials={
  navy:new THREE.MeshStandardMaterial({name:'UniformeAzul',color:0x17354f,roughness:.82}),
  navyLight:new THREE.MeshStandardMaterial({name:'DetalhesAzuis',color:0x294e67,roughness:.82}),
  orange:new THREE.MeshStandardMaterial({name:'ColeteLaranja',color:0xf58b32,roughness:.8}),
  orangeDark:new THREE.MeshStandardMaterial({name:'AcabamentoColete',color:0xc76727,roughness:.85}),
  skin:new THREE.MeshStandardMaterial({name:'Pele',color:0xc58b68,roughness:.9}),
  skinShadow:new THREE.MeshStandardMaterial({name:'DetalhePele',color:0xa16e55,roughness:.92}),
  hair:new THREE.MeshStandardMaterial({name:'CabeloCastanho',color:0x30251f,roughness:.9}),
  cream:new THREE.MeshStandardMaterial({name:'RefletivoClaro',color:0xf7f1dc,roughness:.65}),
  white:new THREE.MeshStandardMaterial({name:'Olhos',color:0xfff7ed,roughness:.72}),
  eyes:new THREE.MeshStandardMaterial({name:'OlharCastanho',color:0x362a24,roughness:.65}),
  mouth:new THREE.MeshStandardMaterial({name:'Boca',color:0x743d3b,roughness:.9}),
  metal:new THREE.MeshStandardMaterial({name:'DetalhesMetal',color:0xe1b964,metalness:.45,roughness:.5}),
};
const joints={};
function joint(name,parent,position=[0,0,0]){const node=new THREE.Group();node.name=name;node.position.set(...position);parent.add(node);joints[name]=node;return node;}
function mesh(parent,geometry,material,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){const object=new THREE.Mesh(geometry,material);object.position.set(...position);object.scale.set(...scale);object.rotation.set(...rotation);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;}
const sphere=new THREE.SphereGeometry(1,16,12),box=new THREE.BoxGeometry(1,1,1);
function oval(parent,material,position,scale){return mesh(parent,sphere,material,position,scale);}
function rectangle(parent,material,position,scale,rotation){return mesh(parent,box,material,position,scale,rotation);}
function capsule(parent,material,radius,length,position,rotation=[0,0,0]){return mesh(parent,new THREE.CapsuleGeometry(radius,length,4,10),material,position,[1,1,1],rotation);}
function stroke(parent,material,from,to,radius=.002){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),direction=b.clone().sub(a);const object=mesh(parent,new THREE.CylinderGeometry(radius,radius,1,6),material,a.clone().add(b).multiplyScalar(.5).toArray(),[1,direction.length(),1]);object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return object;}
function panel(parent,material,points,depth,position){const shape=new THREE.Shape();shape.moveTo(...points[0]);for(const point of points.slice(1))shape.lineTo(...point);shape.closePath();return mesh(parent,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:1,steps:1}),material,position);}

const root=joint('VigiaRoot',scene);
const hips=joint('Hips',root,[0,.91,0]);
oval(hips,materials.navy,[0,.01,0],[.19,.11,.13]);
rectangle(hips,materials.navyLight,[0,.065,.115],[.32,.035,.018]);
rectangle(hips,materials.metal,[0,.065,.13],[.035,.029,.01]);
const spine=joint('Spine',hips,[0,.095,0]);
oval(spine,materials.navy,[0,.21,0],[.217,.265,.135]);
const vestOutline=[[-.19,.015],[-.213,.365],[-.137,.449],[-.07,.382],[.07,.382],[.137,.449],[.213,.365],[.19,.015]];
panel(spine,materials.orange,vestOutline,.018,[0,0,.105]);
panel(spine,materials.orange,vestOutline,.018,[0,0,-.128]);
rectangle(spine,materials.cream,[-.155,.23,.136],[.035,.225,.01]);
rectangle(spine,materials.cream,[.155,.23,.136],[.035,.225,.01]);
rectangle(spine,materials.cream,[0,.071,.134],[.375,.028,.01]);
rectangle(spine,materials.orangeDark,[0,.192,.143],[.009,.32,.009]);
for(const side of [-1,1]){rectangle(spine,materials.orangeDark,[side*.11,.145,.143],[.065,.064,.018]);rectangle(spine,materials.orange,[side*.11,.163,.153],[.069,.018,.008]);}
// Generic protective shield, deliberately avoiding official agency insignia.
panel(spine,materials.navy,[[-.04,.032],[.04,.032],[.034,-.021],[0,-.046],[-.034,-.021]],.003,[-.084,.345,.147]);
panel(spine,materials.cream,[[-.023,-.015],[0,.023],[.023,-.015]],.002,[-.084,.345,.158]);
rectangle(spine,materials.cream,[.025,.258,.152],[.123,.037,.009]);
const glyphs={V:[[[-.006,.010],[0,-.010],[.006,.010]]],I:[[[-.005,.010],[.005,.010]],[[0,.010],[0,-.010]],[[-.005,-.010],[.005,-.010]]],G:[[[.006,.007],[.002,.010],[-.005,.007],[-.007,0],[-.005,-.009],[.005,-.009],[.006,0],[.001,0]]],A:[[[-.007,-.010],[0,.010],[.007,-.010]],[[-.004,-.003],[.004,-.003]]]};
for(const [index,letter] of [...'VIGIA'].entries())for(const line of glyphs[letter])for(let i=1;i<line.length;i++)stroke(spine,materials.navy,[.025+(index-2)*.020+line[i-1][0],.258+line[i-1][1],.160],[.025+(index-2)*.020+line[i][0],.258+line[i][1],.160],.0012);
// Radio and small clip on the vest; all geometry is authored here.
rectangle(spine,materials.navy,[.098,.355,.161],[.045,.072,.024]);
rectangle(spine,materials.navyLight,[.098,.357,.176],[.03,.034,.004]);
stroke(spine,materials.navy,[.11,.39,.158],[.11,.44,.158],.003);
oval(spine,materials.cream,[.085,.379,.179],[.004,.004,.002]);

for(const [side,label] of [[-1,'Left'],[1,'Right']]){
  const leg=joint('Leg'+label,hips,[side*.115,-.015,0]);
  capsule(leg,materials.navy,.074,.24,[0,-.175,0]);
  const knee=joint('Knee'+label,leg,[0,-.35,0]);
  capsule(knee,materials.navy,.068,.25,[0,-.18,.003]);
  rectangle(knee,materials.cream,[0,-.235,.063],[.125,.027,.011]);
  const foot=joint('Foot'+label,knee,[0,-.365,.015]);
  oval(foot,materials.navy,[0,-.052,.042],[.085,.067,.135]);
  rectangle(foot,materials.navyLight,[0,-.087,.05],[.16,.025,.215]);
  for(const y of [-.013,-.028])stroke(foot,materials.cream,[-.029,y,.135],[.029,y,.135],.002);
  const shoulder=joint('Shoulder'+label,spine,[side*.224,.395,0]);
  shoulder.rotation.z=side*.12;
  oval(shoulder,materials.navy,[0,-.025,0],[.087,.103,.086]);
  capsule(shoulder,materials.navy,.065,.165,[0,-.15,0]);
  rectangle(shoulder,materials.cream,[0,-.13,.065],[.094,.022,.009]);
  const elbow=joint('Elbow'+label,shoulder,[0,-.267,0]);elbow.rotation.x=-.10;
  capsule(elbow,materials.navy,.056,.15,[0,-.118,0]);
  rectangle(elbow,materials.orange,[0,-.206,.04],[.092,.035,.027]);
  const hand=joint('Hand'+label,elbow,[0,-.25,.005]);
  oval(hand,materials.skin,[0,-.035,.012],[.048,.061,.025]);
  for(let finger=0;finger<4;finger++)capsule(hand,materials.skin,.008,.03,[(finger-1.5)*.019,-.092,.013]);
  capsule(hand,materials.skin,.010,.034,[-side*.045,-.02,.012],[0,0,side*.65]);
}

const neck=joint('Neck',spine,[0,.47,0]);
capsule(neck,materials.skin,.043,.064,[0,.045,0]);
const head=joint('Head',neck,[0,.08,0]);
oval(head,materials.skin,[0,.176,0],male?[.174,.199,.151]:[.163,.201,.147]);
for(const side of [-1,1]){
  oval(head,materials.skin,[side*.160,.17,-.006],[.029,.043,.022]);
  oval(head,materials.skinShadow,[side*.175,.17,.006],[.012,.023,.010]);
  if(!male)oval(head,materials.metal,[side*.171,.134,.020],[.007,.007,.007]);
}
// A fitted hair surface has a higher front edge so it never covers the eyes.
const hairPositions=[],hairIndices=[],rows=12,columns=24;
for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const phi=column/columns*Math.PI*2,maxTheta=(male?1.13:1.05)+(1-Math.cos(phi))*(male?.37:.57),theta=row/rows*maxTheta;
  hairPositions.push(Math.sin(phi)*Math.sin(theta)*(male?.181:.173),.177+Math.cos(theta)*.211,Math.cos(phi)*Math.sin(theta)*(male?.161:.157));
}
for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const a=row*(columns+1)+column,b=a+columns+1;hairIndices.push(a,b,a+1,b,b+1,a+1);}
const hairGeometry=new THREE.BufferGeometry();hairGeometry.setAttribute('position',new THREE.Float32BufferAttribute(hairPositions,3));hairGeometry.setIndex(hairIndices);hairGeometry.computeVertexNormals();
mesh(head,hairGeometry,materials.hair);
if(!male){
  oval(head,materials.hair,[-.080,.345,.088],[.105,.055,.060]);
  oval(head,materials.hair,[.02,.325,-.190],[.094,.095,.087]);
  oval(head,materials.orange,[.02,.314,-.151],[.086,.022,.022]);
}
for(const [side,label] of [[-1,'Left'],[1,'Right']]){
  const eye=joint('Eye'+label,head,[side*.059,.208,.137]);
  oval(eye,materials.white,[0,0,0],[.030,.023,.012]);
  oval(eye,materials.eyes,[0,-.001,.010],[.013,.016,.006]);
  oval(eye,materials.white,[-.003,.006,.016],[.004,.005,.002]);
  const brow=joint('Brow'+label,head,[side*.058,.251,.145]);
  stroke(brow,materials.hair,[-.023,-.002,0],[0,.005,.001],male?.005:.004);
  stroke(brow,materials.hair,[0,.005,.001],[.022,.001,0],male?.005:.004);
}
oval(head,materials.skin,[0,.161,.157],[.024,.025,.027]);
const mouth=joint('Mouth',head,[0,.104,.143]);
oval(mouth,materials.mouth,[0,0,0],[.037,.010,.008]);
oval(mouth,materials.cream,[0,.004,.007],[.025,.003,.002]);
oval(head,materials.skinShadow,[-.085,.145,.117],[.025,.009,.002]);
oval(head,materials.skinShadow,[.085,.145,.117],[.025,.009,.002]);

// Merge only static artwork within each joint. Animated joint nodes remain
// independent, while the number of mesh draws is kept small for mobile devices.
scene.updateMatrixWorld(true);
for(const node of Object.values(joints)){
  const grouped=new Map();for(const child of [...node.children])if(child.isMesh){const key=child.material.uuid;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(child);}
  for(const items of grouped.values()){
    if(items.length<2)continue;
    const geometries=items.map(item=>{item.updateMatrix();const geometry=item.geometry.clone().applyMatrix4(item.matrix).toNonIndexed();geometry.deleteAttribute('uv');return geometry;});
    const geometry=mergeGeometries(geometries);if(!geometry)throw Error('Unable to merge original model geometry.');
    for(const item of items)node.remove(item);
    const combined=new THREE.Mesh(geometry,items[0].material);combined.name=node.name+'Artwork'+items[0].material.name;combined.castShadow=true;combined.receiveShadow=true;node.add(combined);
  }
}
function quaternionValues(eulers){return eulers.flatMap(values=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...values)).toArray());}
const times=[0,1,2,3,4];
const base={Spine:[0,0,0],Neck:[0,0,0],ShoulderLeft:[0,0,-.12],ShoulderRight:[0,0,.12],ElbowLeft:[-.10,0,0],ElbowRight:[-.10,0,0],BrowLeft:[0,0,0],BrowRight:[0,0,0]};
function clip(name,poses,mouthScale=[1,1,1,1,1]){
  const tracks=[];
  for(const [node,rest] of Object.entries(base))tracks.push(new THREE.QuaternionKeyframeTrack(node+'.quaternion',times,quaternionValues(poses[node]||times.map(()=>rest))));
  tracks.push(new THREE.VectorKeyframeTrack('Mouth.scale',times,mouthScale.flatMap(y=>[1,y,1])));
  for(const node of ['EyeLeft','EyeRight'])tracks.push(new THREE.VectorKeyframeTrack(node+'.scale',[0,1.1,1.17,1.29,1.36,4],[1,1,1,1,1,1,1,.12,1,1,.12,1,1,1,1,1,1,1]));
  tracks.push(new THREE.VectorKeyframeTrack('Spine.scale',times,[1,1,1,1,1.012,1.008,1,1,1,1,1.012,1.008,1,1,1]));
  return new THREE.AnimationClip(name,4,tracks);
}
const animations=[
  clip('Idle',{Spine:[[0,0,0],[0,0,.008],[0,0,0],[0,0,-.008],[0,0,0]],Neck:[[0,0,0],[0,.025,.012],[0,0,0],[0,-.025,-.012],[0,0,0]]}),
  clip('Happy',{Spine:[[0,0,0],[0,-.07,-.025],[0,.035,.01],[0,-.05,-.02],[0,0,0]],Neck:[[0,0,0],[-.045,.08,.025],[.012,-.045,0],[-.04,.06,.018],[0,0,0]],ShoulderRight:[[0,0,.12],[-.08,0,1.55],[-.08,.16,1.4],[-.08,-.12,1.6],[0,0,.12]],ElbowRight:[[-.1,0,0],[-1.20,0,.4],[-1.08,.15,.65],[-1.28,-.12,.4],[-.1,0,0]],ShoulderLeft:[[0,0,-.12],[-.12,.04,-.28],[-.04,-.08,-.2],[-.14,.02,-.3],[0,0,-.12]],ElbowLeft:[[-.1,0,0],[-.6,0,0],[-.3,.1,0],[-.55,0,0],[-.1,0,0]]},[1,2.5,1.3,2.3,1]),
  clip('Alert',{Neck:[[0,0,0],[.02,-.1,-.09],[.04,-.08,-.07],[.01,-.11,-.1],[0,0,0]],Spine:[[0,0,0],[0,0,-.018],[0,0,-.025],[0,0,-.012],[0,0,0]],ShoulderRight:[[0,0,.12],[-.15,0,.42],[-.1,0,.5],[-.15,0,.43],[0,0,.12]],ElbowRight:[[-.1,0,0],[-.6,0,2.35],[-.7,0,2.25],[-.65,0,2.35],[-.1,0,0]]}),
  clip('LookAround',{Neck:[[0,0,0],[.06,.26,.03],[-.02,-.25,-.035],[.07,.18,.02],[0,0,0]],ShoulderLeft:[[0,0,-.12],[-.13,0,-.2],[-.08,0,-.14],[-.14,0,-.19],[0,0,-.12]],ElbowLeft:[[-.1,0,0],[-.65,0,-.55],[-.62,0,-.58],[-.66,0,-.5],[-.1,0,0]]}),
  clip('Sad',{Neck:[[0,0,0],[.14,0,-.025],[.16,-.04,-.015],[.14,.02,-.025],[0,0,0]],Spine:[[0,0,0],[.04,0,0],[.06,0,0],[.04,0,0],[0,0,0]],BrowLeft:[[0,0,0],[0,0,-.18],[0,0,-.22],[0,0,-.18],[0,0,0]],BrowRight:[[0,0,0],[0,0,.18],[0,0,.22],[0,0,.18],[0,0,0]]},[1,.65,.6,.65,1]),
];
scene.userData={title:male?'Vigia original — tutor':'Vigia original',assetVersion:1,creator:'Created for the Vigia project',description:'Adult stylized civil-protection guide; original articulated geometry and five gesture loops.',units:'metres',upAxis:'Y',frontAxis:'+Z',audioLipSync:false,externalAssets:[]};
scene.updateMatrixWorld(true);
const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
let triangles=0,draws=0;scene.traverse(node=>{if(node.isMesh){draws++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;}});
const output=await new GLTFExporter().parseAsync(scene,{binary:true,animations,trs:true,onlyVisible:true});
if(!(output instanceof ArrayBuffer))throw Error('The exporter did not create a GLB.');
const destination=path.resolve(`public/model/${assetName}.glb`);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,Buffer.from(output));
const report={file:`public/model/${assetName}.glb`,bytes:output.byteLength,triangles:Math.round(triangles),meshDraws:draws,joints:Object.keys(joints),clips:animations.map(animation=>({name:animation.name,duration:animation.duration,tracks:animation.tracks.length})),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()},externalAssets:[],audioLipSync:false};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(`artifacts/${assetName}-model.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
