import { ServerResponse } from 'node:http';
import { TempestNormalizedTwitchEvent, TempestSoundAlertDefinition, TempestTwitchAlertDesign, TempestTwitchVisualAlertDefinition } from '@tempest/contracts';

export interface TempestVisualAlertEvent {
  alertId: string;
  runId: string;
  name: string;
  viewerName: string;
  accent: string;
  effect: string;
  durationMs: number;
  mediaUrl?: string;
  mediaKind?: 'image' | 'video';
  audioUrl?: string;
  audioDurationMs?: number;
  volume?: number;
  design?: TempestTwitchAlertDesign;
  variables?: Record<string, string>;
  startedAt: string;
}

export interface TempestVisualAlertStatus {
  state: 'ready' | 'showing';
  url: string;
  connectedClients: number;
  activeAlert?: TempestVisualAlertEvent;
}

const visualAlertPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>Tempest Studio Visual Alerts</title>
  <style id="baseStyle">
    :root{color-scheme:dark;--accent:#54f2eb;--text:#f5fbff;--secondary:#a9bdc7;--eyebrow-text:#54f2eb;--message-text:#f5fbff;--background:rgba(5,12,19,.94);--font:Inter;--font-size:42px;--eyebrow-font-size:13px;--detail-font-size:21px;--message-font-size:16px;--font-weight:800;--letter-spacing:0px;--text-shadow:0.35;--card-width:900px;--border-width:1px;--border-radius:24px;--padding:22px;--card-shadow:.55;--media-width:320px;--media-height:210px;--media-radius:16px;--media-fit:contain;--media-scale:1;--media-position-x:50%;--media-position-y:50%;--media-opacity:1;--text-x:0px;--text-y:0px;--text-anchor-x:0px;--text-anchor-y:0px;--eyebrow-position-x:50%;--eyebrow-position-y:52%;--headline-position-x:50%;--headline-position-y:63%;--detail-position-x:50%;--detail-position-y:74%;--message-position-x:50%;--message-position-y:84%;--eyebrow-max-width:1000px;--headline-max-width:1800px;--detail-max-width:1600px;--message-max-width:1600px}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Inter,Segoe UI,sans-serif}.stage{display:flex;width:100%;height:100%;padding:4vh 4vw;pointer-events:none}.placement{flex:none;transform:translate(var(--stage-x,0px),var(--stage-y,0px)) scale(var(--alert-scale,1));transform-origin:center}.stage.custom{position:relative;display:block;padding:0}.stage.custom .placement{position:absolute;left:calc(var(--custom-x,50%) + var(--stage-x,0px));top:calc(var(--custom-y,82%) + var(--stage-y,0px));transform:translate(-50%,-50%) scale(var(--alert-scale,1))}body[data-position^="top-"] .stage{align-items:flex-start}body[data-position^="center"] .stage{align-items:center}body[data-position^="bottom-"] .stage{align-items:flex-end}body[data-position$="left"] .stage{justify-content:flex-start}body[data-position$="-center"] .stage,body[data-position="center"] .stage{justify-content:center}body[data-position$="right"] .stage{justify-content:flex-end}
    .alert{position:relative;display:grid;grid-template-columns:minmax(0,var(--media-width)) minmax(220px,1fr);align-items:center;gap:22px;width:min(var(--card-width),92vw);min-height:120px;padding:var(--padding);overflow:hidden;border:var(--border-width) solid color-mix(in srgb,var(--accent) 62%,#18303c);border-radius:var(--border-radius);background:var(--background);box-shadow:0 0 calc(90px * var(--card-shadow)) color-mix(in srgb,var(--accent) 42%,transparent),inset 0 0 30px rgba(84,242,235,.05);opacity:0;transform-origin:center;transition:opacity .38s ease,transform .52s cubic-bezier(.2,.9,.2,1);isolation:isolate}.alert.visible{opacity:1;transform:none}.alert:before{position:absolute;inset:-1px auto -1px -1px;width:max(4px,var(--border-width));border-radius:inherit;background:var(--accent);box-shadow:0 0 28px var(--accent);content:""}.scan{position:absolute;inset:0;z-index:-1;border-radius:inherit;background:repeating-linear-gradient(0deg,transparent 0 5px,rgba(255,255,255,.018) 6px);pointer-events:none}
    .alert[data-preset="minimal"]{border-color:transparent;background:transparent;box-shadow:none}.alert[data-preset="minimal"]:before,.alert[data-preset="minimal"] .scan{display:none}.alert[data-preset="compact"]{gap:13px;min-height:90px}.alert[data-preset="compact"] .media{max-height:140px}.alert[data-preset="glass"]{background:color-mix(in srgb,var(--background) 72%,transparent);backdrop-filter:blur(18px) saturate(1.35)}.alert[data-preset="neon"]{border-color:var(--accent);box-shadow:0 0 calc(115px * var(--card-shadow)) color-mix(in srgb,var(--accent) 55%,transparent),inset 0 0 42px color-mix(in srgb,var(--accent) 10%,transparent)}.alert[data-preset="cinematic"]{background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--background) 96%,black) 14% 86%,transparent);border-left-color:transparent;border-right-color:transparent;border-radius:0}.alert[data-preset="cinematic"]:before{display:none}
    .alert[data-layout="media-right"]{grid-template-columns:minmax(220px,1fr) minmax(0,var(--media-width))}.alert[data-layout="media-right"] .media{order:2}.alert[data-layout="media-right"] .copy{order:1}.alert[data-layout="media-top"]{grid-template-columns:1fr;justify-items:center;text-align:center}.alert[data-layout="media-top"] .media{width:min(100%,var(--media-width))}.alert[data-layout="media-overlay"]{display:block;width:min(var(--media-width),96vw);height:min(var(--media-height),96vh);min-height:40px;padding:0;background:transparent}.alert[data-layout="media-overlay"] .media{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit}.alert[data-layout="media-overlay"] .copy{position:absolute;inset:0;z-index:2;width:auto;transform:none}.alert[data-layout="media-overlay"] .copy>*{position:absolute;margin:0;transform:translate(-50%,-50%)}.alert[data-layout="media-overlay"] .eyebrow{left:var(--eyebrow-position-x);top:var(--eyebrow-position-y);width:min(var(--eyebrow-max-width),92%)}.alert[data-layout="media-overlay"] .name{left:var(--headline-position-x);top:var(--headline-position-y);width:min(var(--headline-max-width),92%)}.alert[data-layout="media-overlay"] .detail{left:var(--detail-position-x);top:var(--detail-position-y);width:min(var(--detail-max-width),92%)}.alert[data-layout="media-overlay"] .message{left:var(--message-position-x);top:var(--message-position-y);width:min(var(--message-max-width),92%)}.alert[data-layout="text-only"]{grid-template-columns:1fr}.alert[data-layout="text-only"] .media{display:none}.alert[data-layout="media-only"]{display:flex;justify-content:center;width:min(var(--card-width),92vw);background:transparent;border-color:transparent;box-shadow:none}.alert[data-layout="media-only"] .copy,.alert[data-layout="media-only"]:before,.alert[data-layout="media-only"] .scan{display:none}
    .media{display:grid;place-items:center;width:100%;height:var(--media-height);overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 36%,#1b303a);border-radius:var(--media-radius);background:radial-gradient(circle at center,color-mix(in srgb,var(--accent) 15%,transparent),rgba(0,0,0,.35));opacity:0;transition:opacity .3s ease}.media.ready{opacity:1}.media:empty:after{font:900 62px/1 Consolas;color:var(--accent);text-shadow:0 0 26px var(--accent);content:"!"}.media img,.media video{display:block;width:100%;height:100%;object-fit:var(--media-fit);object-position:var(--media-position-x) var(--media-position-y);opacity:var(--media-opacity);transform:scale(var(--media-scale));transform-origin:var(--media-position-x) var(--media-position-y)}.copy{min-width:0;text-align:var(--text-align,left);opacity:0;transform:translate(calc(var(--text-anchor-x) + var(--text-x)),calc(var(--text-anchor-y) + var(--text-y)));transition:opacity .3s ease}.copy.ready{opacity:1}.eyebrow{max-width:var(--eyebrow-max-width);margin:0 0 9px;color:var(--eyebrow-text);font:700 var(--eyebrow-font-size)/1.2 Consolas,monospace;letter-spacing:.22em;text-transform:uppercase}.name{max-width:var(--headline-max-width);margin:0;color:var(--text);font-family:var(--font),sans-serif;font-size:var(--font-size);font-weight:var(--font-weight);line-height:1.03;letter-spacing:var(--letter-spacing);text-shadow:0 0 calc(34px * var(--text-shadow)) color-mix(in srgb,var(--accent) 68%,transparent);white-space:pre-line}.detail{max-width:var(--detail-max-width);margin:13px 0 0;color:var(--secondary);font-family:var(--font),sans-serif;font-size:var(--detail-font-size);line-height:1.25;white-space:pre-line}.message{max-width:var(--message-max-width);margin:9px 0 0;padding-left:10px;border-left:2px solid var(--accent);color:var(--message-text);font-family:var(--font),sans-serif;font-size:var(--message-font-size);font-style:italic}.message:empty{display:none}.custom-html{position:absolute;inset:0;z-index:3;pointer-events:none}
    .alert[data-enter="fade"]{transform:scale(.985)}.alert[data-enter="slide-up"]{transform:translateY(90px)}.alert[data-enter="slide-down"]{transform:translateY(-90px)}.alert[data-enter="slide-left"]{transform:translateX(130px)}.alert[data-enter="slide-right"]{transform:translateX(-130px)}.alert[data-enter="zoom"]{transform:scale(.55)}.alert[data-enter="flip"]{transform:perspective(800px) rotateX(72deg) scale(.82)}.alert.visible[data-enter]{transform:none}.alert.visible[data-enter="bounce"]{animation:enter-bounce .72s both}.alert.visible[data-enter="glitch"]{animation:enter-glitch .58s both}.alert.leaving{opacity:0!important}.alert.leaving[data-exit="fade"]{transform:none}.alert.leaving[data-exit="slide-up"]{transform:translateY(-90px)}.alert.leaving[data-exit="slide-down"]{transform:translateY(90px)}.alert.leaving[data-exit="slide-left"]{transform:translateX(-130px)}.alert.leaving[data-exit="slide-right"]{transform:translateX(130px)}.alert.leaving[data-exit="zoom"]{transform:scale(.55)}
    .copy[data-text-animation="pulse"].ready{animation:text-pulse 1.1s ease-in-out infinite}.copy[data-text-animation="wiggle"].ready{animation:text-wiggle .75s ease-in-out infinite}.copy[data-text-animation="glow"].ready .name{animation:text-glow 1.7s ease-in-out infinite alternate}.copy[data-text-animation="typewriter"].ready .name{overflow:hidden;animation:typewriter .9s steps(22,end) both}
    @keyframes enter-bounce{0%{opacity:0;transform:translateY(100px) scale(.85)}55%{opacity:1;transform:translateY(-18px) scale(1.03)}75%{transform:translateY(7px) scale(.99)}100%{transform:none}}@keyframes enter-glitch{0%{opacity:0;transform:translate(-35px,18px) skewX(12deg);filter:hue-rotate(80deg)}35%{opacity:1;transform:translate(18px,-8px) skewX(-8deg)}62%{transform:translate(-8px,3px);filter:hue-rotate(-40deg)}100%{transform:none;filter:none}}@keyframes text-pulse{50%{transform:translate(calc(var(--text-anchor-x) + var(--text-x)),calc(var(--text-anchor-y) + var(--text-y))) scale(1.035)}}@keyframes text-wiggle{0%,100%{transform:translate(calc(var(--text-anchor-x) + var(--text-x)),calc(var(--text-anchor-y) + var(--text-y))) rotate(0)}25%{transform:translate(calc(var(--text-anchor-x) + var(--text-x) - 3px),calc(var(--text-anchor-y) + var(--text-y))) rotate(-1deg)}75%{transform:translate(calc(var(--text-anchor-x) + var(--text-x) + 3px),calc(var(--text-anchor-y) + var(--text-y))) rotate(1deg)}}@keyframes text-glow{to{text-shadow:0 0 30px var(--accent)}}@keyframes typewriter{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
    @media(max-width:700px){.alert{grid-template-columns:1fr;width:min(520px,92vw)}.media{height:min(var(--media-height),180px)}.name{font-size:min(var(--font-size),32px)}}
  </style>
  <style id="customStyle"></style>
</head>
<body data-position="bottom-center">
  <div id="stage" class="stage"><div id="placement" class="placement"><article id="alert" class="alert" aria-live="polite" data-preset="tempest" data-layout="media-left" data-enter="slide-up" data-exit="fade"><div id="media" class="media"></div><div id="copy" class="copy"><p id="eyebrow" class="eyebrow">Tempest Twitch alert</p><h1 id="name" class="name">Alert</h1><p id="detail" class="detail">Triggered by Viewer</p><p id="message" class="message"></p></div><div id="customHtml" class="custom-html"></div><div class="scan"></div></article></div></div>
  <audio id="alertAudio" preload="auto"></audio>
  <script>
    (()=>{
      const root=document.documentElement,body=document.body,stage=document.getElementById('stage'),placement=document.getElementById('placement'),card=document.getElementById('alert'),media=document.getElementById('media'),copy=document.getElementById('copy'),eyebrow=document.getElementById('eyebrow'),name=document.getElementById('name'),detail=document.getElementById('detail'),message=document.getElementById('message'),customHtml=document.getElementById('customHtml'),audio=document.getElementById('alertAudio'),customStyle=document.getElementById('customStyle');
      const fallback={preset:'tempest',layout:'media-left',position:'bottom-center',positionOffsetX:0,positionOffsetY:0,customPositionX:50,customPositionY:82,scale:1,entranceAnimation:'slide-up',exitAnimation:'fade',textAnimation:'glow',headlineTemplate:'{event}',detailTemplate:'Triggered by {viewer}',showEyebrow:true,showHeadline:true,showDetail:true,showViewerMessage:true,fontFamily:'Inter',fontSize:42,eyebrowFontSize:13,detailFontSize:21,messageFontSize:16,fontWeight:800,textAlign:'left',textColor:'#F5FBFF',secondaryTextColor:'#A9BDC7',eyebrowTextColor:'#54F2EB',messageTextColor:'#F5FBFF',textShadow:.35,letterSpacing:0,textOffsetX:0,textOffsetY:0,textPositionX:50,textPositionY:72,eyebrowPositionX:50,eyebrowPositionY:52,headlinePositionX:50,headlinePositionY:63,detailPositionX:50,detailPositionY:74,messagePositionX:50,messagePositionY:84,eyebrowMaxWidth:1000,headlineMaxWidth:1800,detailMaxWidth:1600,messageMaxWidth:1600,cardWidth:900,backgroundColor:'#050C13',backgroundOpacity:.94,borderWidth:1,borderRadius:24,padding:22,cardShadow:.55,mediaWidth:320,mediaHeight:210,mediaFit:'contain',mediaScale:1,mediaPositionX:50,mediaPositionY:50,mediaOpacity:1,mediaBorderRadius:16,mediaDelayMs:0,textDelayMs:0,textDurationMs:0,soundDelayMs:0,ttsEnabled:false,ttsTemplate:'{viewer}: {event}',ttsVolume:.8,ttsRate:1,ttsPitch:1,customHtml:'',customCss:'',customJavaScript:''};
      let timers=[],revision=0;
      function later(fn,delay){const timer=setTimeout(fn,Math.max(0,Number(delay)||0));timers.push(timer);return timer}function cancelTimers(){for(const timer of timers)clearTimeout(timer);timers=[]}
      function stopAudio(){audio.pause();audio.removeAttribute('src');audio.load();if('speechSynthesis'in window)window.speechSynthesis.cancel()}
      function rgba(hex,opacity){const clean=String(hex||'#050C13').replace('#','');const number=parseInt(clean,16);return 'rgba('+((number>>16)&255)+','+((number>>8)&255)+','+(number&255)+','+Math.max(0,Math.min(1,Number(opacity)))+')'}
      function template(value,variables){return String(value||'').replace(/\{([a-z]+)\}/gi,(_,key)=>variables[String(key).toLowerCase()]??'')}
      function cleanupCustomCode(){if(typeof window.__tempestAlertCleanup==='function'){try{window.__tempestAlertCleanup()}catch(error){console.error('Tempest custom alert cleanup failed',error)}}window.__tempestAlertCleanup=undefined;window.TempestAlertContext=undefined}
      function clear(options){revision++;cancelTimers();if(options&&options.stopAudio)stopAudio();cleanupCustomCode();card.style.removeProperty('transform');card.classList.add('leaving');card.classList.remove('visible');copy.classList.remove('ready');media.classList.remove('ready');later(()=>{if(!card.classList.contains('visible')){media.replaceChildren();customHtml.replaceChildren();card.classList.remove('leaving');customStyle.textContent=''}},560)}
      function attachMedia(data,current){if(revision!==current)return;media.replaceChildren();if(data.mediaUrl){const element=document.createElement(data.mediaKind==='video'?'video':'img');element.src=data.mediaUrl+(data.mediaUrl.includes('?')?'&':'?')+'run='+encodeURIComponent(data.runId||Date.now());if(element.tagName==='VIDEO'){element.autoplay=true;element.loop=true;element.muted=true;element.playsInline=true}media.append(element)}media.classList.add('ready')}
      function playAudio(data,current){if(revision!==current||!data.audioUrl)return;audio.src=data.audioUrl+(data.audioUrl.includes('?')?'&':'?')+'run='+encodeURIComponent(data.runId||Date.now());audio.volume=Math.max(0,Math.min(1,Number(data.volume)||0));audio.play().catch(()=>{});later(()=>{if(revision===current)stopAudio()},Math.max(1000,Number(data.audioDurationMs)||60000))}
      function speak(text,design,current){if(revision!==current||!design.ttsEnabled||!text||!('speechSynthesis'in window))return;const utterance=new SpeechSynthesisUtterance(text);utterance.volume=design.ttsVolume;utterance.rate=design.ttsRate;utterance.pitch=design.ttsPitch;window.speechSynthesis.speak(utterance)}
      function runCustomCode(source,data,variables){cleanupCustomCode();if(!source)return;window.TempestAlertContext={data,variables,elements:{stage,placement,card,media,copy,eyebrow,name,detail,message,customHtml,audio}};const runner=document.createElement('script');runner.textContent='try{window.__tempestAlertCleanup=(()=>{const context=window.TempestAlertContext;const data=context.data;const variables=context.variables;const elements=context.elements;'+source+'\n})()||undefined}catch(error){console.error("Tempest custom alert JavaScript failed",error)}';document.body.append(runner);runner.remove()}
      function show(data){
        const current=++revision;cancelTimers();stopAudio();const design=Object.assign({},fallback,data.design||{});const variables=Object.assign({viewer:data.viewerName||'A viewer',event:data.name||'Alert',name:data.name||'Alert',amount:'',message:'',reward:'',tier:'',months:''},data.variables||{});
        root.style.setProperty('--accent',data.accent||'#54f2eb');root.style.setProperty('--text',design.textColor);root.style.setProperty('--secondary',design.secondaryTextColor);root.style.setProperty('--eyebrow-text',design.eyebrowTextColor);root.style.setProperty('--message-text',design.messageTextColor);root.style.setProperty('--background',rgba(design.backgroundColor,design.backgroundOpacity));root.style.setProperty('--font',JSON.stringify(design.fontFamily));root.style.setProperty('--font-size',design.fontSize+'px');root.style.setProperty('--eyebrow-font-size',design.eyebrowFontSize+'px');root.style.setProperty('--detail-font-size',design.detailFontSize+'px');root.style.setProperty('--message-font-size',design.messageFontSize+'px');root.style.setProperty('--font-weight',design.fontWeight);root.style.setProperty('--letter-spacing',design.letterSpacing+'px');root.style.setProperty('--text-shadow',design.textShadow);root.style.setProperty('--card-width',design.cardWidth+'px');root.style.setProperty('--border-width',design.borderWidth+'px');root.style.setProperty('--border-radius',design.borderRadius+'px');root.style.setProperty('--padding',design.padding+'px');root.style.setProperty('--card-shadow',design.cardShadow);root.style.setProperty('--media-width',design.mediaWidth+'px');root.style.setProperty('--media-height',design.mediaHeight+'px');root.style.setProperty('--media-radius',design.mediaBorderRadius+'px');root.style.setProperty('--media-fit',design.mediaFit);root.style.setProperty('--media-scale',design.mediaScale);root.style.setProperty('--media-position-x',design.mediaPositionX+'%');root.style.setProperty('--media-position-y',design.mediaPositionY+'%');root.style.setProperty('--media-opacity',design.mediaOpacity);root.style.setProperty('--text-x',design.textOffsetX+'px');root.style.setProperty('--text-y',design.textOffsetY+'px');root.style.setProperty('--text-position-x',design.textPositionX+'%');root.style.setProperty('--text-position-y',design.textPositionY+'%');root.style.setProperty('--eyebrow-position-x',design.eyebrowPositionX+'%');root.style.setProperty('--eyebrow-position-y',design.eyebrowPositionY+'%');root.style.setProperty('--headline-position-x',design.headlinePositionX+'%');root.style.setProperty('--headline-position-y',design.headlinePositionY+'%');root.style.setProperty('--detail-position-x',design.detailPositionX+'%');root.style.setProperty('--detail-position-y',design.detailPositionY+'%');root.style.setProperty('--message-position-x',design.messagePositionX+'%');root.style.setProperty('--message-position-y',design.messagePositionY+'%');root.style.setProperty('--eyebrow-max-width',design.eyebrowMaxWidth+'px');root.style.setProperty('--headline-max-width',design.headlineMaxWidth+'px');root.style.setProperty('--detail-max-width',design.detailMaxWidth+'px');root.style.setProperty('--message-max-width',design.messageMaxWidth+'px');root.style.setProperty('--text-anchor-x',design.layout==='media-overlay'?'0px':'0px');root.style.setProperty('--text-anchor-y',design.layout==='media-overlay'?'0px':'0px');root.style.setProperty('--text-align',design.textAlign);
        body.dataset.position=design.position;stage.classList.toggle('custom',design.position==='custom');placement.style.setProperty('--stage-x',design.positionOffsetX+'px');placement.style.setProperty('--stage-y',design.positionOffsetY+'px');placement.style.setProperty('--custom-x',design.customPositionX+'%');placement.style.setProperty('--custom-y',design.customPositionY+'%');placement.style.setProperty('--alert-scale',design.scale);card.dataset.preset=design.preset;card.dataset.layout=design.layout;card.dataset.enter=design.entranceAnimation;card.dataset.exit=design.exitAnimation;copy.dataset.textAnimation=design.textAnimation;customStyle.textContent=design.customCss||'';
        eyebrow.textContent=data.alertId&&data.alertId.startsWith('twitch.')?'Tempest Twitch alert':'Tempest Interaction alert';name.textContent=template(design.headlineTemplate,variables)||data.name||'Alert';detail.textContent=template(design.detailTemplate,variables);message.textContent=design.showViewerMessage?variables.message||'': '';eyebrow.hidden=!design.showEyebrow;name.hidden=!design.showHeadline;detail.hidden=!design.showDetail;message.hidden=!design.showViewerMessage;media.replaceChildren();customHtml.innerHTML=template(design.customHtml,variables);media.classList.remove('ready');copy.classList.remove('ready');card.style.removeProperty('transform');card.classList.remove('leaving','visible');runCustomCode(design.customJavaScript,data,variables);
        later(()=>attachMedia(data,current),design.mediaDelayMs);later(()=>{if(revision===current)copy.classList.add('ready')},design.textDelayMs);if(design.textDurationMs>0)later(()=>{if(revision===current)copy.classList.remove('ready')},design.textDelayMs+design.textDurationMs);later(()=>playAudio(data,current),design.soundDelayMs);later(()=>speak(template(design.ttsTemplate,variables),design,current),design.soundDelayMs);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{card.classList.add('visible');card.style.transform='none'}));later(()=>{if(revision===current)clear({stopAudio:false})},Math.max(1000,Number(data.durationMs)||6000));
      }
      const events=new EventSource(__TEMPEST_ALERT_EVENTS__);events.addEventListener('show',event=>show(JSON.parse(event.data)));events.addEventListener('clear',event=>{let data={};try{data=JSON.parse(event.data||'{}')}catch{}clear({stopAudio:data.stopAudio!==false})});events.onerror=()=>{};
    })();
  </script>
