import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  INTERACTIVE_STAGE_SCHEMA_VERSION,
  InteractiveStageObject,
  InteractiveStageObjectInput,
  InteractiveStageInteractable,
  InteractiveStageOrientation,
  InteractiveStagePlacement,
  InteractiveStagePlatform,
  InteractiveStageProtectedZone,
  InteractiveStageState,
  InteractiveStageWorldMap,
  InteractiveStageWorldRuntimeState,
  interactiveStageInteractableKinds,
  validateInteractiveStageObjectInput,
  validateInteractiveStagePlacement
} from '@tempest/contracts';

const stagePage = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tempest Interactive Stage</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}body{font-family:Inter,Segoe UI,sans-serif}.object{--scale:1;position:absolute;display:grid;place-items:center;min-width:3rem;min-height:3rem;padding:.75rem 1rem;color:#eaffff;background:linear-gradient(135deg,rgba(5,20,29,.92),rgba(13,45,53,.86));border:2px solid var(--accent,#54f2eb);border-radius:18px;box-shadow:0 0 32px color-mix(in srgb,var(--accent,#54f2eb) 38%,transparent);font-size:clamp(18px,2.5vw,46px);font-weight:800;line-height:1.05;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;transform:translate(var(--anchor-x,-50%),var(--anchor-y,-50%)) scale(var(--scale));transform-origin:center;transition:left 220ms ease,top 220ms ease,transform 220ms ease,opacity 180ms ease;will-change:left,top,transform;animation:arrive 260ms cubic-bezier(.2,.8,.2,1)}.object[data-kind=effect]{border-radius:999px}.object[data-state=emote]{animation:pulse 600ms ease-in-out infinite alternate}.glyph{display:block;font-size:.55em;letter-spacing:.12em;color:var(--accent,#54f2eb);margin-bottom:.28em}.leaving{opacity:0;scale:.75}@keyframes arrive{from{opacity:0;scale:.65}}@keyframes pulse{to{filter:brightness(1.35);scale:1.06}}
.object[data-kind=avatar]{min-width:86px;min-height:86px;padding:14px;border-radius:50%;background:radial-gradient(circle at 35% 28%,color-mix(in srgb,var(--accent) 34%,#142535),#071018 68%);font-size:28px}.object[data-kind=avatar] .glyph{display:grid;width:48px;height:48px;margin:0;place-items:center;border-radius:50%;color:#061015;background:var(--accent);font-size:24px}.object[data-kind=avatar] .label{position:absolute;top:calc(100% + 8px);padding:5px 9px;border:1px solid color-mix(in srgb,var(--accent) 55%,#20303a);border-radius:999px;background:rgba(3,10,15,.9);font:700 12px Consolas,monospace;white-space:nowrap}.object[data-kind=pet]{min-width:128px;min-height:100px;border-radius:52% 48% 42% 42%;background:radial-gradient(circle at 40% 25%,#fff3c4,color-mix(in srgb,var(--accent) 56%,#39200d) 55%,#100b08 80%);color:#1a1009}.object[data-kind=pet] .glyph{font-size:18px;color:#3a230e}.object[data-kind=pet] .label{padding:5px 8px;border-radius:999px;background:rgba(5,10,14,.82);color:#fff}.object[data-kind=game-object]{min-width:180px;min-height:120px;clip-path:polygon(12% 0,88% 0,100% 24%,94% 85%,70% 100%,30% 100%,6% 85%,0 24%);background:radial-gradient(circle at center,color-mix(in srgb,var(--accent) 25%,#15101a),#08090e 68%)}.object[data-kind=meter]{min-width:min(560px,58vw);min-height:72px;padding:13px 18px;border-radius:10px;background:rgba(4,12,18,.92)}.object[data-kind=effect]{min-width:80px;min-height:80px;border-width:3px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 32%,transparent),transparent 68%);font-size:clamp(24px,4vw,72px);text-shadow:0 0 16px var(--accent)}.object[data-kind=effect] .label{font-size:12px}.meter{display:none;width:100%;height:8px;margin-top:9px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 45%,#21313a);border-radius:99px;background:#071018}.meter i{display:block;width:var(--meter,100%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#fff);transition:width .25s ease}.object[data-has-meter=true] .meter{display:block}.detail{display:none;margin-top:5px;color:#d3e1e6;font:700 9px Consolas,monospace}.object[data-has-meter=true] .detail{display:block}.object[data-state=walk]{animation:walk 1s ease-in-out infinite alternate}.object[data-state=jump],.object[data-state=celebrate]{animation:jump .65s ease-in-out infinite alternate}.object[data-state=sleep],.object[data-state=defeated]{filter:grayscale(.55);opacity:.7}.object[data-state=hit]{animation:hit .16s steps(2) 4}.object[data-state=trail]{opacity:.72}.object[data-state=heat]{filter:blur(2px)}@keyframes walk{to{margin-left:22px}}@keyframes jump{to{margin-top:-22px;filter:brightness(1.2)}}@keyframes hit{50%{translate:12px 0;filter:brightness(1.8)}}@media(prefers-reduced-motion:reduce){.object{animation:none!important;transition:opacity .1s ease!important}}
.actor-sprite{display:none;position:relative;isolation:isolate;flex:none;background-repeat:no-repeat;background-position:0 0;image-rendering:auto;filter:drop-shadow(0 8px 8px rgba(0,0,0,.38))}.actor-sprite::before,.actor-sprite::after{content:"";position:absolute;inset:0;display:none;background:var(--actor-primary-color,#1b2a59);-webkit-mask-image:var(--actor-primary-mask);mask-image:var(--actor-primary-mask);-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:var(--actor-sheet-width,100%) var(--actor-sheet-height,100%);mask-size:var(--actor-sheet-width,100%) var(--actor-sheet-height,100%);-webkit-mask-position:var(--actor-frame-x,0%) var(--actor-frame-y,0%);mask-position:var(--actor-frame-x,0%) var(--actor-frame-y,0%);mix-blend-mode:color;pointer-events:none}.actor-sprite::after{background:var(--actor-secondary-color,#27e5ff);-webkit-mask-image:var(--actor-secondary-mask);mask-image:var(--actor-secondary-mask)}.actor-sprite.has-palette::before,.actor-sprite.has-palette::after{display:block}.object[data-kind=avatar].has-actor{min-width:0;min-height:0;padding:0;border-color:transparent;border-radius:0;background:transparent;box-shadow:none}.object[data-kind=avatar].has-actor .actor-sprite{display:block}.object[data-kind=avatar].has-actor .glyph{display:none}.object[data-kind=avatar].has-actor .label{top:calc(100% + 5px)}
.cosmetic-layers{position:absolute;inset:0;pointer-events:none}.cosmetic-layer{position:absolute;display:grid;place-items:center;width:30px;height:30px;border:1px solid currentColor;border-radius:50%;background:rgba(3,10,15,.8);color:var(--layer-color,#b99cff);font-size:17px;filter:drop-shadow(0 0 8px currentColor)}.cosmetic-layer[data-position=head]{left:50%;top:-13px;translate:-50% -50%}.cosmetic-layer[data-position=front]{right:-13px;bottom:7px}.cosmetic-layer[data-position=behind]{left:-13px;bottom:7px;z-index:-1}.accessories{position:absolute;right:-5px;top:-5px;padding:3px 5px;border-radius:999px;background:#071018;color:var(--accent);font:800 8px Consolas,monospace}.object:not([data-has-accessories=true]) .accessories{display:none}.title{display:block;color:var(--secondary-accent,#b99cff);font-size:8px;letter-spacing:.08em;text-transform:uppercase}
.world-map{position:absolute;inset:0;z-index:-20;pointer-events:none}.world-floor,.world-platform{position:absolute;border:1px solid var(--platform-color,#54f2eb);border-radius:999px;background:linear-gradient(180deg,color-mix(in srgb,var(--platform-color,#54f2eb) 48%,transparent),color-mix(in srgb,var(--platform-color,#54f2eb) 16%,transparent));box-shadow:0 0 18px color-mix(in srgb,var(--platform-color,#54f2eb) 38%,transparent),inset 0 1px rgba(255,255,255,.3);transform:translateY(-50%)}.world-floor{left:0;width:100%;height:7px}.world-platform{min-height:5px}.object[data-kind=avatar][data-facing=left] .actor-sprite{transform:scaleX(-1)}.object[data-kind=avatar][data-motion=walk] .label{border-color:var(--accent)}.object[data-world-motion=true]{transform:scale(var(--scale)) translate(var(--anchor-x,-50%),var(--anchor-y,-50%));transform-origin:0 0;transition:opacity 180ms ease;will-change:left,top}.object[data-world-motion=true][data-state=walk]{animation:none}.object[data-world-motion=true][data-state=jump]{animation:none}
.world-platform[data-collision=solid]{border-radius:6px;background:color-mix(in srgb,var(--platform-color,#54f2eb) 24%,rgba(4,12,18,.88));box-shadow:0 0 18px color-mix(in srgb,var(--platform-color,#54f2eb) 32%,transparent),inset 0 0 18px rgba(0,0,0,.45)}.world-interactable{position:absolute;display:grid;place-items:center;border:2px solid var(--item-color,#ffbd59);border-radius:12px;color:#fff;background:color-mix(in srgb,var(--item-color,#ffbd59) 22%,rgba(4,12,18,.9));box-shadow:0 0 18px color-mix(in srgb,var(--item-color,#ffbd59) 42%,transparent);font:900 clamp(10px,1.2vw,20px) Consolas,monospace;transition:opacity .2s ease,filter .2s ease,transform .2s ease}.world-interactable::after{content:attr(data-name);position:absolute;top:calc(100% + 4px);padding:2px 5px;border-radius:4px;background:rgba(3,9,14,.82);font:700 8px Consolas,monospace;white-space:nowrap;opacity:.8}.world-interactable[data-kind=pressure-plate]{border-radius:999px}.world-interactable[data-kind=hazard]{clip-path:polygon(0 100%,18% 15%,34% 100%,50% 15%,66% 100%,82% 15%,100% 100%);border-radius:0;background:var(--item-color)}.world-interactable[data-kind=door]{border-radius:4px;background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--item-color) 45%,#071018) 0 12px,#071018 12px 18px);transform-origin:top}.world-interactable[data-kind=door][data-active=true]{opacity:.18;transform:scaleY(.08)}.world-interactable[data-kind=push-block]{border-radius:3px;background:linear-gradient(135deg,color-mix(in srgb,var(--item-color) 55%,#15202a),#071018)}.world-interactable[data-active=true]:not([data-kind=door]){filter:brightness(1.8);transform:scale(1.08)}.world-interactable[data-collected=true]{opacity:.1;transform:scale(.4)}.world-interactable[data-triggered=true]{animation:item-burst .35s ease 2 alternate}@keyframes item-burst{to{filter:brightness(2);transform:scale(1.2) rotate(4deg)}}.object[data-control=interact]{filter:brightness(1.35);outline:3px solid color-mix(in srgb,var(--accent) 70%,white);outline-offset:8px}.object[data-control=emote]{animation:pulse .35s ease-in-out 2 alternate}
</style></head><body><main id="stage" aria-live="polite"></main><script>(()=>{const stage=document.getElementById('stage'),nodes=new Map;const anchors={'top-left':['0%','0%'],top:['-50%','0%'],'top-right':['-100%','0%'],left:['0%','-50%'],center:['-50%','-50%'],right:['-100%','-50%'],'bottom-left':['0%','-100%'],'bottom':['-50%','-100%'],'bottom-right':['-100%','-100%']};
function applyActor(node,props){const sprite=node.querySelector('.actor-sprite'),asset=String(props.actorAsset||''),primaryMask=String(props.actorPrimaryMask||''),secondaryMask=String(props.actorSecondaryMask||''),frames=Math.max(1,Math.floor(Number(props.actorFrames)||1)),width=Math.max(8,Number(props.actorFrameWidth)||128),height=Math.max(8,Number(props.actorFrameHeight)||128),columns=Math.max(frames,Math.floor(Number(props.actorAtlasColumns)||frames)),rows=Math.max(1,Math.floor(Number(props.actorAtlasRows)||1)),row=Math.max(0,Math.min(rows-1,Math.floor(Number(props.actorAtlasRow)||0))),startFrame=Math.max(0,Math.min(columns-1,Math.floor(Number(props.actorAtlasStartFrame)||0))),fps=Math.max(1,Math.min(60,Number(props.actorFps)||8)),loop=props.actorLoop!==false,key=[asset,primaryMask,secondaryMask,frames,width,height,columns,rows,row,startFrame,fps,loop].join('|');node.classList.toggle('has-actor',Boolean(asset));if(!asset){if(node._actorTimer)clearInterval(node._actorTimer);node._actorTimer=null;node._actorKey='';sprite.classList.remove('has-palette');sprite.removeAttribute('style');return}sprite.style.width=width+'px';sprite.style.height=height+'px';sprite.style.backgroundImage='url("'+encodeURI(asset).replace(/"/g,'%22')+'")';sprite.style.backgroundSize=(columns*100)+'% '+(rows*100)+'%';sprite.style.setProperty('--actor-sheet-width',(columns*100)+'%');sprite.style.setProperty('--actor-sheet-height',(rows*100)+'%');sprite.style.setProperty('--actor-primary-mask',primaryMask?'url("'+encodeURI(primaryMask).replace(/"/g,'%22')+'")':'none');sprite.style.setProperty('--actor-secondary-mask',secondaryMask?'url("'+encodeURI(secondaryMask).replace(/"/g,'%22')+'")':'none');sprite.style.setProperty('--actor-primary-color',String(props.actorPrimaryColor||'#1b2a59'));sprite.style.setProperty('--actor-secondary-color',String(props.actorSecondaryColor||'#27e5ff'));sprite.classList.toggle('has-palette',Boolean(primaryMask&&secondaryMask));if(node._actorKey===key)return;if(node._actorTimer)clearInterval(node._actorTimer);node._actorKey=key;let frame=0;const draw=()=>{const column=startFrame+frame,x=(columns===1?0:column/(columns-1)*100)+'%',y=(rows===1?0:row/(rows-1)*100)+'%';sprite.style.backgroundPosition=x+' '+y;sprite.style.setProperty('--actor-frame-x',x);sprite.style.setProperty('--actor-frame-y',y)};draw();if(frames>1)node._actorTimer=setInterval(()=>{if(frame>=frames-1){if(!loop){clearInterval(node._actorTimer);node._actorTimer=null;return}frame=0}else frame+=1;draw()},1000/fps)}
function applyCosmetics(node,props){const layers=node.querySelector('.cosmetic-layers');layers.replaceChildren();let values=[];try{values=JSON.parse(String(props.cosmeticLayers||'[]'))}catch{}for(const value of Array.isArray(values)?values.slice(0,6):[]){const layer=document.createElement('i');layer.className='cosmetic-layer';layer.dataset.position=['behind','front','head'].includes(value.position)?value.position:'front';layer.style.setProperty('--layer-color',String(value.color||props.secondaryAccent||'#b99cff'));layer.textContent=String(value.glyph||'✦').slice(0,8);layers.append(layer)}const accessories=String(props.accessory||'');node.dataset.hasAccessories=String(Boolean(accessories));node.querySelector('.accessories').textContent=accessories;const label=node.querySelector('.label'),title=String(props.title||'');label.replaceChildren();const name=document.createElement('b');name.textContent=String(props.label||props.text||node.dataset.id);label.append(name);if(title){const titleNode=document.createElement('small');titleNode.className='title';titleNode.textContent=title;label.append(titleNode)}}
function render(object){let node=nodes.get(object.id);if(!node){node=document.createElement('article');node.className='object';node.dataset.id=object.id;node.innerHTML='<span class="cosmetic-layers"></span><span class="actor-sprite" aria-hidden="true"></span><span class="glyph"></span><span class="accessories"></span><span class="label"></span><span class="meter"><i></i></span><span class="detail"></span>';stage.append(node);nodes.set(object.id,node)}const p=object.placement||{},a=anchors[p.anchor]||anchors.center,props=object.properties||{},health=Number(props.health),maximum=Number(props.maxHealth),hasMeter=Number.isFinite(health)&&Number.isFinite(maximum)&&maximum>0;applyActor(node,props);applyCosmetics(node,props);node.dataset.kind=object.kind||'text';node.dataset.state=object.state||'idle';node.dataset.hasMeter=String(hasMeter);node.style.left=(Number(p.x)||0)*100+'%';node.style.top=(Number(p.y)||0)*100+'%';node.style.zIndex=String(Number(p.layer)||0);node.style.setProperty('--scale',String((Number(p.scale)||1)*(Number(props.actorScale)||1)));node.style.setProperty('--anchor-x',a[0]);node.style.setProperty('--anchor-y',a[1]);node.style.setProperty('--accent',String(props.accent||'#54f2eb'));node.style.setProperty('--secondary-accent',String(props.secondaryAccent||'#b99cff'));node.style.setProperty('--meter',(hasMeter?Math.max(0,Math.min(100,health/maximum*100)):100)+'%');node.querySelector('.glyph').textContent=String(props.glyph||'STAGE');node.querySelector('.detail').textContent=hasMeter?Math.round(health)+' / '+Math.round(maximum)+(Number(props.shield)>0?' · SHIELD '+Math.round(Number(props.shield)):''):''}
function remove(id){const node=nodes.get(id);if(!node)return;nodes.delete(id);if(node._actorTimer)clearInterval(node._actorTimer);node._actorTimer=null;node.classList.add('leaving');setTimeout(()=>node.remove(),220)}
function replace(state){for(const id of [...nodes.keys()])remove(id);for(const object of state.objects||[])render(object)}const orientation=new URLSearchParams(location.search).get('orientation')==='vertical'?'vertical':'horizontal';document.documentElement.dataset.orientation=orientation;const events=new EventSource('./interactive-stage/events?orientation='+orientation);events.addEventListener('init',event=>replace(JSON.parse(event.data)));events.addEventListener('upsert',event=>render(JSON.parse(event.data).object));events.addEventListener('remove',event=>remove(JSON.parse(event.data).id));events.addEventListener('clear',()=>replace({objects:[]}));events.onerror=()=>{};})();</script></body></html>`;

const worldStageRuntime = `<script>(()=>{const stage=document.getElementById('stage'),layer=document.createElement('div'),objects=new Map,motions=new Map;layer.className='world-map';stage.prepend(layer);let world={enabled:true,wanderEnabled:true,jumpEnabled:true,floorY:.92,speed:.045,gravity:1.2,jumpStrength:.58,platforms:[]},zones=[],last=performance.now();const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));function surfaces(){return [{id:'floor',x:0,width:1,y:Number(world.floorY)||.92},...(world.platforms||[]).filter(item=>item.enabled!==false).map(item=>({id:item.id,x:Number(item.x)||0,width:Number(item.width)||.2,y:Number(item.y)||.7}))]}
function renderMap(){layer.replaceChildren();if(!world.enabled)return;const floor=document.createElement('i');floor.className='world-floor';floor.style.top=(Number(world.floorY)||.92)*100+'%';floor.style.setProperty('--platform-color','#54f2eb');layer.append(floor);for(const item of world.platforms||[]){if(item.enabled===false)continue;const platform=document.createElement('i');platform.className='world-platform';platform.dataset.platformId=String(item.id||'platform');platform.style.left=(Number(item.x)||0)*100+'%';platform.style.top=(Number(item.y)||0)*100+'%';platform.style.width=(Number(item.width)||.2)*100+'%';platform.style.height=Math.max(.005,Number(item.height)||.025)*100+'%';platform.style.setProperty('--platform-color',String(item.color||'#54f2eb'));layer.append(platform)}}
function blocked(x,y){return zones.some(zone=>zone.enabled!==false&&x>Number(zone.x)-.025&&x<Number(zone.x)+Number(zone.width)+.025&&y>Number(zone.y)&&y<Number(zone.y)+Number(zone.height)+.08)}
function resetMotion(object){const p=object.placement||{},x=clamp(Number(p.x)||.5,.025,.975),available=surfaces().filter(item=>x>=item.x&&x<=item.x+item.width&&item.y>=Number(p.y||0));const surface=available.sort((a,b)=>a.y-b.y)[0]||surfaces()[0];motions.set(object.id,{x,y:surface.y,vy:0,direction:Math.random()<.5?-1:1,ground:surface.id,turnIn:1+Math.random()*3,jumpIn:1.5+Math.random()*4})}
function upsert(object){objects.set(object.id,object);if(object.kind==='avatar'&&!motions.has(object.id))resetMotion(object)}
function remove(id){objects.delete(id);motions.delete(id)}
function replace(state){objects.clear();motions.clear();world=state.worldMap||world;zones=state.protectedZones||[];renderMap();for(const object of state.objects||[])upsert(object)}
function layout(state){world=state.worldMap||world;zones=state.protectedZones||zones;renderMap();for(const object of objects.values())if(object.kind==='avatar')resetMotion(object)}
function tick(now){const dt=Math.min(.04,Math.max(.001,(now-last)/1000));last=now;if(world.enabled&&world.wanderEnabled){const allSurfaces=surfaces();for(const [id,object] of objects){if(object.kind!=='avatar'||!['idle','walk','jump'].includes(String(object.state||'idle')))continue;const node=stage.querySelector('.object[data-id="'+CSS.escape(id)+'"]');if(!node)continue;let motion=motions.get(id);if(!motion){resetMotion(object);motion=motions.get(id)}motion.turnIn-=dt;motion.jumpIn-=dt;if(motion.turnIn<=0){if(Math.random()<.34)motion.direction*=-1;motion.turnIn=1.2+Math.random()*3.8}const speed=Number(world.speed)||.045;let nextX=motion.x+motion.direction*speed*dt;if(nextX<=.025||nextX>=.975||blocked(nextX,motion.y-.04)){motion.direction*=-1;nextX=clamp(motion.x+motion.direction*speed*dt,.025,.975)}const currentSurface=allSurfaces.find(item=>item.id===motion.ground);if(currentSurface&&(nextX<currentSurface.x-.01||nextX>currentSurface.x+currentSurface.width+.01)){motion.ground='';motion.vy=.02}if(motion.ground&&world.jumpEnabled&&motion.jumpIn<=0){motion.vy=-(Number(world.jumpStrength)||.58);motion.ground='';motion.jumpIn=2.4+Math.random()*5.6}const previousY=motion.y;if(!motion.ground){motion.vy+=(Number(world.gravity)||1.2)*dt;motion.y+=motion.vy*dt;if(motion.vy>=0){const landed=allSurfaces.filter(item=>nextX>=item.x&&nextX<=item.x+item.width&&previousY<=item.y&&motion.y>=item.y).sort((a,b)=>a.y-b.y)[0];if(landed){motion.y=landed.y;motion.vy=0;motion.ground=landed.id}}if(motion.y>1.08){motion.y=Number(world.floorY)||.92;motion.vy=0;motion.ground='floor'}}motion.x=nextX;const stageHeight=Math.max(1,stage.clientHeight),height=Math.max(0,node.getBoundingClientRect().height),top=motion.y-height*.48/stageHeight;node.dataset.worldMotion='true';node.dataset.motion=motion.ground?'walk':'jump';node.dataset.facing=motion.direction<0?'left':'right';node.style.left=motion.x*100+'%';node.style.top=top*100+'%'}}else{for(const node of stage.querySelectorAll('.object[data-world-motion=true]')){node.dataset.worldMotion='false';node.removeAttribute('data-motion');node.removeAttribute('data-facing')}}requestAnimationFrame(tick)}window.TempestWorld={upsert,remove,replace,layout};renderMap();requestAnimationFrame(tick)})();</script>`;

const worldStageRuntimeV2 = `<script>(()=>{
const stage=document.getElementById('stage'),layer=document.createElement('div'),objects=new Map(),motions=new Map(),interactionStates=new Map(),publishTimes=new Map();
layer.className='world-map';stage.prepend(layer);
const STEP=1/60,MAX_STEPS=5;
let world={enabled:true,wanderEnabled:true,jumpEnabled:true,floorY:.92,speed:.045,gravity:1.2,jumpStrength:.58,platforms:[],interactables:[]},worldState={revision:0,objects:{}},zones=[],collisionAvoidance=true,last=performance.now(),accumulator=0,clock=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function linkActive(linkId){return Boolean(linkId&&(world.interactables||[]).some(item=>item.linkId===linkId&&item.kind!=='door'&&interactionStates.get(String(item.id))?.active))}
function itemGeometry(item){const state=interactionStates.get(String(item.id))||{};return{id:String(item.id),x:Number(state.x??item.x)||0,y:Number(state.y??item.y)||0,width:Math.max(.015,Number(item.width)||.05),height:Math.max(.015,Number(item.height)||.08),collision:'solid'}}
function geometry(){const dynamic=(world.interactables||[]).filter(item=>item.enabled!==false&&(item.kind==='push-block'||(item.kind==='door'&&!linkActive(item.linkId)))).map(itemGeometry);return [{id:'floor',x:0,y:Number(world.floorY)||.92,width:1,height:.08,collision:'solid'},...(world.platforms||[]).filter(item=>item.enabled!==false).map(item=>({id:String(item.id),x:Number(item.x)||0,y:Number(item.y)||.7,width:Number(item.width)||.2,height:Math.max(.005,Number(item.height)||.025),collision:item.collision==='solid'?'solid':'one-way'})),...dynamic]}
function renderMap(){layer.replaceChildren();if(!world.enabled)return;for(const item of geometry()){if((world.interactables||[]).some(entry=>String(entry.id)===item.id))continue;const platform=document.createElement('i');platform.className=item.id==='floor'?'world-floor':'world-platform';platform.dataset.platformId=item.id;platform.dataset.collision=item.collision;platform.style.left=item.x*100+'%';platform.style.top=item.y*100+'%';platform.style.width=item.width*100+'%';platform.style.height=item.id==='floor'?'7px':item.height*100+'%';const source=(world.platforms||[]).find(entry=>String(entry.id)===item.id);platform.style.setProperty('--platform-color',String(source&&source.color||'#54f2eb'));layer.append(platform)}for(const item of world.interactables||[]){if(item.enabled===false)continue;const node=document.createElement('i'),state=interactionStates.get(String(item.id))||{},position=itemGeometry(item),active=item.kind==='door'?linkActive(item.linkId):Boolean(state.active);node.className='world-interactable';node.dataset.interactableId=String(item.id);node.dataset.kind=String(item.kind||'toy');node.dataset.name=String(item.name||item.id);node.dataset.active=String(active);node.dataset.collected=String(Boolean(state.collectedUntil&&state.collectedUntil>clock));node.textContent=String(item.glyph||'USE').slice(0,8);node.style.left=position.x*100+'%';node.style.top=position.y*100+'%';node.style.width=position.width*100+'%';node.style.height=position.height*100+'%';node.style.setProperty('--item-color',String(item.color||'#ffbd59'));layer.append(node)}}
function applyWorldState(value){worldState=value&&typeof value==='object'?value:{revision:0,objects:{}};interactionStates.clear();for(const [id,state] of Object.entries(worldState.objects||{})){interactionStates.set(id,{...state,collectedUntil:state.collectedUntil?clock+Math.max(0,(Date.parse(state.collectedUntil)-Date.now())/1000):0})}renderMap()}
function publishItem(item,action,extra={}){fetch('./interactive-stage/world-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:String(item.id),action,...extra})}).catch(()=>{})}
function collider(object,node){const props=object.properties||{},rect=node.getBoundingClientRect(),stageWidth=Math.max(1,stage.clientWidth),stageHeight=Math.max(1,stage.clientHeight),cx=clamp(Number(props.actorColliderX)||.5,0,1),cy=clamp(Number(props.actorColliderY)||.55,0,1),cw=clamp(Number(props.actorColliderWidth)||.72,.05,1),ch=clamp(Number(props.actorColliderHeight)||.86,.05,1);node.style.setProperty('--anchor-x',(-cx*100)+'%');node.style.setProperty('--anchor-y',(-(cy+ch/2)*100)+'%');return{halfWidth:Math.max(.008,rect.width*cw/stageWidth/2),height:Math.max(.015,rect.height*ch/stageHeight)}}
function applyActorMotion(object,node,motionState){const source=String(object.properties?.actorMotionClips||'');if(!source)return;if(node._actorMotionSource!==source){try{node._actorMotionClips=JSON.parse(source)}catch{node._actorMotionClips={}}node._actorMotionSource=source;node._actorMotionKey=''}const clip=node._actorMotionClips?.[motionState]||node._actorMotionClips?.idle;if(!clip||!clip.asset)return;const sprite=node.querySelector('.actor-sprite');if(!sprite)return;const asset=String(clip.asset),primaryMask=String(clip.primaryMask||''),secondaryMask=String(clip.secondaryMask||''),frames=Math.max(1,Math.floor(Number(clip.frames)||1)),width=Math.max(8,Number(clip.frameWidth)||128),height=Math.max(8,Number(clip.frameHeight)||128),columns=Math.max(frames,Math.floor(Number(clip.atlasColumns)||frames)),rows=Math.max(1,Math.floor(Number(clip.atlasRows)||1)),row=Math.max(0,Math.min(rows-1,Math.floor(Number(clip.atlasRow)||0))),startFrame=Math.max(0,Math.min(columns-1,Math.floor(Number(clip.atlasStartFrame)||0))),fps=Math.max(1,Math.min(60,Number(clip.fps)||8)),loop=clip.loop!==false,key=[motionState,asset,primaryMask,secondaryMask,frames,width,height,columns,rows,row,startFrame,fps,loop].join('|');if(node._actorMotionKey===key)return;if(node._actorTimer)clearInterval(node._actorTimer);node._actorTimer=null;node._actorMotionKey=key;sprite.style.width=width+'px';sprite.style.height=height+'px';sprite.style.backgroundImage='url("'+encodeURI(asset).replace(/"/g,'%22')+'")';sprite.style.backgroundSize=(columns*100)+'% '+(rows*100)+'%';sprite.style.setProperty('--actor-sheet-width',(columns*100)+'%');sprite.style.setProperty('--actor-sheet-height',(rows*100)+'%');sprite.style.setProperty('--actor-primary-mask',primaryMask?'url("'+encodeURI(primaryMask).replace(/"/g,'%22')+'")':'none');sprite.style.setProperty('--actor-secondary-mask',secondaryMask?'url("'+encodeURI(secondaryMask).replace(/"/g,'%22')+'")':'none');sprite.classList.toggle('has-palette',Boolean(primaryMask&&secondaryMask));let frame=0;const draw=()=>{const column=startFrame+frame,x=(columns===1?0:column/(columns-1)*100)+'%',y=(rows===1?0:row/(rows-1)*100)+'%';sprite.style.backgroundPosition=x+' '+y;sprite.style.setProperty('--actor-frame-x',x);sprite.style.setProperty('--actor-frame-y',y)};draw();if(frames>1)node._actorTimer=setInterval(()=>{if(frame>=frames-1){if(!loop){clearInterval(node._actorTimer);node._actorTimer=null;return}frame=0}else frame+=1;draw()},1000/fps)}
const rigCache=new Map(),rigImageCache=new Map();
function loadRigImage(url){if(!rigImageCache.has(url))rigImageCache.set(url,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Rig texture failed to load.'));image.src=url}));return rigImageCache.get(url)}
function loadRig(url){if(!rigCache.has(url))rigCache.set(url,fetch(url,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Rig descriptor failed to load.');return response.json()}).then(async rig=>{if(rig.schemaVersion!==2||!Array.isArray(rig.bones)||!Array.isArray(rig.layers)||!rig.clips)throw new Error('Rig descriptor is invalid.');const images=new Map();await Promise.all(rig.layers.map(async layer=>{if(!images.has(layer.assetUrl))images.set(layer.assetUrl,await loadRigImage(layer.assetUrl))}));return{rig,images}}));return rigCache.get(url)}
function ensureRig(object,node){const url=String(object.properties?.actorRigUrl||'');if(!url)return;if(node._rigUrl===url)return;node._rigUrl=url;node._rigReady=null;loadRig(url).then(value=>{if(node._rigUrl===url)node._rigReady=value}).catch(()=>{if(node._rigUrl===url)node._rigReady=false})}
function rigEase(name,value){if(name==='step')return 0;if(name==='ease-in')return value*value;if(name==='ease-out')return 1-(1-value)*(1-value);if(name==='ease-in-out')return value<.5?2*value*value:1-Math.pow(-2*value+2,2)/2;return value}
function sampleRigTrack(track,time){const frames=track.keyframes||[];if(!frames.length)return{};let left=frames[0],right=frames[frames.length-1];for(let index=1;index<frames.length;index+=1)if(time<=frames[index].timeMs){right=frames[index];left=frames[index-1];break}if(time<=left.timeMs)return left;if(time>=right.timeMs)return right;const ratio=rigEase(right.interpolation||left.interpolation||'linear',(time-left.timeMs)/Math.max(1,right.timeMs-left.timeMs)),result={};for(const key of ['x','y','rotation','scaleX','scaleY','opacity']){if(left[key]===undefined&&right[key]===undefined)continue;const a=Number(left[key]??right[key]),b=Number(right[key]??left[key]);result[key]=a+(b-a)*ratio}return result}
function drawRigLayer(context,image,source,layer,width,height,now){const left=-width*Number(layer.pivot.x),top=-height*Number(layer.pivot.y),deform=layer.deform;if(!deform||Number(deform.amount)<=0){context.drawImage(image,source.x,source.y,source.width,source.height,left,top,width,height);return}const segments=Math.max(2,Math.min(24,Math.floor(Number(deform.segments)||8))),phase=Number(deform.phase||0)+now*.001*Number(deform.speed||1),amount=Number(deform.amount)||0;if(deform.axis==='x'){const sourceWidth=source.width/segments,destinationWidth=width/segments;for(let index=0;index<segments;index+=1){const progress=(index+.5)/segments,weight=deform.anchor==='end'?1-progress:progress,offset=Math.sin(phase+progress*2.4)*amount*weight;context.drawImage(image,source.x+index*sourceWidth,source.y,sourceWidth+.75,source.height,left+index*destinationWidth-.25,top+offset,destinationWidth+.75,height)}}else{const sourceHeight=source.height/segments,destinationHeight=height/segments;for(let index=0;index<segments;index+=1){const progress=(index+.5)/segments,weight=deform.anchor==='end'?1-progress:progress,offset=Math.sin(phase+progress*2.4)*amount*weight;context.drawImage(image,source.x,source.y+index*sourceHeight,source.width,sourceHeight+.75,left+offset,top+index*destinationHeight-.25,width,destinationHeight+.75)}}}
function blendRigTransition(rig,node,poses,now){const previous=rig.clips[node._rigPreviousClipName],age=now-Number(node._rigTransitionStarted||0);if(!previous||age<0||age>=180)return;const previousTime=previous.loop?Number(node._rigPreviousClipTime||0)%previous.durationMs:Math.min(Number(node._rigPreviousClipTime||0),previous.durationMs),previousPoses=new Map((previous.tracks||[]).map(track=>[track.target,sampleRigTrack(track,previousTime)])),ratio=rigEase('ease-out',age/180),keys=['x','y','rotation','scaleX','scaleY','opacity'];for(const target of new Set([...previousPoses.keys(),...poses.keys()])){const from=previousPoses.get(target)||{},to=poses.get(target)||{},mixed={...to};for(const key of keys){if(from[key]===undefined&&to[key]===undefined)continue;const neutral=key==='scaleX'||key==='scaleY'||key==='opacity'?1:0,start=Number(from[key]??neutral),end=Number(to[key]??neutral);mixed[key]=start+(end-start)*ratio}poses.set(target,mixed)}}
function applyRigProcedural(node,poses,motionState,now){const previous=node._rigMotionState;if(previous!==motionState){if(previous==='jump'&&motionState!=='jump')node._rigLandingStarted=now;node._rigMotionState=motionState}const age=now-Number(node._rigLandingStarted||0);if(age>=0&&age<240){const impact=Math.sin(Math.PI*age/240),root={...(poses.get('root')||{})},torso={...(poses.get('torso')||{})};root.y=Number(root.y||0)+11*impact;root.scaleX=Number(root.scaleX??1)*(1+.055*impact);root.scaleY=Number(root.scaleY??1)*(1-.065*impact);torso.y=Number(torso.y||0)+5*impact;poses.set('root',root);poses.set('torso',torso)}}
function drawRig(object,node,motionState,now){
  ensureRig(object,node);const loaded=node._rigReady;if(!loaded)return;const rig=loaded.rig;
  let canvas=node.querySelector('.actor-rig');
  if(!canvas){canvas=document.createElement('canvas');canvas.className='actor-rig';canvas.setAttribute('aria-hidden','true');canvas.style.display='block';canvas.style.position='relative';canvas.style.flex='none';canvas.style.filter='drop-shadow(0 8px 8px rgba(0,0,0,.38))';node.insertBefore(canvas,node.querySelector('.actor-sprite'));const sprite=node.querySelector('.actor-sprite');if(sprite)sprite.style.display='none'}
  if(canvas.width!==rig.canvas.width||canvas.height!==rig.canvas.height){canvas.width=rig.canvas.width;canvas.height=rig.canvas.height;canvas.style.width=rig.canvas.width+'px';canvas.style.height=rig.canvas.height+'px'}
  canvas.style.transform=node.dataset.facing==='left'?'scaleX(-1)':'scaleX(1)';
  const requestedState=String(object.properties?.actorState||'idle'),clipName=requestedState!=='idle'&&rig.clips[requestedState]?requestedState:rig.clips[motionState]?motionState:rig.clips[requestedState]?requestedState:'idle',clip=rig.clips[clipName]||rig.clips.idle;if(!clip)return;
  if(node._rigClipName!==clipName){node._rigPreviousClipName=node._rigClipName||'';node._rigPreviousClipTime=Number(node._rigLastClipTime||0);node._rigTransitionStarted=now;node._rigClipName=clipName;node._rigClipStarted=now}
  const elapsed=Math.max(0,now-Number(node._rigClipStarted||now)),time=clip.loop?elapsed%clip.durationMs:Math.min(elapsed,clip.durationMs),poses=new Map((clip.tracks||[]).map(track=>[track.target,sampleRigTrack(track,time)])),bones=new Map(rig.bones.map(bone=>[bone.id,bone])),context=canvas.getContext('2d');
  node._rigLastClipTime=time;blendRigTransition(rig,node,poses,now);applyRigProcedural(node,poses,motionState,now);context.clearRect(0,0,canvas.width,canvas.height);
  function applyBone(id){const chain=[];let bone=bones.get(id),guard=0;while(bone&&guard++<64){chain.unshift(bone);bone=bone.parent?bones.get(bone.parent):null}for(const item of chain){const pose=poses.get(item.id)||{};context.translate(Number(item.x)+Number(pose.x||0),Number(item.y)+Number(pose.y||0));context.rotate((Number(item.rotation)+Number(pose.rotation||0))*Math.PI/180);context.scale(Number(item.scaleX)*(pose.scaleX===undefined?1:Number(pose.scaleX)),Number(item.scaleY)*(pose.scaleY===undefined?1:Number(pose.scaleY)))}}
  for(const layer of [...rig.layers].sort((a,b)=>a.order-b.order)){if(Array.isArray(layer.states)&&!layer.states.includes(clipName))continue;const image=loaded.images.get(layer.assetUrl);if(!image)continue;const pose=poses.get(layer.id)||{},source=layer.source||{x:0,y:0,width:image.naturalWidth,height:image.naturalHeight},width=source.width,height=source.height;context.save();applyBone(layer.bone);context.translate(Number(layer.x)+Number(pose.x||0),Number(layer.y)+Number(pose.y||0));context.rotate((Number(layer.rotation)+Number(pose.rotation||0))*Math.PI/180);context.scale((layer.flipX?-1:1)*Number(layer.scaleX)*(pose.scaleX===undefined?1:Number(pose.scaleX)),Number(layer.scaleY)*(pose.scaleY===undefined?1:Number(pose.scaleY)));context.globalAlpha=Number(layer.opacity)*(pose.opacity===undefined?1:Number(pose.opacity));drawRigLayer(context,image,source,layer,width,height,now);context.restore()}
}
function availableSurface(x,startY){return geometry().filter(item=>x>=item.x&&x<=item.x+item.width&&item.y>=startY).sort((a,b)=>a.y-b.y)[0]||geometry()[0]}
function resetMotion(object){const p=object.placement||{},x=clamp(Number(p.x)||.5,.03,.97),surface=availableSurface(x,Number(p.y||0));motions.set(object.id,{x,y:surface.y,vy:0,direction:Math.random()<.5?-1:1,ground:surface.id,turnIn:1+Math.random()*3,jumpIn:1.5+Math.random()*4,controlUntil:0,lastControlSequence:0,dropSurface:'',dropUntil:0})}
function itemNode(id){return layer.querySelector('.world-interactable[data-interactable-id="'+CSS.escape(String(id))+'"]')}
function refreshLinks(){for(const item of world.interactables||[]){if(item.kind!=='door')continue;const node=itemNode(item.id);if(node)node.dataset.active=String(linkActive(item.linkId))}}
function overlapItem(motion,size,item,padding=0){const left=motion.x-size.halfWidth-padding,right=motion.x+size.halfWidth+padding,top=motion.y-size.height-padding,bottom=motion.y+padding;return right>Number(item.x)&&left<Number(item.x)+Number(item.width)&&bottom>Number(item.y)&&top<Number(item.y)+Number(item.height)}
function triggerItem(item,object,motion){const id=String(item.id),kind=String(item.kind||'toy'),state=interactionStates.get(id)||{},node=itemNode(id);if((kind==='pickup'||kind==='treasure')&&state.collectedUntil>clock)return false;if(kind==='switch'||kind==='pressure-plate')state.active=!state.active;if(kind==='pickup'||kind==='treasure')state.collectedUntil=clock+12;if(kind==='checkpoint'){state.active=true;motion.checkpoint={id,x:motion.x,y:motion.y,ground:motion.ground}}if(kind==='toy'){motion.vy=-(Number(world.jumpStrength)||.58)*.72;motion.ground=''}if(kind==='hazard'){motion.vy=-(Number(world.jumpStrength)||.58)*.82;motion.ground='';motion.direction*=-1;state.cooldownUntil=clock+1}if(kind==='pet-station'){motion.controlUntil=clock+1.2}interactionStates.set(id,state);if(kind==='switch')publishItem(item,'toggle');if(kind==='pickup'||kind==='treasure')publishItem(item,'collect');if(kind==='checkpoint')publishItem(item,'activate');refreshLinks();if(node){node.dataset.active=String(Boolean(state.active));node.dataset.collected=String(Boolean(state.collectedUntil&&state.collectedUntil>clock));node.dataset.triggered='true';setTimeout(()=>{if(node.isConnected)node.removeAttribute('data-triggered')},700)}const avatar=stage.querySelector('.object[data-id="'+CSS.escape(object.id)+'"]');if(avatar){avatar.dataset.control=kind==='hazard'?'emote':'interact';setTimeout(()=>{if(avatar.isConnected)avatar.removeAttribute('data-control')},700)}return true}
function interactNearest(object,motion){const node=stage.querySelector('.object[data-id="'+CSS.escape(object.id)+'"]'),size=node?collider(object,node):{halfWidth:.03,height:.08};let nearest=null,distance=Infinity;for(const item of world.interactables||[]){if(item.enabled===false)continue;const state=interactionStates.get(String(item.id))||{};if((item.kind==='pickup'||item.kind==='treasure')&&state.collectedUntil>clock)continue;const dx=motion.x-(Number(item.x)+Number(item.width)/2),dy=(motion.y-size.height/2)-(Number(item.y)+Number(item.height)/2),candidate=Math.hypot(dx,dy);if(candidate<distance&&overlapItem(motion,size,item,.065)){nearest=item;distance=candidate}}if(nearest)triggerItem(nearest,object,motion)}
function applyControl(object,motion){const props=object.properties||{},sequence=Number(props.worldControlSequence)||0;if(sequence<=motion.lastControlSequence)return;motion.lastControlSequence=sequence;const action=String(props.worldControlAction||'');if(action==='left'||action==='right'){motion.direction=action==='left'?-1:1;motion.controlUntil=clock+.9}if(action==='jump'&&motion.ground&&world.jumpEnabled){motion.vy=-(Number(world.jumpStrength)||.58);motion.ground=''}if(action==='drop'&&motion.ground&&motion.ground!=='floor'){motion.dropSurface=motion.ground;motion.dropUntil=clock+.45;motion.ground='';motion.vy=.08}if(action==='interact')interactNearest(object,motion);if(action==='interact'||action==='emote'){motion.animationOverride=action==='emote'?'emote':'attack';motion.animationUntil=clock+.9}if(action==='unstuck'){if(motion.checkpoint){motion.x=motion.checkpoint.x;motion.y=motion.checkpoint.y;motion.vy=0;motion.ground=motion.checkpoint.ground}else resetMotion(object);return}const node=stage.querySelector('.object[data-id="'+CSS.escape(object.id)+'"]');if(node&&(action==='interact'||action==='emote')){node.dataset.control=action;setTimeout(()=>{if(node.isConnected)node.removeAttribute('data-control')},900)}}
function upsert(object){objects.set(object.id,object);if(object.kind==='avatar'){if(!motions.has(object.id))resetMotion(object);applyControl(object,motions.get(object.id))}}
function remove(id){objects.delete(id);motions.delete(id)}
function replace(state){objects.clear();motions.clear();world=state.worldMap||world;zones=state.protectedZones||[];collisionAvoidance=state.collisionAvoidance!==false;applyWorldState(state.worldState||worldState);for(const object of state.objects||[])upsert(object)}
function layout(state){world=state.worldMap||world;zones=state.protectedZones||zones;collisionAvoidance=state.collisionAvoidance===undefined?collisionAvoidance:state.collisionAvoidance!==false;applyWorldState(state.worldState||worldState);for(const object of objects.values())if(object.kind==='avatar')resetMotion(object)}
function blockedByZone(x,bottom,size){const top=bottom-size.height,left=x-size.halfWidth,right=x+size.halfWidth;return zones.some(zone=>zone.enabled!==false&&right>Number(zone.x)&&left<Number(zone.x)+Number(zone.width)&&bottom>Number(zone.y)&&top<Number(zone.y)+Number(zone.height))}
function prepareItems(){for(const item of world.interactables||[]){const id=String(item.id),state=interactionStates.get(id)||{},node=itemNode(id);if(item.kind==='pressure-plate'){state.active=false;if(node)node.dataset.active='false'}if(state.collectedUntil&&state.collectedUntil<=clock){state.collectedUntil=0;if(node)node.dataset.collected='false'}interactionStates.set(id,state)}}
function tryPushBlock(solid,direction,amount){const item=(world.interactables||[]).find(entry=>String(entry.id)===solid.id&&entry.kind==='push-block');if(!item)return false;const id=String(item.id),state=interactionStates.get(id)||{},nextX=clamp(solid.x+direction*amount,0,1-solid.width),next={...solid,x:nextX};const blocked=geometry().some(other=>other.id!==id&&other.id!=='floor'&&next.x<other.x+other.width&&next.x+next.width>other.x&&next.y<other.y+other.height&&next.y+next.height>other.y);if(blocked||nextX===solid.x)return false;state.x=nextX;state.y=solid.y;interactionStates.set(id,state);const node=itemNode(id);if(node)node.style.left=nextX*100+'%';if((publishTimes.get(id)||0)<=clock){publishTimes.set(id,clock+.2);publishItem(item,'move',{x:nextX,y:solid.y})}return true}
function simulate(){clock+=STEP;if(!world.enabled)return;prepareItems();const bodies=[];for(const [id,object] of objects){if(object.kind!=='avatar'||!['idle','walk','jump'].includes(String(object.state||'idle')))continue;const node=stage.querySelector('.object[data-id="'+CSS.escape(id)+'"]');if(!node)continue;let motion=motions.get(id);if(!motion){resetMotion(object);motion=motions.get(id)}applyControl(object,motion);const size=collider(object,node),items=geometry(),controlled=motion.controlUntil>clock;motion.turnIn-=STEP;motion.jumpIn-=STEP;if(world.wanderEnabled&&!controlled&&motion.turnIn<=0){if(Math.random()<.34)motion.direction*=-1;motion.turnIn=1.2+Math.random()*3.8}const speed=(Number(world.speed)||.045)*(controlled?2.5:world.wanderEnabled?1:0),oldX=motion.x;let nextX=oldX+motion.direction*speed*STEP;if(nextX-size.halfWidth<=0||nextX+size.halfWidth>=1||blockedByZone(nextX,motion.y,size)){motion.direction*=-1;nextX=clamp(oldX+motion.direction*speed*STEP,size.halfWidth,1-size.halfWidth)}for(const solid of items.filter(item=>item.collision==='solid'&&item.id!=='floor')){const top=motion.y-size.height,bottom=motion.y,vertical=bottom>solid.y&&top<solid.y+solid.height;if(!vertical)continue;if(motion.direction>0&&oldX+size.halfWidth<=solid.x&&nextX+size.halfWidth>solid.x){if(tryPushBlock(solid,1,speed*STEP))continue;nextX=solid.x-size.halfWidth;motion.direction=-1}else if(motion.direction<0&&oldX-size.halfWidth>=solid.x+solid.width&&nextX-size.halfWidth<solid.x+solid.width){if(tryPushBlock(solid,-1,speed*STEP))continue;nextX=solid.x+solid.width+size.halfWidth;motion.direction=1}}
const support=items.find(item=>item.id===motion.ground);if(support&&(nextX+size.halfWidth<support.x||nextX-size.halfWidth>support.x+support.width)){motion.ground='';motion.vy=.02}if(motion.ground&&world.jumpEnabled&&world.wanderEnabled&&!controlled&&motion.jumpIn<=0){motion.vy=-(Number(world.jumpStrength)||.58);motion.ground='';motion.jumpIn=2.4+Math.random()*5.6}const previousBottom=motion.y,previousTop=previousBottom-size.height;if(!motion.ground){motion.vy+=(Number(world.gravity)||1.2)*STEP;let nextBottom=motion.y+motion.vy*STEP;const nextTop=nextBottom-size.height;if(motion.vy<0){const ceiling=items.filter(item=>item.collision==='solid'&&nextX+size.halfWidth>item.x&&nextX-size.halfWidth<item.x+item.width&&previousTop>=item.y+item.height&&nextTop<item.y+item.height).sort((a,b)=>b.y-a.y)[0];if(ceiling){nextBottom=ceiling.y+ceiling.height+size.height;motion.vy=0}}if(motion.vy>=0){const landed=items.filter(item=>item.id!==motion.dropSurface||clock>motion.dropUntil).filter(item=>nextX+size.halfWidth>item.x&&nextX-size.halfWidth<item.x+item.width&&previousBottom<=item.y&&nextBottom>=item.y).sort((a,b)=>a.y-b.y)[0];if(landed){nextBottom=landed.y;motion.vy=0;motion.ground=landed.id}}motion.y=nextBottom;if(motion.y>1.12){if(motion.checkpoint){nextX=motion.checkpoint.x;motion.y=motion.checkpoint.y;motion.vy=0;motion.ground=motion.checkpoint.ground}else{const safe=availableSurface(nextX,0);motion.y=safe.y;motion.vy=0;motion.ground=safe.id}}}if(clock>motion.dropUntil)motion.dropSurface='';motion.x=nextX;for(const item of world.interactables||[]){if(item.enabled===false||!overlapItem(motion,size,item))continue;const itemState=interactionStates.get(String(item.id))||{};if(item.kind==='hazard'&&!(itemState.cooldownUntil>clock))triggerItem(item,object,motion);if(item.kind==='checkpoint'&&motion.checkpoint?.id!==String(item.id))triggerItem(item,object,motion);if(item.kind==='pressure-plate'){itemState.active=true;interactionStates.set(String(item.id),itemState);const pressureNode=itemNode(item.id);if(pressureNode)pressureNode.dataset.active='true'}}bodies.push({id,object,node,motion,size})}for(const item of world.interactables||[]){if(item.kind!=='pressure-plate')continue;const id=String(item.id),state=interactionStates.get(id)||{},persisted=Boolean(worldState.objects?.[id]?.active),active=Boolean(state.active);if(active!==persisted&&(publishTimes.get(id)||0)<=clock){publishTimes.set(id,clock+.25);publishItem(item,active?'activate':'deactivate')}}refreshLinks();
if(collisionAvoidance){for(let a=0;a<bodies.length;a+=1)for(let b=a+1;b<bodies.length;b+=1){const first=bodies[a],second=bodies[b],vertical=Math.abs((first.motion.y-first.size.height/2)-(second.motion.y-second.size.height/2))<(first.size.height+second.size.height)/2;if(!vertical)continue;const minimum=first.size.halfWidth+second.size.halfWidth+.004,delta=second.motion.x-first.motion.x;if(Math.abs(delta)>=minimum)continue;const push=(minimum-Math.abs(delta))/2,direction=delta===0?(a%2?1:-1):Math.sign(delta);first.motion.x=clamp(first.motion.x-direction*push,first.size.halfWidth,1-first.size.halfWidth);second.motion.x=clamp(second.motion.x+direction*push,second.size.halfWidth,1-second.size.halfWidth);first.motion.direction=-direction;second.motion.direction=direction}}
for(const body of bodies){const moving=Boolean(body.motion.ground&&(Number(world.speed)||.045)>0&&(world.wanderEnabled||body.motion.controlUntil>clock)),motionState=body.motion.ground?(moving?'walk':'idle'):'jump',requestedState=String(body.object.properties?.actorState||body.object.state||'idle'),animationState=!['idle','walk','jump'].includes(requestedState)?requestedState:body.motion.animationUntil>clock?String(body.motion.animationOverride||motionState):motionState;body.node.dataset.worldMotion='true';body.node.dataset.motion=motionState;body.node.dataset.animation=animationState;body.node.dataset.facing=body.motion.direction<0?'left':'right';applyActorMotion(body.object,body.node,animationState);body.node.style.left=body.motion.x*100+'%';body.node.style.top=body.motion.y*100+'%'}}
function frame(now){accumulator+=Math.min(.1,Math.max(0,(now-last)/1000));last=now;let steps=0;while(accumulator>=STEP&&steps<MAX_STEPS){simulate();accumulator-=STEP;steps+=1}if(!world.enabled)for(const node of stage.querySelectorAll('.object[data-world-motion=true]')){node.dataset.worldMotion='false';node.removeAttribute('data-motion');node.removeAttribute('data-facing')}for(const [id,object] of objects){if(object.kind!=='avatar')continue;const node=stage.querySelector('.object[data-id="'+CSS.escape(id)+'"]');if(node)drawRig(object,node,String(node.dataset.motion||object.properties?.actorState||object.state||'idle'),now)}requestAnimationFrame(frame)}
window.TempestWorldV2={upsert,remove,replace,layout,worldState:applyWorldState};renderMap();requestAnimationFrame(frame);
})();</script>`;

interface StageClient {
  response: ServerResponse;
  orientation: InteractiveStageOrientation;
}

function clone<T>(value: T): T { return structuredClone(value); }

const defaultWorldMap = (): InteractiveStageWorldMap => ({
  enabled: true,
  wanderEnabled: true,
  jumpEnabled: true,
  floorY: 0.92,
  speed: 0.045,
  gravity: 1.2,
  jumpStrength: 0.58,
  platforms: [],
  interactables: []
});

export class TempestInteractiveStage {
  private readonly objects = new Map<string, InteractiveStageObject>();
  private readonly clients = new Set<StageClient>();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private revision = 0;
  private updatedAt = new Date().toISOString();
  private protectedZones: InteractiveStageProtectedZone[] = [];
  private collisionAvoidance = true;
  private worldMap = defaultWorldMap();
  private worldState: InteractiveStageWorldRuntimeState = { revision: 0, objects: {} };
  private readonly settingsPath?: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory?: string) {
    this.settingsPath = dataDirectory ? path.join(dataDirectory, 'interactive-stage.json') : undefined;
  }

  async initialize(): Promise<void> {
    if (!this.settingsPath) return;
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8')) as { protectedZones?: unknown; collisionAvoidance?: unknown; worldMap?: unknown; worldState?: unknown };
      this.protectedZones = this.validateZones(parsed.protectedZones);
      this.collisionAvoidance = parsed.collisionAvoidance !== false;
      this.worldMap = this.validateWorldMap(parsed.worldMap);
      this.worldState = this.validateWorldState(parsed.worldState);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persistSettings();
    }
  }

  page(): string {
    return stagePage
      .replace('function render(object){', 'function render(object){window.TempestWorldV2.upsert(object);')
      .replace('function remove(id){', 'function remove(id){window.TempestWorldV2.remove(id);')
      .replace('function replace(state){', 'function replace(state){window.TempestWorldV2.replace(state);')
      .replace("events.addEventListener('clear',()=>replace({objects:[]}));", "events.addEventListener('clear',()=>replace({objects:[],worldMap:undefined}));events.addEventListener('layout',event=>window.TempestWorldV2.layout(JSON.parse(event.data)));events.addEventListener('world-state',event=>window.TempestWorldV2.worldState(JSON.parse(event.data).worldState));")
      .replace('<script>(()=>{', `${worldStageRuntimeV2}<script>(()=>{`);
  }

  connect(response: ServerResponse, orientation: InteractiveStageOrientation): void {
    this.prune();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    const client = { response, orientation };
    this.clients.add(client);
    this.write(response, 'init', this.state(orientation));
    response.on('close', () => this.clients.delete(client));
  }

  state(orientation: InteractiveStageOrientation = 'horizontal'): InteractiveStageState {
    this.prune();
    return {
      schemaVersion: INTERACTIVE_STAGE_SCHEMA_VERSION,
      revision: this.revision,
      updatedAt: this.updatedAt,
      objects: [...this.objects.values()].map((object) => this.forOrientation(object, orientation)),
      protectedZones: this.protectedZones.filter((zone) => zone.orientations.includes(orientation)).map(clone),
      collisionAvoidance: this.collisionAvoidance,
      worldMap: this.worldMapFor(orientation),
      worldState: clone(this.worldState)
    };
  }

  status(baseUrl: string): Record<string, unknown> {
    this.prune();
    return {
      state: 'ready',
      schemaVersion: INTERACTIVE_STAGE_SCHEMA_VERSION,
      revision: this.revision,
      updatedAt: this.updatedAt,
      activeCount: this.objects.size,
      connectedClients: this.clients.size,
      protectedZones: this.protectedZones.map(clone),
      collisionAvoidance: this.collisionAvoidance,
      worldMap: clone(this.worldMap),
      worldState: clone(this.worldState),
      horizontalUrl: `${baseUrl}/interactive-stage?orientation=horizontal`,
      verticalUrl: `${baseUrl}/interactive-stage?orientation=vertical`,
      objects: [...this.objects.values()].map(clone)
    };
  }

  spawn(input: unknown): InteractiveStageObject {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as InteractiveStageObjectInput : input;
    const validation = validateInteractiveStageObjectInput(source);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    if (this.objects.has(validation.value.id)) throw new Error(`Stage object ${validation.value.id} already exists.`);
    if (validation.value.dedupeKey && [...this.objects.values()].some((object) => object.dedupeKey === validation.value!.dedupeKey)) {
      throw new Error(`Stage object dedupe key ${validation.value.dedupeKey} is already active.`);
    }
    const resolved = this.resolveObjectPlacement(validation.value);
    this.objects.set(resolved.id, resolved);
    this.touch();
    this.scheduleExpiry(resolved);
    this.broadcastObject('upsert', resolved);
    return clone(resolved);
  }

  upsert(input: InteractiveStageObjectInput & { id: string }): InteractiveStageObject {
    return this.objects.has(input.id) ? this.update(input.id, input) : this.spawn(input);
  }

  preview(): InteractiveStageObject {
    return this.spawn({
      kind: 'text', state: 'emote', lifetimeMs: 10_000,
      owner: { platform: 'studio', userId: 'operator', displayName: 'Studio Operator' },
      placement: { x: 0.5, y: 0.72, scale: 1, anchor: 'center', layer: 10 },
      properties: { glyph: 'TEMPEST', label: 'Interactive Stage online', accent: '#54f2eb' }
    });
  }

  update(id: string, patch: unknown): InteractiveStageObject {
    const current = this.require(id);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Stage object update must be an object.');
    const source = patch as Record<string, unknown>;
    if (source.id !== undefined && source.id !== id) throw new Error('A Stage object ID cannot be changed.');
    const merged: InteractiveStageObjectInput = {
      ...current,
      ...source,
      id,
      owner: source.owner === undefined ? current.owner : source.owner as InteractiveStageObjectInput['owner'],
      placement: source.placement === undefined ? current.placement : { ...current.placement, ...(source.placement as Partial<InteractiveStagePlacement>) },
      properties: source.properties === undefined ? current.properties : { ...current.properties, ...(source.properties as Record<string, string | number | boolean>) },
      scenePlacements: source.scenePlacements === undefined ? current.scenePlacements : source.scenePlacements as Record<string, Partial<InteractiveStagePlacement>>,
      createdAt: current.createdAt,
      expiresAt: source.lifetimeMs === undefined ? (source.expiresAt === undefined ? current.expiresAt : source.expiresAt as string) : undefined,
      lifetimeMs: source.lifetimeMs as number | undefined
    };
    const validation = validateInteractiveStageObjectInput(merged);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const resolved = this.resolveObjectPlacement(validation.value);
    this.objects.set(id, resolved);
    this.touch();
    this.scheduleExpiry(resolved);
    this.broadcastObject('upsert', resolved);
    return clone(resolved);
  }

  move(id: string, placement: unknown): InteractiveStageObject {
    const current = this.require(id);
    const validation = validateInteractiveStagePlacement(placement, current.placement);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const next = this.resolveObjectPlacement({ ...current, placement: validation.value, updatedAt: new Date().toISOString() });
    this.objects.set(id, next);
    this.touch();
    this.broadcastObject('upsert', next);
    return clone(next);
  }

  dismiss(id: string, reason = 'operator'): boolean {
    if (!this.objects.delete(id)) return false;
    const timer = this.expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(id);
    this.touch();
    this.broadcast('remove', { id, reason, revision: this.revision });
    return true;
  }

  clear(reason = 'operator'): number {
    const removed = this.objects.size;
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.objects.clear();
    if (removed) this.touch();
    this.broadcast('clear', { removed, reason, revision: this.revision });
    return removed;
  }

  async configureLayout(input: unknown): Promise<{ protectedZones: InteractiveStageProtectedZone[]; collisionAvoidance: boolean; worldMap: InteractiveStageWorldMap }> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (source.protectedZones !== undefined) this.protectedZones = this.validateZones(source.protectedZones);
    if (source.collisionAvoidance !== undefined) this.collisionAvoidance = source.collisionAvoidance === true;
    if (source.worldMap !== undefined) {
      this.worldMap = this.validateWorldMap(source.worldMap, this.worldMap);
      if ([...this.objects.values()].some((object) => object.kind === 'avatar')) this.worldMap.enabled = true;
      const validIds = new Set(this.worldMap.interactables.map((item) => item.id));
      this.worldState.objects = Object.fromEntries(Object.entries(this.worldState.objects).filter(([id]) => validIds.has(id)));
    }
    for (const [id, object] of [...this.objects]) {
      const resolved = this.resolveObjectPlacement(object);
      this.objects.set(id, resolved);
      this.broadcastObject('upsert', resolved);
    }
    this.touch();
    await this.persistSettings();
    for (const client of this.clients) this.write(client.response, 'layout', {
      revision: this.revision,
      protectedZones: this.protectedZones.filter((zone) => zone.orientations.includes(client.orientation)).map(clone),
      collisionAvoidance: this.collisionAvoidance,
      worldMap: this.worldMapFor(client.orientation),
      worldState: clone(this.worldState)
    });
    return { protectedZones: this.protectedZones.map(clone), collisionAvoidance: this.collisionAvoidance, worldMap: clone(this.worldMap) };
  }

  async ensureAvatarFloor(): Promise<boolean> {
    if (this.worldMap.enabled) return false;
    await this.configureLayout({ worldMap: { enabled: true } });
    return true;
  }

  async worldEvent(input: unknown): Promise<InteractiveStageWorldRuntimeState> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The Stage world event must be an object.');
    const source = input as Record<string, unknown>;
    const itemId = String(source.itemId || '').trim();
    const action = String(source.action || '');
    const item = this.worldMap.interactables.find((candidate) => candidate.id === itemId && candidate.enabled);
    if (!item) throw new Error('The Stage interactable was not found.');
    const allowed = item.kind === 'push-block' ? ['move', 'reset'] : item.kind === 'pickup' || item.kind === 'treasure' ? ['collect', 'reset'] : item.kind === 'door' ? ['reset'] : ['activate', 'deactivate', 'toggle', 'reset'];
    if (!allowed.includes(action)) throw new Error(`The ${item.kind} object does not support ${action || 'that action'}.`);
    const previous = this.worldState.objects[itemId] || {};
    const next = { ...previous };
    if (action === 'reset') delete this.worldState.objects[itemId];
    else if (action === 'toggle') next.active = !previous.active;
    else if (action === 'activate') next.active = true;
    else if (action === 'deactivate') next.active = false;
    else if (action === 'collect') next.collectedUntil = new Date(Date.now() + 12_000).toISOString();
    else if (action === 'move') {
      const x = Number(source.x); const y = Number(source.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x + item.width > 1 || y + item.height > 1) throw new Error('Push-block coordinates must stay inside the Stage canvas.');
      next.x = x; next.y = y;
    }
    if (action !== 'reset') this.worldState.objects[itemId] = next;
    this.worldState.revision += 1;
    this.touch();
    await this.persistSettings();
    this.broadcast('world-state', { revision: this.revision, worldState: clone(this.worldState) });
    return clone(this.worldState);
  }

  close(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    for (const client of this.clients) client.response.end();
    this.clients.clear();
  }

  private require(id: string): InteractiveStageObject {
    const object = this.objects.get(id);
    if (!object) throw new Error(`Stage object ${id} was not found.`);
    return object;
  }

  private validateZones(value: unknown): InteractiveStageProtectedZone[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 24) throw new Error('Protected zones must be an array with no more than 24 entries.');
    const ids = new Set<string>();
    return value.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Protected zone ${index + 1} must be an object.`);
      const source = entry as Record<string, unknown>;
      const id = String(source.id || `zone-${index + 1}`).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) || ids.has(id)) throw new Error(`Protected zone ${index + 1} has an invalid or duplicate ID.`);
      ids.add(id);
      const number = (key: string, fallback: number, minimum: number, maximum: number) => {
        const result = source[key] === undefined ? fallback : Number(source[key]);
        if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Protected zone ${id} ${key} must be between ${minimum} and ${maximum}.`);
        return result;
      };
      const orientations = Array.isArray(source.orientations) ? source.orientations.map(String).filter((item): item is InteractiveStageOrientation => item === 'horizontal' || item === 'vertical') : ['horizontal', 'vertical'] as InteractiveStageOrientation[];
      if (!orientations.length) throw new Error(`Protected zone ${id} needs at least one orientation.`);
      return { id, name: String(source.name || id).trim().slice(0, 80) || id, x: number('x', 0, 0, 1), y: number('y', 0, 0, 1), width: number('width', 0.2, 0.01, 1), height: number('height', 0.2, 0.01, 1), enabled: source.enabled !== false, orientations: [...new Set(orientations)] };
    });
  }

  private validateWorldState(value: unknown): InteractiveStageWorldRuntimeState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { revision: 0, objects: {} };
    const source = value as Record<string, unknown>;
    const entries = source.objects && typeof source.objects === 'object' && !Array.isArray(source.objects) ? Object.entries(source.objects as Record<string, unknown>) : [];
    const validIds = new Set(this.worldMap.interactables.map((item) => item.id));
    const objects: InteractiveStageWorldRuntimeState['objects'] = {};
    for (const [id, entry] of entries.slice(0, 48)) {
      if (!validIds.has(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const state = entry as Record<string, unknown>;
      const next: InteractiveStageWorldRuntimeState['objects'][string] = {};
      if (typeof state.active === 'boolean') next.active = state.active;
      if (typeof state.collectedUntil === 'string' && Number.isFinite(Date.parse(state.collectedUntil)) && Date.parse(state.collectedUntil) > Date.now()) next.collectedUntil = new Date(state.collectedUntil).toISOString();
      if (Number.isFinite(Number(state.x)) && Number(state.x) >= 0 && Number(state.x) <= 1) next.x = Number(state.x);
      if (Number.isFinite(Number(state.y)) && Number(state.y) >= 0 && Number(state.y) <= 1) next.y = Number(state.y);
      if (Object.keys(next).length) objects[id] = next;
    }
    const revision = Number.isInteger(Number(source.revision)) && Number(source.revision) >= 0 ? Number(source.revision) : 0;
    return { revision, objects };
  }

  private validateWorldMap(value: unknown, fallback = defaultWorldMap()): InteractiveStageWorldMap {
    if (value === undefined) return clone(fallback);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The Stage world map must be an object.');
    const source = value as Record<string, unknown>;
    const number = (key: keyof Pick<InteractiveStageWorldMap, 'floorY' | 'speed' | 'gravity' | 'jumpStrength'>, minimum: number, maximum: number) => {
      const result = source[key] === undefined ? fallback[key] : Number(source[key]);
      if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Stage world map ${key} must be between ${minimum} and ${maximum}.`);
      return result;
    };
    const platformsValue = source.platforms === undefined ? fallback.platforms : source.platforms;
    if (!Array.isArray(platformsValue) || platformsValue.length > 24) throw new Error('Stage platforms must be an array with no more than 24 entries.');
    const ids = new Set<string>();
    const platforms: InteractiveStagePlatform[] = platformsValue.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Stage platform ${index + 1} must be an object.`);
      const platform = entry as Record<string, unknown>;
      const id = String(platform.id || `platform-${index + 1}`).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) || ids.has(id)) throw new Error(`Stage platform ${index + 1} has an invalid or duplicate ID.`);
      ids.add(id);
      const bounded = (key: 'x' | 'y' | 'width' | 'height', fallbackValue: number, minimum: number, maximum: number) => {
        const result = platform[key] === undefined ? fallbackValue : Number(platform[key]);
        if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Stage platform ${id} ${key} must be between ${minimum} and ${maximum}.`);
        return result;
      };
      const x = bounded('x', 0.25, 0, 1);
      const y = bounded('y', 0.7, 0.05, 0.98);
      const width = bounded('width', 0.2, 0.03, 1);
      const height = bounded('height', 0.025, 0.005, 1);
      if (x + width > 1.000001) throw new Error(`Stage platform ${id} extends past the right canvas edge.`);
      if (y + height > 1.000001) throw new Error(`Stage platform ${id} extends past the bottom canvas edge.`);
      const color = String(platform.color || '#54f2eb');
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Stage platform ${id} color must be a six-digit hex color.`);
      const collision = platform.collision === 'solid' ? 'solid' : 'one-way';
      const orientations = Array.isArray(platform.orientations) ? platform.orientations.map(String).filter((item): item is InteractiveStageOrientation => item === 'horizontal' || item === 'vertical') : ['horizontal', 'vertical'] as InteractiveStageOrientation[];
      if (!orientations.length) throw new Error(`Stage platform ${id} needs at least one orientation.`);
      return { id, name: String(platform.name || id).trim().slice(0, 80) || id, x, y, width, height, color, collision, enabled: platform.enabled !== false, orientations: [...new Set(orientations)] };
    });
    const interactablesValue = source.interactables === undefined ? fallback.interactables : source.interactables;
    if (!Array.isArray(interactablesValue) || interactablesValue.length > 48) throw new Error('Stage interactables must be an array with no more than 48 entries.');
    const interactableIds = new Set<string>();
    const interactables: InteractiveStageInteractable[] = interactablesValue.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Stage interactable ${index + 1} must be an object.`);
      const item = entry as Record<string, unknown>;
      const id = String(item.id || `interactable-${index + 1}`).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) || interactableIds.has(id)) throw new Error(`Stage interactable ${index + 1} has an invalid or duplicate ID.`);
      interactableIds.add(id);
      const kind = String(item.kind || 'toy') as InteractiveStageInteractable['kind'];
      if (!interactiveStageInteractableKinds.includes(kind)) throw new Error(`Stage interactable ${id} kind must be one of: ${interactiveStageInteractableKinds.join(', ')}.`);
      const bounded = (key: 'x' | 'y' | 'width' | 'height', fallbackValue: number, minimum: number, maximum: number) => {
        const result = item[key] === undefined ? fallbackValue : Number(item[key]);
        if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Stage interactable ${id} ${key} must be between ${minimum} and ${maximum}.`);
        return result;
      };
      const x = bounded('x', 0.45, 0, 1);
      const y = bounded('y', 0.82, 0, 1);
      const width = bounded('width', 0.05, 0.015, 0.5);
      const height = bounded('height', 0.08, 0.015, 0.5);
      if (x + width > 1.000001) throw new Error(`Stage interactable ${id} extends past the right canvas edge.`);
      if (y + height > 1.000001) throw new Error(`Stage interactable ${id} extends past the bottom canvas edge.`);
      const color = String(item.color || '#ffbd59');
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Stage interactable ${id} color must be a six-digit hex color.`);
      const glyph = String(item.glyph || kind.slice(0, 3).toUpperCase()).trim().slice(0, 8);
      if (!glyph) throw new Error(`Stage interactable ${id} needs a glyph.`);
      const linkId = item.linkId === undefined ? undefined : String(item.linkId).trim();
      if (linkId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(linkId)) throw new Error(`Stage interactable ${id} linkId is invalid.`);
      const orientations = Array.isArray(item.orientations) ? item.orientations.map(String).filter((value): value is InteractiveStageOrientation => value === 'horizontal' || value === 'vertical') : ['horizontal', 'vertical'] as InteractiveStageOrientation[];
      if (!orientations.length) throw new Error(`Stage interactable ${id} needs at least one orientation.`);
      return { id, name: String(item.name || id).trim().slice(0, 80) || id, kind, x, y, width, height, color, glyph, ...(linkId ? { linkId } : {}), enabled: item.enabled !== false, orientations: [...new Set(orientations)] };
    });
    return {
      enabled: source.enabled === undefined ? fallback.enabled : source.enabled === true,
      wanderEnabled: source.wanderEnabled === undefined ? fallback.wanderEnabled : source.wanderEnabled === true,
      jumpEnabled: source.jumpEnabled === undefined ? fallback.jumpEnabled : source.jumpEnabled === true,
      floorY: number('floorY', 0.5, 0.98),
      speed: number('speed', 0.005, 0.2),
      gravity: number('gravity', 0.1, 3),
      jumpStrength: number('jumpStrength', 0.05, 1.2),
      platforms,
      interactables
    };
  }

  private worldMapFor(orientation: InteractiveStageOrientation): InteractiveStageWorldMap {
    return {
      ...clone(this.worldMap),
      platforms: this.worldMap.platforms.filter((platform) => platform.enabled && platform.orientations.includes(orientation)).map(clone),
      interactables: this.worldMap.interactables.filter((item) => item.enabled && item.orientations.includes(orientation)).map(clone)
    };
  }

  private resolveObjectPlacement(object: InteractiveStageObject): InteractiveStageObject {
    const next = clone(object);
    next.placement = this.resolvePlacement(next.id, next.kind, next.placement, 'horizontal');
    if (next.scenePlacements?.vertical) next.scenePlacements.vertical = this.resolvePlacement(next.id, next.kind, next.scenePlacements.vertical, 'vertical');
    return next;
  }

  private resolvePlacement(id: string, kind: InteractiveStageObject['kind'], placement: InteractiveStagePlacement, orientation: InteractiveStageOrientation): InteractiveStagePlacement {
    const radius = kind === 'avatar' ? 0.045 * placement.scale : 0.03 * placement.scale;
    const blocked = (candidate: InteractiveStagePlacement) => {
      const zoneHit = this.protectedZones.some((zone) => zone.enabled && zone.orientations.includes(orientation) && candidate.x + radius > zone.x && candidate.x - radius < zone.x + zone.width && candidate.y + radius > zone.y && candidate.y - radius < zone.y + zone.height);
      if (zoneHit) return true;
      if (!this.collisionAvoidance || kind !== 'avatar') return false;
      return [...this.objects.values()].some((other) => {
        if (other.id === id || other.kind !== 'avatar') return false;
        const otherPlacement = orientation === 'vertical' ? other.scenePlacements?.vertical || other.placement : other.placement;
        const otherRadius = 0.045 * otherPlacement.scale;
        return Math.hypot(candidate.x - otherPlacement.x, candidate.y - otherPlacement.y) < radius + otherRadius;
      });
    };
    const clamp = (value: number) => Math.max(radius, Math.min(1 - radius, value));
    const base = { ...placement, x: clamp(placement.x), y: clamp(placement.y) };
    if (!blocked(base)) return base;
    for (let ring = 1; ring <= 10; ring += 1) {
      const distance = ring * 0.055;
      for (let step = 0; step < 16; step += 1) {
        const angle = step / 16 * Math.PI * 2;
        const candidate = { ...base, x: clamp(base.x + Math.cos(angle) * distance), y: clamp(base.y + Math.sin(angle) * distance) };
        if (!blocked(candidate)) return candidate;
      }
    }
    return base;
  }

  private persistSettings(): Promise<void> {
    if (!this.settingsPath) return Promise.resolve();
    const settingsPath = this.settingsPath;
    const serialized = `${JSON.stringify({ schemaVersion: 1, collisionAvoidance: this.collisionAvoidance, protectedZones: this.protectedZones, worldMap: this.worldMap, worldState: this.worldState }, null, 2)}\n`;
    const operation = this.persistQueue.then(async () => {
      const temporary = `${settingsPath}.tmp`;
      await writeFile(temporary, serialized, 'utf8');
      await rename(temporary, settingsPath);
    });
    this.persistQueue = operation.catch(() => {});
    return operation;
  }

  private forOrientation(object: InteractiveStageObject, orientation: InteractiveStageOrientation): InteractiveStageObject {
    const placement = object.scenePlacements?.[orientation] || object.placement;
    return { ...clone(object), placement: clone(placement) };
  }

  private touch(): void {
    this.revision += 1;
    this.updatedAt = new Date().toISOString();
  }

  private scheduleExpiry(object: InteractiveStageObject): void {
    const previous = this.expiryTimers.get(object.id);
    if (previous) clearTimeout(previous);
    this.expiryTimers.delete(object.id);
    if (!object.expiresAt) return;
    const remaining = Math.max(1, Date.parse(object.expiresAt) - Date.now());
    const timer = setTimeout(() => this.dismiss(object.id, 'expired'), remaining);
    timer.unref?.();
    this.expiryTimers.set(object.id, timer);
  }

  private prune(): void {
    const now = Date.now();
    for (const object of [...this.objects.values()]) if (object.expiresAt && Date.parse(object.expiresAt) <= now) this.dismiss(object.id, 'expired');
  }

  private broadcastObject(event: string, object: InteractiveStageObject): void {
    for (const client of this.clients) this.write(client.response, event, { revision: this.revision, object: this.forOrientation(object, client.orientation) });
  }

  private broadcast(event: string, payload: unknown): void {
    for (const client of this.clients) this.write(client.response, event, payload);
  }

  private write(response: ServerResponse, event: string, payload: unknown): void {
    if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}