</body>
</html>`;

function mediaKind(uri?: string): 'image' | 'video' | undefined {
  if (!uri) return undefined;
  return /\.(?:mp4|webm)$/i.test(new URL(uri).pathname) ? 'video' : 'image';
}

export class TempestVisualAlertOverlay {
  private readonly clients = new Set<ServerResponse>();
  private activeAlert?: TempestVisualAlertEvent;
  private clearTimer?: NodeJS.Timeout;

  page(eventsPath = '/visual-alerts/events'): string {
    return visualAlertPage.replace('__TEMPEST_ALERT_EVENTS__', JSON.stringify(eventsPath));
  }

  connect(response: ServerResponse): void {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, this.activeAlert ? 'show' : 'clear', this.activeAlert || {});
    response.on('close', () => this.clients.delete(response));
  }

  show(alert: TempestSoundAlertDefinition, viewerName: string | undefined, runId: string, includeAudio = false): TempestVisualAlertEvent {
    const browserAudio = includeAudio && alert.audioUri && !alert.broadcastAudioSource;
    return this.activate({
      alertId: alert.id,
      runId,
      name: alert.name,
      viewerName: viewerName?.trim() || 'A viewer',
      accent: alert.accent || '#54F2EB',
      effect: alert.broadcastEffect || 'spectrum',
      durationMs: alert.visualDurationMs,
      design: alert.design,
      variables: {
        viewer: viewerName?.trim() || 'A viewer',
        name: alert.name,
        event: alert.name,
        amount: '',
        message: '',
        reward: '',
        tier: '',
        months: '',
        topic: 'viewer.interaction'
      },
      ...(alert.visualUri ? { mediaUrl: `/visual-alerts/media/${encodeURIComponent(alert.id)}`, mediaKind: mediaKind(alert.visualUri) } : {}),
      ...(browserAudio ? { audioUrl: `/visual-alerts/audio/${encodeURIComponent(alert.id)}`, audioDurationMs: alert.durationMs, volume: alert.volume } : {}),
      startedAt: new Date().toISOString()
    });
  }

  showTwitch(alert: TempestTwitchVisualAlertDefinition, event: TempestNormalizedTwitchEvent, runId = event.id): TempestVisualAlertEvent {
    const viewerName = event.topic === 'viewer.raid.received'
      ? String(event.payload.fromBroadcasterName || 'A raider')
      : event.viewer?.displayName || event.viewer?.login || 'A viewer';
    const name = event.topic === 'viewer.cheer.received' && Number(event.payload.bits) > 0
      ? `${Number(event.payload.bits)} Bits`
      : event.topic === 'viewer.raid.received' && Number(event.payload.viewers) > 0
        ? `Raid with ${Number(event.payload.viewers)} viewers`
        : event.topic === 'viewer.reward.redeemed' && typeof event.payload.rewardTitle === 'string'
          ? event.payload.rewardTitle
          : alert.name;
    const amount = event.topic === 'viewer.cheer.received' ? event.payload.bits
      : event.topic === 'viewer.raid.received' ? event.payload.viewers
        : event.topic === 'viewer.subscription.started' ? event.payload.cumulativeMonths
          : event.topic === 'viewer.reward.redeemed' ? event.payload.rewardCost : '';
    const viewerMessage = typeof event.payload.message === 'string' ? event.payload.message
      : typeof event.payload.input === 'string' ? event.payload.input
        : typeof event.payload.text === 'string' ? event.payload.text : '';
    return this.activate({
      alertId: alert.id,
      runId,
      name,
      viewerName,
      accent: alert.accent,
      effect: 'pulse',
      durationMs: alert.durationMs,
      design: alert.design,
      variables: {
        viewer: viewerName,
        name: viewerName,
        event: name,
        amount: amount === undefined || amount === null ? '' : String(amount),
        message: viewerMessage,
        reward: typeof event.payload.rewardTitle === 'string' ? event.payload.rewardTitle : '',
        tier: event.payload.tier === undefined ? '' : String(event.payload.tier),
        months: event.payload.cumulativeMonths === undefined ? '' : String(event.payload.cumulativeMonths),
        topic: event.topic
      },
      ...(alert.visualUri ? { mediaUrl: `/visual-alerts/media/${encodeURIComponent(alert.id)}${alert.selectedVariantId ? `?variant=${encodeURIComponent(alert.selectedVariantId)}` : ''}`, mediaKind: mediaKind(alert.visualUri) } : {}),
      ...(alert.audioUri ? { audioUrl: `/visual-alerts/audio/${encodeURIComponent(alert.id)}${alert.selectedVariantId ? `?variant=${encodeURIComponent(alert.selectedVariantId)}` : ''}`, audioDurationMs: alert.durationMs, volume: alert.volume } : {}),
      startedAt: new Date().toISOString()
    });
  }

  private activate(event: TempestVisualAlertEvent): TempestVisualAlertEvent {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.activeAlert = event;
    this.broadcast('show', this.activeAlert);
    const expectedRun = event.runId;
    this.clearTimer = setTimeout(() => {
      if (this.activeAlert?.runId === expectedRun) this.clear(false);
    }, event.durationMs);
    this.clearTimer.unref?.();
    return structuredClone(this.activeAlert);
  }

  clear(stopAudio = true): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = undefined;
    this.activeAlert = undefined;
    this.broadcast('clear', { stopAudio });
  }

  hasClients(): boolean {
    return this.clients.size > 0;
  }

  status(url: string): TempestVisualAlertStatus {
    return {
      state: this.activeAlert ? 'showing' : 'ready',
      url,
      connectedClients: this.clients.size,
      ...(this.activeAlert ? { activeAlert: structuredClone(this.activeAlert) } : {})
    };
  }

  close(): void {
    this.clear();
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  private broadcast(event: string, payload: unknown): void {
    for (const client of this.clients) this.write(client, event, payload);
  }

  private write(response: ServerResponse, event: string, payload: unknown): void {
    if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
