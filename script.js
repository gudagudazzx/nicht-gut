'use strict';

/* ── SPRITES ── */
const MENTOR_EXPR={
  greet_talk:  IMGS.mentor_hello_talk,    // waving, talking
  greet_smile: IMGS.mentor_hello_smile,   // waving, smiling
  praise:      IMGS.mentor_praise,        // thumbs up Good Job!
  hint_talk:   IMGS.mentor_hint_talk,     // lightbulb + talking
  hint_smile:  IMGS.mentor_hint_smile,    // finger up, smiling
  laugh:       IMGS.mentor_clap1,         // clapping frame 1
  laugh_talk:  IMGS.mentor_clap2,         // clapping frame 2
};
const CHALL_EXPR={
  neutral:      IMGS.chall_neutral,       // calm, reading papers
  talk:         IMGS.chall_neutral_talk,  // calm talking
  frown:        IMGS.chall_frown,         // frowning
  frown_talk:   IMGS.chall_frown_talk,    // frowning + talking (hard questions)
  smile:        IMGS.chall_smile,         // slight smile (rare)
  smile_talk:   IMGS.chall_smile_talk,    // slight smile + talking
};

// Friendly interviewer (new girl) — used in Gentle mode + easy Qs in Realistic
const FRIENDLY_EXPR={
  calm:         IMGS.fi_calm,             // calm, neutral listen
  calm_talk:    IMGS.fi_calm_talk,        // calm talking
  approve:      IMGS.fi_approve,          // warm smile listening
  approve_talk: IMGS.fi_approve_talk,     // warm smile talking
  excited_talk: IMGS.fi_highly_approve,   // excited, eyes closed, talking
};

/* Smooth expression crossfade — RPG-style blend */
/* Preloaded image cache — prevents blank flash during src swap */
const _imgCache = {};
function preloadImg(src){
  if(!_imgCache[src]){ const i=new Image(); i.src=src; _imgCache[src]=i; }
}

function setExpr(spriteId, src){
  const el=document.getElementById(spriteId);
  if(!el || el._currentSrc===src) return;  // already showing this image
  el._currentSrc=src;
  // Preload target if not already cached
  if(!_imgCache[src]){ const i=new Image(); i.src=src; _imgCache[src]=i; }
  // Instant swap — no opacity flash, image already in memory
  el.style.transition='none';
  el.style.opacity='1';
  el.src=src;
  // Tiny scale pulse to signal the change (subtle, not distracting)
  el.style.transform='scale(1.0)';
  clearTimeout(el._scaleTimer);
  el._scaleTimer=setTimeout(()=>{ el.style.transform=''; },1);
}
function setMentor(expr){
  const src = MENTOR_EXPR[expr]||MENTOR_EXPR.hint_smile;
  setExpr('mentorSprite', src);
}
function setChall(expr){
  const src = CHALL_EXPR[expr]||CHALL_EXPR.neutral;
  setExpr('challSprite', src);
}
function setFriendly(expr){
  const src = FRIENDLY_EXPR[expr]||FRIENDLY_EXPR.calm;
  setExpr('friendlySprite', src);
}

/* Init sprites */
// Debate opponent expressions (placeholder: mentor sprites until artwork arrives)
const DEBATE_EXPR={
  neutral:   IMGS.mentor_hint_smile,   // listening, arms crossed
  talk:      IMGS.mentor_hint_talk,    // making argument
  challenge: IMGS.mentor_greet_talk,   // challenging your point
  agree:     IMGS.mentor_laugh,        // impressed by good point
  fire:      IMGS.mentor_laugh_talk,   // passionate rebuttal
};
// Small talk listener expressions (placeholder: mentor sprites)
const LISTEN_EXPR={
  idle:      IMGS.mentor_greet_smile,  // waiting for you to speak
  attentive: IMGS.mentor_hint_talk,    // leaning in, interested
  respond:   IMGS.mentor_greet_talk,   // speaking gently
  think:     IMGS.mentor_hint_smile,   // processing
  encourage: IMGS.mentor_laugh,        // warm nod
};

// Active character expression maps — swapped per scenario
let ACTIVE_CHAR_EXPR = CHALL_EXPR;  // default: interview

function setDebater(expr){ setExpr('challSprite', DEBATE_EXPR[expr]||DEBATE_EXPR.neutral); }
function setListener(expr){ setExpr('challSprite', LISTEN_EXPR[expr]||LISTEN_EXPR.idle); }

document.getElementById('mentorSprite').src  = MENTOR_EXPR.greet_smile;
document.getElementById('challSprite').src   = CHALL_EXPR.neutral;
document.getElementById('friendlySprite').src = FRIENDLY_EXPR.calm;
// Desk is drawn into sprites — no separate desk element needed

/* ── CONFIG ── */
const CFG={
  API_TIMEOUT_MS:12000,
  MAX_RETRIES:3,
  DEBATE_ROUNDS:6,
  ST_TURNS:8,
  // MiniMax voice IDs for each character
  // Full list: https://platform.minimax.io/docs/api-reference/speech-t2a
  minimax:{
    model: 'speech-02-turbo',   // turbo = fast (real-time feel); hd = higher quality
    endpoint: 'https://api.minimax.io/v1/t2a_v2',
    voices:{
      // Interviewer — calm, authoritative, measured male voice
      challenger: { id:'male-qn-jingying', speed:0.90, vol:1.0, pitch:0,  emotion:'neutral' },
      // Mentor — warm, encouraging female voice
      mentor:     { id:'female-shaonv',    speed:0.95, vol:1.0, pitch:0,  emotion:'happy'   },
      // Debater — energetic, passionate female voice
      debater:    { id:'female-yujie',     speed:1.05, vol:1.0, pitch:0,  emotion:'happy'   },
      // Listener — gentle, soft female voice
      listener:   { id:'female-tianmei',   speed:0.92, vol:1.0, pitch:-1, emotion:'neutral' },
      // Friendly interviewer — warm, professional female voice
      friendly:   { id:'female-shaonv',    speed:0.93, vol:1.0, pitch:0,  emotion:'happy'   },
    }
  },
  providers:{
    anthropic:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514'},
    deepseek: {url:'https://api.deepseek.com/chat/completions',model:'deepseek-chat'},
  },
  voice:{
    maxDur:  {gentle:50000,medium:45000,hardcore:32000},
    silenceDly: 3800,   /* ms of silence → auto-submit */
    minWords:   5,
    hcCutoffChance: 0.28,
    hcCutoffMin:12000, hcCutoffMax:22000,
  },
};

/* ── STATE ── */
const S={
  scenario:'interview',
  apiKey:'', provider:'deepseek',
  minimaxKey:'',   // MiniMax TTS API key (separate from AI key)
  identity:'',speciality:'',resumeText:'',position:'',goal:'',company:'',
  intensity:'medium', mentorMode:'auto',
  questions:[], qLog:[], qIndex:0, retryCount:0,
  phase:'idle',
  voiceState:'idle',
  finalBuf:'', interimBuf:'', wordCount:0,
  silTimer:null, maxTimer:null, hcCutTimer:null,
  stageW:0, stageH:0,
  feedbackData:null, advancedPhrases:[],
  wpIndex:0, wpRec:null, wpTranscript:'',
  srsWords:[],
  // 错误练习相关
  practiceErrors: [],     // 存储从对话中提取的错误
  practiceIndex: 0,
  epRecognition: null,
  epCurrentAnswer: '',
};

let recognition = null;

/* ── STORAGE ── */
const PROF_KEY='mm_v5_profile';
const SRS_KEY ='mm_v5_srs';
function saveProfile(){
  try{
    const d={identity:S.identity,speciality:S.speciality,resumeText:S.resumeText,
      position:S.position,goal:S.goal,company:S.company,
      intensity:S.intensity,mentorMode:S.mentorMode,provider:S.provider,
      apiKey:S.apiKey,
      minimaxKey:S.minimaxKey,
      savedAt:new Date().toISOString()};
    localStorage.setItem(PROF_KEY,JSON.stringify(d));
  }catch{}
}
function loadProfile(){
  try{return JSON.parse(localStorage.getItem(PROF_KEY)||'null');}catch{return null;}
}
function saveSRS(ws){
  ws.forEach(w=>{if(w&&!S.srsWords.includes(w))S.srsWords.push(w);});
  try{localStorage.setItem(SRS_KEY,JSON.stringify(S.srsWords));}catch{}
}
(()=>{try{S.srsWords=JSON.parse(localStorage.getItem(SRS_KEY)||'[]');}catch{}})();
// Auto-restore API key from dedicated slot (survives resets)
(()=>{ try{ const k=localStorage.getItem('mm_apikey')||''; if(k) S.apiKey=k; }catch{} })();
// Auto-restore MiniMax key
(()=>{ try{ const k=localStorage.getItem('mm_minimaxkey')||''; if(k) S.minimaxKey=k; }catch{} })();

/* ── DOM HELPERS ── */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toggleApiKey(){
  const exp=$('apiKeyExpanded'), col=$('apiKeyCollapsed');
  if(!exp||!col) return;
  if(exp.style.display==='none'){ exp.style.display='block'; col.style.display='none'; }
  else { exp.style.display='none'; col.style.display='block'; }
}
function showScreen(id){
  ['hubScreen','intakeScreen','prepScreen','arenaScreen','feedbackScreen','wordPracticeScreen','errorPracticeScreen']
    .forEach(s=>$(s)?.classList.remove('active'));
  $(id).classList.add('active');
  TTS.stop();
  // Hide VN textbox when leaving arena
  if(id !== 'arenaScreen') hideVNTextbox();
}
function showLoad(m){$('loadingMsg').textContent=m||'Thinking…';$('loadingVeil').classList.add('show');}
function hideLoad(){$('loadingVeil').classList.remove('show');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ── CHARACTER POSITIONING ── */
/* All positions computed from current stage dimensions */
function stageSize(){
  const panel=$('leftPanel')||$('stage');
  if(!panel) return {w:window.innerWidth,h:window.innerHeight};
  return {w:panel.offsetWidth||window.innerWidth, h:panel.offsetHeight||window.innerHeight};
}
function isMobile(){ return window.innerWidth <= 600; }
function isLandscape(){ return window.innerWidth > window.innerHeight; }

/* posInterviewers: manage both interviewer characters based on intensity + question difficulty */
// posInterviewers: legacy, superseded by direct posChar calls
function posInterviewers(difficulty){
  // difficulty: 'easy' | 'hard' | 'gentleOnly'
  const {w} = stageSize();
  const mob = isMobile();
  const cW  = mob ? Math.min(w*0.85, 340) : Math.min(480, w*0.70);
  const fW  = mob ? Math.min(w*0.65, 260) : Math.min(380, w*0.55);

  if(S.intensity === 'gentle' || difficulty === 'gentleOnly'){
    // Gentle mode: only friendly interviewer, centered, full opacity
    posChar('friendlyChar', {left:(w-fW)/2, width:fW, opacity:1});
    posChar('challChar',    {left:w+cW+80,  width:cW, opacity:0}); // off-screen
  } else if(difficulty === 'hard'){
    // Hard question: stern interviewer center, friendly fades to left
    const mob2 = isMobile();
    posChar('challChar',    {left:(w-cW)/2, width:cW, opacity:1});
    const fLeft = mob2 ? -fW*0.4 : w*0.02;  // peek from left edge
    posChar('friendlyChar', {left:fLeft,    width:fW, opacity:0.35});
  } else {
    // Easy question in medium/hardcore: friendly center, stern off-screen
    posChar('friendlyChar', {left:(w-fW)/2, width:fW, opacity:1});
    posChar('challChar',    {left:w+cW+80,  width:cW, opacity:0});
  }
}

function posChar(id,cfg){
  const el=$(id);
  if(!el) return;
  // New layout: position via CSS flex — only control opacity + dim state
  const op = cfg.opacity !== undefined ? cfg.opacity : 1;
  el.style.opacity = op;
  el.classList.toggle('dimmed', op < 0.5 && op > 0);
  el.classList.toggle('hidden', op === 0);
  el.style.transform = (cfg.scale&&cfg.scale!==1 ? `scale(${cfg.scale})` : '');
}

function offLeft(id, w=320){
  posChar(id,{left:-w-80, width:w, opacity:0});
}
function offRight(id, w=320){
  const {w:sw}=stageSize();
  posChar(id,{left:sw+80, width:w, opacity:0});
}
function center(id, w=360){
  const {w:sw}=stageSize();
  posChar(id,{left:(sw-w)/2, width:w, opacity:1});
}
function leftMain(id, w=310){
  const {w:sw}=stageSize();
  posChar(id,{left:sw*0.05, width:w, opacity:1});
}
function rightSmall(id, w=240){
  const {w:sw}=stageSize();
  posChar(id,{left:sw-w-16, width:w, opacity:1});
}

/* ── TTS (TEXT-TO-SPEECH) SYSTEM ── */
/* Global CORS block flag — set true once MiniMax CORS fails, prevents retries */
window._mmCorsBlocked = false;

/* ── TTS MODULE (MiniMax-first, Web Speech fallback) ──────────────
   Priority:
   1. MiniMax API  — if minimaxKey is set → rich, realistic voices
   2. Web Speech API — browser built-in fallback (always available)
   MiniMax returns base64 MP3 → decoded to AudioBuffer → played via Web Audio API
   This avoids <audio> element delays and gives precise onend timing.
──────────────────────────────────────────────────────────────── */
const TTS = (()=>{

  /* ── WEB SPEECH FALLBACK (unchanged from before) ── */
  const synth = window.speechSynthesis;
  let voices = [], challVoice = null, mentorVoice = null;
  let enabled = true;

  function loadVoices(){
    voices = synth.getVoices();
    if(!voices.length) return;
    const maleNames   = /david|james|daniel|alex|mark|fred|bruce|arthur|oliver|aaron|rishi|george|matthew/i;
    const femaleNames = /samantha|victoria|karen|susan|zira|hazel|moira|tessa|veena|kate|serena|emma|lisa|fiona|nicky|amelie|ava|allison/i;
    challVoice  = voices.find(v=>v.lang.startsWith('en')&&maleNames.test(v.name))   || voices.find(v=>v.lang.startsWith('en-US')) || voices.find(v=>v.lang.startsWith('en')) || voices[0];
    mentorVoice = voices.find(v=>v.lang.startsWith('en')&&femaleNames.test(v.name)) || voices.find(v=>v.lang.startsWith('en')&&v!==challVoice) || challVoice;
  }
  loadVoices();
  if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadVoices;

  /* ── WEB AUDIO CONTEXT (for MiniMax MP3 playback) ── */
  let _audioCtx = null;
  let _currentSource = null;
  function getAudioCtx(){
    if(!_audioCtx || _audioCtx.state==='closed'){
      _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    }
    if(_audioCtx.state==='suspended') _audioCtx.resume();
    return _audioCtx;
  }

  /* ── MINIMAX TTS ── */
  // roleToVoice: maps TTS role string to CFG.minimax.voices entry
  function mmVoiceCfg(role){
    const m = CFG.minimax.voices;
    if(role==='challenger') return m.challenger;
    if(role==='debater')    return m.debater;
    if(role==='listener')   return m.listener;
    return m.mentor;  // default: mentor / hint
  }

  // Determine the role from scenario + who is speaking
  function roleForMode(mode){
    if(mode==='chall'){
      if(S.scenario==='debate')    return 'debater';
      if(S.scenario==='smalltalk') return 'listener';
      // Interview: gentle mode uses friendly voice; hard Qs in medium use challenger
      if(S._usingFriendly)         return 'friendly';
      return 'challenger';
    }
    return 'mentor';
  }

  /* ── 核心修改：callMiniMax 支持代理和环境判断 ── */
  async function callMiniMax(text, role){
    if (!text || text.trim().length === 0) return null;

    // 判断当前环境：本地开发还是线上部署
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let apiUrl;
    let headers;

    if (!isLocal) {
      // 线上环境（Vercel）：使用代理，不需要前端 API Key
      apiUrl = '/api/minimax';
      headers = { 'Content-Type': 'application/json' };
    } else {
      // 本地开发：需要用户填写 MiniMax Key
      const key = S.minimaxKey;
      if (!key) return null;
      apiUrl = CFG.minimax.endpoint;
      headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      };
    }

    const vc = mmVoiceCfg(role);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model:    CFG.minimax.model,
          text:     text,
          voice_id: vc.id,
          speed:    vc.speed,
          vol:      vc.vol,
          pitch:    vc.pitch,
          emotion:  vc.emotion,
          format:   'mp3',
          audio_sample_rate: 32000,
          bitrate:  128000,
        }),
      });

      if (!res.ok) {
        console.warn('[MiniMax TTS] HTTP', res.status);
        return null;
      }

      const data = await res.json();
      if (data?.base_resp?.status_code !== 0 && data?.base_resp?.status_code !== undefined) {
        console.warn('[MiniMax TTS] API error:', data?.base_resp?.status_msg);
        return null;
      }
      const b64 = data.audio_file;
      if (!b64) {
        console.warn('[MiniMax TTS] no audio_file in response');
        return null;
      }
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      const ctx = getAudioCtx();
      const audioBuf = await ctx.decodeAudioData(bytes.buffer);
      return audioBuf;
    } catch (e) {
      console.warn('[MiniMax TTS] error:', e.message);
      return null;
    }
  }

  function showMiniMaxCorsNotice(){
    if(document.getElementById('mmCorsNotice')) return;
    const el = document.createElement('div');
    el.id = 'mmCorsNotice';
    el.style.cssText = [
      'position:fixed','bottom:100px','left:50%','transform:translateX(-50%)',
      'z-index:9999','background:var(--amber)','color:var(--paper)',
      'font-family:var(--font-b)','font-size:13px','font-weight:500',
      'padding:10px 18px','border-radius:3px','max-width:min(420px,90vw)',
      'box-shadow:0 4px 20px rgba(0,0,0,.3)','text-align:center',
      'line-height:1.5','cursor:pointer',
    ].join(';');
    // 线上环境不再显示 CORS 错误提示（因为代理已解决）
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
      el.innerHTML = '✅ MiniMax voices are enabled via secure proxy.<br>Enjoy the natural speech! (tap to dismiss)';
    } else {
      el.innerHTML = '⚠️ MiniMax voices are blocked by the browser when running on file:// or due to CORS.<br>'
        + 'Using browser voices instead. To use MiniMax, <strong>run a local server</strong> (e.g., `python -m http.server`). '
        + '<span style="opacity:.7;font-size:11px">(tap to dismiss)</span>';
    }
    el.addEventListener('click', ()=>el.remove());
    document.body.appendChild(el);
    setTimeout(()=>{ if(el.parentNode) el.remove(); }, 12000);
  }

  /* playAudioBuffer: plays a decoded AudioBuffer, returns a Promise
     that resolves when playback finishes + optional readPause */
  function playAudioBuffer(buf, readPause=0){
    return new Promise(resolve=>{
      if(!buf){ resolve(); return; }
      const ctx = getAudioCtx();
      if(_currentSource){ try{ _currentSource.stop(); }catch{} }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      _currentSource = src;
      src.onended = ()=>{
        _currentSource = null;
        setTimeout(resolve, readPause);
      };
      src.start(0);
    });
  }

  function stopMiniMax(){
    if(_currentSource){ try{ _currentSource.stop(); }catch{} _currentSource=null; }
  }

  /* ── PUBLIC API ── */

  function stop(){
    stopMiniMax();
    synth.cancel();
  }

  function setEnabled(v){ enabled=v; if(!v) stop(); }

  /* createUtterance — returns a Web Speech utterance (fallback only) */
  function createUtterance(text, role){
    const u = new SpeechSynthesisUtterance(text);
    if(role==='challenger'||role==='debater'){
      u.voice=challVoice; u.pitch=0.80; u.rate=0.86; u.volume=1.0;
    } else {
      u.voice=mentorVoice; u.pitch=1.12; u.rate=0.88; u.volume=0.92;
    }
    return u;
  }

  /* speakUtterance — Web Speech fallback with iOS keepalive */
  function speakUtterance(u){
    if(!enabled||!u) return;
    synth.cancel();
    const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent);
    let _iosKA=null;
    if(isIOS){ _iosKA=setInterval(()=>{ if(synth.speaking&&synth.paused) synth.resume(); },200); }
    const wrapEnd=(orig)=>(e)=>{ clearInterval(_iosKA); if(orig) orig(e); };
    const wrapErr=(orig)=>(e)=>{ clearInterval(_iosKA); if(orig) orig(e); };
    const suppressedErr = u.onerror;
    u.onerror = (e)=>{
      if(e.error==='interrupted'||e.error==='canceled'||e.error==='not-allowed') return;
      if(suppressedErr) suppressedErr(e);
    };
    u.onend  = wrapEnd(u.onend);
    setTimeout(()=>{ synth.speak(u); }, 50);
  }

  /* speak — simple fire-and-forget (used by coach/hint messages) */
  function speak(text, role){
    if(!enabled||!text) return;
    // 注意：线上环境即使 S.minimaxKey 为空，callMiniMax 也会通过代理尝试（无需前端 Key）
    callMiniMax(text, role).then(buf=>{
      if(buf) playAudioBuffer(buf);
      else _webSpeakSimple(text,role);
    });
  }

  function _webSpeakSimple(text, role){
    if(!voices.length) loadVoices();
    synth.cancel();
    const u = createUtterance(text, role);
    u.onerror = (e)=>{ if(e.error!=='interrupted' && e.error!=='canceled') console.warn('[TTS] error:',e.error); };
    setTimeout(()=>synth.speak(u), 80);
  }

  return { speak, stop, setEnabled, createUtterance, speakUtterance,
    callMiniMax, playAudioBuffer, roleForMode,
    get voices(){ return voices; },
    get challVoice(){ return challVoice; },
    get mentorVoice(){ return mentorVoice; }
  };
})();

/* ── VN TEXTBOX CONTROLLER ── */
let _typeTimer=null;
function _typeText(text, utt){
  clearTimeout(_typeTimer);
  const el=$('vntbText');
  if(!el) return;
  el.textContent='';

  const cur=document.createElement('span');
  cur.className='vntb-cursor';
  el.appendChild(cur);

  const spd = utt ? Math.round(55 / (utt.rate || 0.9)) : 55;
  let pos = 0;
  let _done = false;

  function revealTo(idx){
    if(_done) return;
    idx = Math.min(idx, text.length);
    if(idx > pos){
      if(cur.parentNode === el){
        el.insertBefore(document.createTextNode(text.slice(pos, idx)), cur);
      }
      pos = idx;
    }
    if(pos >= text.length && !_done){
      _done = true;
      cur.remove();
    }
  }

  function tick(){
    if(_done) return;
    if(pos < text.length){
      revealTo(pos + 1);
      if(!_done) _typeTimer = setTimeout(tick, spd);
    }
  }
  tick();

  if(utt){
    utt.onboundary = (e)=>{
      if(_done || e.name !== 'word') return;
      const wEnd = e.charIndex + (e.charLength > 0 ? e.charLength :
        (()=>{ const a=text.slice(e.charIndex); const s=a.search(/\s/); return s>=0?s:a.length; })());
      revealTo(wEnd);
      pos = Math.max(pos, Math.min(wEnd, text.length));
    };
    utt.onend = ()=>{ clearTimeout(_typeTimer); revealTo(text.length); };
    utt.onerror = (e)=>{ if(e.error!=='interrupted'&&e.error!=='canceled') console.warn('[TTS] error:', e.error); };
  }
}

function showVNTextbox(text, mode, label){
  const tb=$('vntextbox');
  const sp=$('vntbSpeaker');
  if(!tb||!sp) return Promise.resolve();

  const ttsRole = TTS.roleForMode(mode);
  const bar=$('speakerBar');
  const nameEl=$('speakerNameText');
  const dot=$('speakerDot');

  if(mode==='chall'){
    const isDebate=S.scenario==='debate', isST=S.scenario==='smalltalk';
    const barColor = isDebate?'var(--teal)':isST?'var(--lavender)':'var(--ink)';
    const label2   = isDebate?'⚡  DEBATER':isST?'🌸  LISTENER':
                     S._usingFriendly?'✦  INTERVIEWER':'⚡  INTERVIEWER';
    if(bar)    bar.style.background = barColor;
    if(nameEl) nameEl.textContent   = label2;
  } else if(mode==='mentor'){
    if(bar)    bar.style.background = 'var(--green)';
    if(nameEl) nameEl.textContent   = '✨  MENTOR';
  } else {
    if(bar)    bar.style.background = 'var(--amber)';
    if(nameEl) nameEl.textContent   = `💡  ${label||'MENTOR'}`;
  }
  if(dot) dot.classList.add('speaking');

  const readPause = Math.max(800, text.length * 18);

  // 尝试 MiniMax，失败则回退 Web Speech
  return new Promise(resolve=>{
    TTS.stop();
    _typeText(text, null);
    TTS.callMiniMax(text, ttsRole).then(buf=>{
      if(buf){
        TTS.playAudioBuffer(buf, readPause).then(resolve);
      } else {
        // 回退到 Web Speech
        clearTimeout(_typeTimer);
        const utt = TTS.createUtterance(text, ttsRole);
        utt.onend  = ()=>{ clearTimeout(_typeTimer); revealAllText(text); setTimeout(resolve,readPause); };
        utt.onerror= ()=>{ clearTimeout(_typeTimer); revealAllText(text); setTimeout(resolve,readPause); };
        _typeText(text, utt);
        TTS.speakUtterance(utt);
      }
    }).catch(()=>{
      // 网络错误等，回退
      setTimeout(resolve, text.length*55 + readPause);
    });
  });
}

function revealAllText(text){
  const el=$('vntbText');
  if(!el) return;
  el.textContent=text;
  const cur=el.querySelector('.vntb-cursor');
  if(cur) cur.remove();
  clearTimeout(_typeTimer);
}
function hideVNTextbox(){
  const el=$('vntbText');
  if(el) el.textContent='';
  const dotEl=$('speakerDot'); if(dotEl) dotEl.classList.remove('speaking');
  clearTimeout(_typeTimer);
  TTS.stop();
}

function showChallBubble(text){ showVNTextbox(text,'chall'); }
function hideChallBubble()    { hideVNTextbox(); }
function showMentorBubble(text){ showVNTextbox(text,'mentor'); }
function hideMentorBubble()   { hideVNTextbox(); }
function showMentorHint(text, label){ showVNTextbox(text,'hint',label); }
function hideMentorHint()     { hideVNTextbox(); }

/* ── API LAYER ── */
async function callArtifactProxy(messages, systemPrompt, maxTok){
  try{
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTok||250,
        system: systemPrompt,
        messages: messages.filter(m=>m.role!=='system'),
      })
    });
    if(!res.ok) return null;
    const d = await res.json();
    return d.content?.[0]?.text?.trim() || null;
  }catch(e){
    console.warn('[Proxy]',e.message);
    return null;
  }
}

async function callAPI(messages, systemPrompt, maxTok=250){
  if(!S.apiKey){
    return callArtifactProxy(messages, systemPrompt, maxTok);
  }
  const cfg=CFG.providers[S.provider];
  const fetchWithTimeout = (url, opts, ms) => {
    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => reject(new Error('timeout')), ms);
      fetch(url, opts)
        .then(r => { clearTimeout(tid); resolve(r); })
        .catch(e => { clearTimeout(tid); reject(e); });
    });
  };
  try{
    const hdrs={'Content-Type':'application/json'};
    let body;
    if(S.provider==='anthropic'){
      hdrs['x-api-key']=S.apiKey;
      hdrs['anthropic-version']='2023-06-01';
      hdrs['anthropic-dangerous-direct-browser-access']='true';
      body={model:cfg.model,max_tokens:maxTok,system:systemPrompt,
            messages:messages.filter(m=>m.role!=='system')};
    }else{
      hdrs['Authorization']=`Bearer ${S.apiKey}`;
      body={model:cfg.model,max_tokens:maxTok,temperature:0.78,
            messages:[{role:'system',content:systemPrompt},...messages.filter(m=>m.role!=='system')]};
    }
    const res=await fetchWithTimeout(cfg.url,{method:'POST',headers:hdrs,body:JSON.stringify(body)},CFG.API_TIMEOUT_MS);
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`HTTP ${res.status}`);}
    const d=await res.json();
    return(S.provider==='anthropic'?d.content?.[0]?.text:d.choices?.[0]?.message?.content)?.trim()||null;
  }catch(e){
    if(e.message==='timeout')console.warn('[API] timeout');else console.error('[API]',e.message);
    return null;
  }
}

/* ── DEMO FALLBACKS ── */
const FB={
  q:[
    {q:"Please introduce yourself — tell me about your background and what brings you here today.",dimension:"Self-presentation",intent:"Assess communication, structure, and first impressions"},
    {q:"Why are you specifically interested in this position?",dimension:"Motivation",intent:"Test genuine interest and research depth"},
    {q:"Tell me about a specific challenge you faced and how you resolved it.",dimension:"Problem-solving",intent:"Assess resilience, initiative, and action-orientation"},
    {q:"Walk me through your proudest achievement so far. Be specific.",dimension:"Accomplishment",intent:"Understand concrete impact and storytelling"},
    {q:"Where do you realistically see yourself in three years?",dimension:"Vision",intent:"Test ambition, self-awareness, and role alignment"},
    {q:"Do you have any questions for me?",dimension:"Initiative",intent:"Assess engagement and intellectual curiosity"},
  ],
  comfort:["That was a tough one — don't worry. Let's work through it together.","Take a breath. You've got material for this — let's find it."],
  coach:["Use the STAR method: Situation → Task → Action → Result. One specific story.","Start with a concrete detail — a number, a name, a date. It makes everything real.","Don't just say what you did — say what changed because of what you did.","Try opening with: 'One specific example that comes to mind is…'"],
  praise:["That's a genuinely strong answer — specific and structured.","Much better! The concrete detail makes it memorable.","That would stand out to a real interviewer. Well done."],
};

/* ── DAILY GREETING ── */
function checkDailyGreeting(){
  const today = new Date().toDateString();
  const lastGreet = localStorage.getItem('mm_daily_greet')||'';
  if(lastGreet === today) return;
  localStorage.setItem('mm_daily_greet', today);

  const hr = new Date().getHours();
  const timeOfDay = hr<5?'night':hr<12?'morning':hr<17?'afternoon':hr<21?'evening':'night';
  const greetings = {
    morning:   "Good morning! A fresh day, a fresh start. Your interview skills are going to shine today!",
    afternoon: "Good afternoon! Ready to practise? Every session makes you sharper.",
    evening:   "Good evening! Great time to squeeze in some practice. You're here, and that already puts you ahead.",
    night:     "Still up? Dedication! Don't stay too late — rest is part of performing well. Let's make this count.",
  };

  setTimeout(()=>{
    const banner = document.createElement('div');
    banner.id = 'dailyGreetBanner';
    banner.style.cssText = [
      'position:fixed','top:60px','left:50%','transform:translateX(-50%)',
      'z-index:9000','background:var(--green)','color:var(--paper)',
      'font-family:var(--font-b)','font-size:15px','font-weight:500',
      'padding:12px 20px','border-radius:3px','max-width:min(500px,90vw)',
      'box-shadow:0 4px 20px rgba(0,0,0,.22)','text-align:center',
      'line-height:1.5','cursor:pointer','opacity:0',
      'transition:opacity .4s ease',
    ].join(';');
    banner.textContent = greetings[timeOfDay] + '  ✕';
    banner.title = 'Click to dismiss';
    banner.addEventListener('click', ()=>{
      banner.style.opacity='0';
      setTimeout(()=>banner.remove(), 400);
    });
    document.body.appendChild(banner);
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ banner.style.opacity='1'; }); });
    setTimeout(()=>{ if(banner.parentNode){ banner.style.opacity='0'; setTimeout(()=>banner.remove(),400); }}, 7000);
  }, 600);
}

window.addEventListener('load',()=>{
  try{
    recognition = initRec();
    if(recognition){
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(SR){
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
          navigator.mediaDevices.getUserMedia({audio:true})
            .then(stream=>{ stream.getTracks().forEach(t=>t.stop()); })
            .catch(()=>{});
        }
      }
    }
  }catch(e){ console.warn('[Mic init]', e.message); }

  const savedKey = localStorage.getItem('mm_apikey')||'';
  if(savedKey){
    const inp=$('fiApiKey');
    if(inp){ inp.value=savedKey; S.apiKey=savedKey; }
    const exp=$('apiKeyExpanded'), col=$('apiKeyCollapsed');
    if(exp&&col){ exp.style.display='block'; col.style.display='none'; }
  }
  const savedMM=localStorage.getItem('mm_minimaxkey')||'';
  if(savedMM){ S.minimaxKey=savedMM; const mf=$('fiMinimaxKey'); if(mf) mf.value=savedMM;
    const exp3=$('apiKeyExpanded'),col3=$('apiKeyCollapsed');
    if(exp3&&col3){exp3.style.display='block';col3.style.display='none';}
  }
  const p=loadProfile();
  if(p && p.position){
    const d=new Date(p.savedAt).toLocaleDateString();
    const bannerText=$('bannerText');
    if(bannerText) bannerText.textContent=`📋 Profile saved on ${d} (${p.position}). Load it?`;
    const profileBanner=$('profileBanner');
    if(profileBanner) profileBanner.classList.add('show');
  }

  Object.values(MENTOR_EXPR).forEach(src=>preloadImg(src));
  Object.values(CHALL_EXPR).forEach(src=>preloadImg(src));
  Object.values(FRIENDLY_EXPR).forEach(src=>preloadImg(src));
  setMentor('greet_smile');
  setChall('neutral');
  setTimeout(checkDailyGreeting, 500);
});

const loadProfileBtn = $('loadProfileBtn');
if(loadProfileBtn){
  loadProfileBtn.addEventListener('click',()=>{
    const p=loadProfile(); if(!p) return;
    if(p.identity){ document.querySelectorAll('.id-pill').forEach(x=>x.classList.remove('on'));
      const pip=document.querySelector(`.id-pill[data-id="${p.identity}"]`);
      if(pip){pip.classList.add('on'); S.identity=p.identity;}
    }
    if(p.intensity){ document.querySelectorAll('.int-pill').forEach(x=>x.classList.remove('on'));
      const iip=document.querySelector(`.int-pill[data-int="${p.intensity}"]`);
      if(iip){iip.classList.add('on'); S.intensity=p.intensity;}
    }
    if(p.mentorMode){ document.querySelectorAll('.tog-opt').forEach(x=>x.classList.remove('on'));
      const mip=document.querySelector(`.tog-opt[data-mode="${p.mentorMode}"]`);
      if(mip){mip.classList.add('on'); S.mentorMode=p.mentorMode;}
    }
    if(p.provider){ document.querySelectorAll('.prov-pill').forEach(x=>x.classList.remove('on'));
      const pp=document.querySelector(`.prov-pill[data-provider="${p.provider}"]`);
      if(pp){pp.classList.add('on'); S.provider=p.provider;}
    }
    if(p.minimaxKey){ S.minimaxKey=p.minimaxKey; const mf=$('fiMinimaxKey'); if(mf) mf.value=p.minimaxKey; }
    if(p.apiKey && $('fiApiKey')){ $('fiApiKey').value=p.apiKey; S.apiKey=p.apiKey;
      const exp=$('apiKeyExpanded'),col=$('apiKeyCollapsed');
      if(exp&&col){exp.style.display='block';col.style.display='none';}
    }
    if(p.speciality)$('fiSpeciality').value=p.speciality;
    if(p.resumeText) $('fiResume').value=p.resumeText;
    if(p.position)   $('fiPosition').value=p.position;
    if(p.goal)       $('fiGoal').value=p.goal;
    if(p.company)    $('fiCompany').value=p.company;
    const profileBanner=$('profileBanner');
    if(profileBanner) profileBanner.classList.remove('show');
  });
}

const dismissBannerBtn = $('dismissBannerBtn');
if(dismissBannerBtn){
    dismissBannerBtn.addEventListener('click', ()=>{
        const banner = $('profileBanner');
        if(banner) banner.classList.remove('show');
    });
}
document.querySelectorAll('.id-pill').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.id-pill').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.identity=p.dataset.id;
}));
document.querySelectorAll('.int-pill').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.int-pill').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.intensity=p.dataset.int;
}));
document.querySelectorAll('.tog-opt').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.tog-opt').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.mentorMode=p.dataset.mode;
}));
document.querySelectorAll('.prov-pill').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.prov-pill').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.provider=p.dataset.provider;
}));
$('resumeFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    const text=await file.text();
    $('fiResume').value=text.slice(0,2000);
    const resumeZone=$('resumeZone');
    if(resumeZone){
      resumeZone.classList.add('has');
      const p=resumeZone.querySelector('p');
      if(p) p.innerHTML=`✅ <strong>${esc(file.name)}</strong> loaded`;
    }
  }catch{
    const resumeZone=$('resumeZone');
    if(resumeZone){
      const p=resumeZone.querySelector('p');
      if(p) p.innerHTML='❌ Could not read — please paste above.';
    }
  }
});

$('launchBtn').addEventListener('click',()=>{
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    ac.resume().then(()=>ac.close());
  }catch{}
  beginPrep();
});

async function beginPrep(){
  const fieldKey = ($('fiApiKey')||{value:''}).value.trim();
  S.apiKey = fieldKey || localStorage.getItem('mm_apikey') || '';
  const mmFieldKey = ($('fiMinimaxKey')||{value:''}).value.trim();
  S.minimaxKey = mmFieldKey || localStorage.getItem('mm_minimaxkey') || '';
  if(S.minimaxKey) try{ localStorage.setItem('mm_minimaxkey', S.minimaxKey); }catch{}
  if(S.apiKey){ try{ localStorage.setItem('mm_apikey', S.apiKey); }catch{} }
  S.speciality=$('fiSpeciality').value.trim();
  S.resumeText=$('fiResume').value.trim();
  S.position =$('fiPosition').value.trim();
  S.goal     =$('fiGoal').value.trim();
  S.company  =$('fiCompany').value.trim();
  if(!S.position){alert('Please enter the position you are interviewing for.');$('fiPosition').focus();return;}
  saveProfile();
  showScreen('prepScreen');
  await runPrep();
}

function buildProfile(){
  const lines=[];
  if(S.identity)    lines.push(`Identity: ${S.identity}`);
  if(S.speciality)  lines.push(`Field/Major/Speciality: ${S.speciality}`);
  if(S.position)    lines.push(`Target Position: ${S.position}`);
  if(S.company)     lines.push(`Organisation: ${S.company}`);
  if(S.goal)        lines.push(`Candidate's session goal: ${S.goal}`);
  if(S.resumeText)  lines.push(`Resume highlights:\n${S.resumeText.slice(0,600)}`);
  lines.push(`Interview intensity: ${S.intensity}`);
  lines.push(`Scenario: ${S.scenario}`);
  return lines.join('\n');
}

/* ── PREP ── */
async function runPrep(){
  const statusEl=$('prepStatus');
  const profile=buildProfile();
  const numQ=S.intensity==='hardcore'?8:S.intensity==='medium'?7:6;
  if(S.scenario==='debate'||S.scenario==='smalltalk'){
    if(statusEl) statusEl.textContent='✓ Ready! Entering the stage…';
    S.questions=[]; S.qLog=[];
    await sleep(800);
    launchArena('');
    return;
  }

  const statusMsgs=[
    'Analysing your profile…',
    'Identifying key competencies…',
    'Crafting your questions…',
    'Almost ready…',
  ];
  let si=0;
  if(statusEl) statusEl.textContent=statusMsgs[0];
  const ticker=setInterval(()=>{
    if(si<statusMsgs.length-1){ si++; if(statusEl) statusEl.textContent=statusMsgs[si]; }
  },900);

  const aPrompt=`You are a professional interview coach and hiring expert.
Candidate Profile:
${profile}

Using ALL details (identity, speciality, position, company, goals, resume), determine the specific competencies, traits, and knowledge areas to examine.
Return ONLY valid JSON (no markdown):
{"analysis_points":["specific point (max 6)"],"opening_note":"One warm sentence the interviewer says to open","surprise_ok":${S.intensity==='hardcore'}}`;

  const qPrompt=`You are an experienced interviewer preparing a structured interview.
Candidate Profile:
${profile}

Generate ${numQ} interview questions. MANDATORY structure:
1. Self-introduction warmup ("Please introduce yourself…")
2. 2 motivation/background questions referencing their SPECIFIC field (${S.speciality||'their field'}) and position (${S.position})
3. 2-3 competency/experience questions — MUST reference their specific background details
4. ${S.intensity==='hardcore'?'2 curveball/surprise questions (AI in their field, recent trends, handling extreme pressure)':'1 forward-looking question'}
5. End with "Do you have any questions for me?"
Be SPECIFIC — generic questions are not acceptable.
Return ONLY valid JSON (no markdown):
{"questions":[{"q":"full question","intent":"why asking","dimension":"competency tested"}]}`;

  const [aRaw, qRaw] = await Promise.all([
    callAPI([], aPrompt, 350),
    callAPI([], qPrompt, 700),
  ]);

  clearInterval(ticker);

  let aData={analysis_points:[],opening_note:"Welcome. Please make yourself comfortable — let's begin.",surprise_ok:false};
  if(aRaw){try{aData={...aData,...JSON.parse(aRaw.replace(/```json|```/g,'').trim())};}catch{}}
  S.analysisPoints=aData.analysis_points||[];
  if(S.analysisPoints.length){
    const paItems=$('paItems');
    const prepAnalysis=$('prepAnalysis');
    if(paItems) paItems.innerHTML=S.analysisPoints.map(p=>`<div class="pa-item">${esc(p)}</div>`).join('');
    if(prepAnalysis) prepAnalysis.style.display='block';
  }

  let qData={questions:FB.q};
  if(qRaw){try{const p=JSON.parse(qRaw.replace(/```json|```/g,'').trim());if(p.questions?.length)qData=p;}catch{}}
  S.questions=qData.questions;
  S.qLog=S.questions.map(q=>({question:q.q,dimension:q.dimension||'',intent:q.intent||'',userAnswers:[],finalScore:null,retries:0,evalNotes:''}));

  if(statusEl) statusEl.textContent=`✓ ${S.questions.length} questions ready — entering the stage…`;
  await sleep(600);
  launchArena(aData.opening_note);
}

/* ── ARENA LAUNCH ── */

function selectScenario(sc){
  S.scenario = sc;
  const titles={
    interview: {h:'The <em>Interview</em> Simulator', sub:"Tell us about yourself — we'll build a personalised session.", btn:'✎ Analyse &amp; Begin Interview'},
    debate:    {h:'The <em>Debate</em> Arena',        sub:"Pick your topic — your opponent is waiting.", btn:'🎙 Enter the Debate Arena'},
    smalltalk: {h:'The <em>Small Talk</em> Café',     sub:"Relax. Let's have a real conversation.", btn:'☕ Start a Conversation'},
  };
  const t = titles[sc]||titles.interview;
  const hEl = document.querySelector('.intake-h');
  const sEl = document.querySelector('.intake-sub');
  const bEl = document.getElementById('launchBtn');
  if(hEl) hEl.innerHTML = t.h;
  if(sEl) sEl.textContent = t.sub.replace(/&amp;/g,'&');
  if(bEl) bEl.innerHTML = t.btn;

  const intFields = document.querySelectorAll('.interview-only');
  intFields.forEach(el=>el.style.display = sc==='interview'?'':'none');

  const arena = document.getElementById('arenaScreen');
  if(arena){
    arena.classList.remove('scenario-interview','scenario-debate','scenario-smalltalk');
    arena.classList.add('scenario-'+sc);
  }

  showScreen('intakeScreen');
}

function setupScenarioCharacters(){
  const arena = document.getElementById('arenaScreen');
  arena.classList.remove('scenario-interview','scenario-debate','scenario-smalltalk');
  arena.classList.add('scenario-'+S.scenario);

  if(S.scenario==='interview'){
    setFriendly('calm');
    setChall('neutral');
    if(S.intensity==='gentle'){
      posChar('friendlyChar',{opacity:1});
      posChar('challChar',{opacity:0});
    } else {
      posChar('friendlyChar',{opacity:1});
      posChar('challChar',{opacity:0.4});
    }
    posChar('mentorChar',{opacity:0});
  } else if(S.scenario==='debate'){
    setExpr('challSprite', DEBATE_EXPR.neutral);
    posChar('challChar',{opacity:1});
    posChar('friendlyChar',{opacity:0});
    posChar('mentorChar',{opacity:0});
  } else {
    setExpr('challSprite', LISTEN_EXPR.idle);
    posChar('challChar',{opacity:1});
    posChar('friendlyChar',{opacity:0});
    posChar('mentorChar',{opacity:0});
  }
}

const DEBATE_MOTIONS = [
  "Social media does more harm than good.",
  "Artificial intelligence will create more jobs than it destroys.",
  "Gap years should be encouraged for all students.",
  "Online education is more effective than traditional classrooms.",
  "Cities should ban private cars.",
  "A university degree is no longer worth the cost.",
  "Zoos should be abolished.",
  "Remote work should be the default for office jobs.",
];

const DEBATE_FB = {
  openerFor:  ["Interesting opening. Let's see how you defend that.","You've staked your position — now back it up."],
  openerAgainst: ["Bold claim. I'll need to hear your evidence.","Alright — make your case, and make it convincing."],
  challenge: [
    "But where's your evidence? Anyone can make that assertion.",
    "That's a sweeping generalisation. Can you give a specific example?",
    "You're missing a crucial counterpoint here.",
    "I'd push back on that — what about the people who'd disagree?",
    "Correlation isn't causation. Can you prove that link?",
  ],
  agree: [
    "Fair point — I'll concede that. But consider this...",
    "Actually, you've made a strong argument there.",
    "That's a compelling case. However...",
  ],
};

async function runDebate(openingNote){
  S.phase='idle';
  const topic = DEBATE_MOTIONS[Math.floor(Math.random()*DEBATE_MOTIONS.length)];
  S._debateTopic = topic;
  S._debateRound = 0;
  S._debateUserSide = Math.random()>0.5?'for':'against';

  const tc = document.getElementById('debateTopicCard');
  if(tc){ tc.textContent = 'Motion: "' + topic + '"'; tc.classList.add('show'); }

  document.getElementById('qPill').textContent = 'Round 1 / ' + CFG.DEBATE_ROUNDS;
  document.getElementById('statusPill').textContent = 'Debate';
  document.getElementById('qBarFill').style.width='0%';

  const side = S._debateUserSide==='for' ? 'in favour of' : 'against';
  const oppSide = S._debateUserSide==='for' ? 'against' : 'in favour of';

  if(S.mentorMode!=='off'){
    const {w}=stageSize(); const mob=isMobile();
    const mW=mob?Math.min(w*0.80,300):Math.min(380,w*0.58);
    setMentor('greet_talk');
    await sleep(380);
    posChar('mentorChar',{opacity:1});
    await sleep(20);
    posChar('mentorChar',{opacity:1});
    await sleep(900);
    await showMentorBubble(`The motion is: "${topic}". You are arguing ${side} it. Use evidence, examples, and clear structure. I'll coach you if you get stuck. Good luck!`);
    hideMentorBubble();
    setMentor('greet_smile');
    await sleep(400);
    posChar('mentorChar',{opacity:1});
    await sleep(900);
  }

  const {w}=stageSize(); const mob=isMobile();
  const cW=mob?Math.min(w*0.85,340):Math.min(460,w*0.68);
  setDebater('neutral');
  await sleep(380);
  posChar('challChar',{left:-cW-80, width:cW, opacity:0});
  await sleep(20);
  posChar('challChar',{left:(w-cW)/2, width:cW, opacity:1});
  document.getElementById('challChar').classList.add('breathing');
  await sleep(900);

  const openMsg = openingNote || (S._debateUserSide==='for'
    ? `Welcome! The motion today is: "${topic}". You're arguing FOR it. I'm against. Make your opening statement — why do you believe this?`
    : `Welcome! The motion is: "${topic}". You're arguing AGAINST it. I'm for it. Tell me — why do you oppose this?`);

  setDebater('talk');
  await sleep(400);
  showChallBubble(openMsg);
  setTimeout(()=>setDebater('neutral'), 1400);

  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  document.getElementById('micStatus').textContent='Your argument';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  S.phase='qa_listening';
  S._isDebate = true;
}

async function processDebateAnswer(userText){
  S._debateRound = (S._debateRound||0) + 1;
  document.getElementById('bigMicBtn').style.display='none';
  document.getElementById('skipBtn').classList.remove('show');
  document.getElementById('micStatus').textContent='Considering…';
  document.getElementById('micStatus').className='active';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='Thinking…';

  const round = S._debateRound;
  document.getElementById('qPill').textContent = `Round ${round} / ${CFG.DEBATE_ROUNDS}`;
  document.getElementById('qBarFill').style.width = ((round/CFG.DEBATE_ROUNDS)*100)+'%';
  document.getElementById('statusPill').textContent = 'Your Turn';

  S.qLog.push({question:`Round ${round}: user argues ${S._debateUserSide}`, dimension:'Argumentation', intent:'Assess evidence, logic, rebuttal', userAnswers:[userText], finalScore:null, retries:0, evalNotes:''});

  if(round >= CFG.DEBATE_ROUNDS){
    S.voiceState='idle';
    await phaseEnd();
    return;
  }

  const debateSys = `You are a passionate, sharp English debate opponent.
Motion: "${S._debateTopic}"
You are arguing ${S._debateUserSide==='for'?'AGAINST':'FOR'} the motion.
The user just said: "${userText}"
This is round ${round} of ${CFG.DEBATE_ROUNDS}.

Respond as the debater: directly challenge their argument OR concede a point before countering.
Use debate phrases: "I'd argue...", "However, consider...", "The evidence suggests...", "You're overlooking..."
Keep response to 2-3 sentences. Energetic, sharp, fair.
Then ask them to respond to your counter-point.
Return ONLY the spoken response — no JSON, no labels.`;

  let counterArg = null;
  if(S.apiKey || true){
    counterArg = await callAPI([{role:'user',content:userText}], debateSys, 200);
  }
  if(!counterArg){
    const wc = userText.trim().split(/\s+/).filter(Boolean).length;
    const pool = wc < 8 ? DEBATE_FB.challenge : (Math.random()<0.3 ? DEBATE_FB.agree : DEBATE_FB.challenge);
    counterArg = pool[Math.floor(Math.random()*pool.length)] + ' What do you say to that?';
  }

  const evalSys = `Rate this debate argument: "${userText}" (motion: "${S._debateTopic}", user side: ${S._debateUserSide}).
Return ONLY JSON: {"score":0-100,"quality":"good"|"ok"|"weak","coach":"1 specific tip on argument structure or evidence","grammar":"grammar issue if any or empty"}`;
  let ev = {score:65,quality:'ok',coach:'',grammar:''};
  callAPI([{role:'user',content:userText}], evalSys, 120).then(raw=>{
    if(raw){try{const p=JSON.parse(raw.replace(/```json|```/g,'').trim());ev={...ev,...p};}catch{}}
    if(S.qLog[S.qLog.length-1]) S.qLog[S.qLog.length-1].finalScore=ev.score;
    if(ev.quality==='weak' && S.mentorMode!=='off'){
      setTimeout(async()=>{
        const {w}=stageSize(); const mob=isMobile();
        const mW=mob?Math.min(w*0.32,150):Math.min(260,w*0.34);
        setMentor('hint_talk');
        await sleep(300);
        posChar('mentorChar',{opacity:1});
        await sleep(700);
        await showMentorHint(ev.coach||'Try: "According to research..." or give a specific real-world example to strengthen your point.','💡 Argument Tip');
        hideMentorHint();
        setMentor('hint_smile');
        posChar('mentorChar',{opacity:1});
      }, 2500);
    }
  }).catch(()=>{});

  const isGood = Math.random() < 0.35;
  setDebater(isGood ? 'agree' : (round<=2 ? 'challenge' : 'fire'));
  await sleep(400);
  showChallBubble(counterArg);
  setTimeout(()=>setDebater('neutral'), 1800);

  document.getElementById('micStatus').textContent='Your response';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  S.voiceState='idle';
  S.phase='qa_listening';
}

const ST_TOPICS = [
  "Weekend plans","Favourite food","A recent trip","Hobbies","A good book or show",
  "Something you learned recently","Your hometown","Dreams and goals","Pets","The weather",
];
const ST_STARTERS = [
  "Hi! I'm so glad we get to chat. Is there anything on your mind lately?",
  "Hey! I've been looking forward to this. What have you been up to recently?",
  "Hello! It's nice to meet you. What kind of things do you enjoy doing in your spare time?",
  "Hi there! I love meeting new people. Tell me — what's been the highlight of your week so far?",
];

async function runSmallTalk(openingNote){
  S.phase='idle';
  S._stTurn=0;
  S._stHistory=[];

  document.getElementById('qPill').textContent='Turn 1 / ' + CFG.ST_TURNS;
  document.getElementById('statusPill').textContent='Chatting';
  document.getElementById('qBarFill').style.width='0%';

  const stc = document.getElementById('stTopics');
  if(stc){
    stc.innerHTML = ST_TOPICS.map(t=>`<span class="st-topic" onclick="injectSTTopic('${t}')">${t}</span>`).join('');
    stc.classList.add('show');
  }

  if(S.mentorMode!=='off'){
    const {w}=stageSize(); const mob=isMobile();
    const mW=mob?Math.min(w*0.80,300):Math.min(380,w*0.58);
    setMentor('greet_talk');
    await sleep(380);
    posChar('mentorChar',{opacity:1});
    await sleep(20);
    posChar('mentorChar',{opacity:1});
    await sleep(900);
    await showMentorBubble("Small talk is about warmth, curiosity, and keeping the conversation flowing. Ask questions back, listen actively, and be natural. I'm here if you get stuck!");
    hideMentorBubble();
    setMentor('greet_smile');
    await sleep(400);
    posChar('mentorChar',{opacity:1});
    await sleep(900);
  }

  const {w}=stageSize(); const mob=isMobile();
  const cW=mob?Math.min(w*0.85,340):Math.min(440,w*0.65);
  setListener('idle');
  await sleep(380);
  posChar('challChar',{left:-cW-80, width:cW, opacity:0});
  await sleep(20);
  posChar('challChar',{left:(w-cW)/2, width:cW, opacity:1});
  document.getElementById('challChar').classList.add('breathing');
  await sleep(900);

  const opener = openingNote || ST_STARTERS[Math.floor(Math.random()*ST_STARTERS.length)];
  setListener('respond');
  await sleep(400);
  showChallBubble(opener);
  setTimeout(()=>setListener('idle'), 1800);

  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  document.getElementById('micStatus').textContent='Tap to chat';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  S.phase='qa_listening';
  S._isSmallTalk=true;
}

function injectSTTopic(topic){
  if(document.getElementById('hearingDisplay'))
    document.getElementById('hearingDisplay').textContent='(Topic: '+topic+')';
  S.finalBuf = 'I wanted to talk about '+topic+'. ';
}

async function processSmallTalkAnswer(userText){
  S._stTurn = (S._stTurn||0)+1;
  S._stHistory = S._stHistory||[];
  S._stHistory.push({role:'user',content:userText});

  document.getElementById('bigMicBtn').style.display='none';
  document.getElementById('skipBtn').classList.remove('show');
  document.getElementById('micStatus').textContent='Listening…';
  document.getElementById('micStatus').className='active';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='Thinking…';

  const turn = S._stTurn;
  document.getElementById('qPill').textContent=`Turn ${turn} / ${CFG.ST_TURNS}`;
  document.getElementById('qBarFill').style.width=((turn/CFG.ST_TURNS)*100)+'%';

  S.qLog.push({question:`Small talk turn ${turn}`, dimension:'Conversational fluency', intent:'Assess naturalness, question-asking, warmth', userAnswers:[userText], finalScore:null, retries:0, evalNotes:''});

  if(turn >= CFG.ST_TURNS){
    S.voiceState='idle';
    await phaseEnd();
    return;
  }

  const history = (S._stHistory||[]).map(m=>({role:m.role, content:m.content}));
  const listenerSys = `You are a gentle, quiet, warm conversationalist — like a thoughtful friend at a café.
Your name is not given. You're curious, a great listener, sensitive to emotions.
Keep responses short (2-3 sentences). Ask ONE follow-up question at the end.
Use natural, warm language — not formal. Sometimes share a brief personal reaction.
The conversation so far has had ${turn} turns. Keep it flowing naturally.`;

  let reply = null;
  reply = await callAPI(history, listenerSys, 150);
  if(!reply){
    const stills = [
      "That sounds really interesting! How did that make you feel?",
      "Oh, I'd love to hear more about that. What happened next?",
      "Hmm, I never thought about it that way. Have you always felt like that?",
      "That's so relatable! Do you think you'll do it again?",
    ];
    reply = stills[Math.floor(Math.random()*stills.length)];
  }
  S._stHistory.push({role:'assistant',content:reply});

  const evalSys=`Rate this small talk response for natural English fluency:
"${userText}"
Return ONLY JSON: {"score":0-100,"quality":"good"|"ok"|"weak","coach":"1 specific tip on natural conversation skills","grammar":"error if any, else empty"}`;
  let ev={score:65,quality:'ok',coach:'',grammar:''};
  callAPI([{role:'user',content:userText}], evalSys, 100).then(raw=>{
    if(raw){try{const p=JSON.parse(raw.replace(/```json|```/g,'').trim());ev={...ev,...p};}catch{}}
    if(S.qLog[S.qLog.length-1]) S.qLog[S.qLog.length-1].finalScore=ev.score;
    if(ev.quality==='weak' && S.mentorMode!=='off'){
      setTimeout(async()=>{
        const {w}=stageSize(); const mob=isMobile();
        const mW=mob?Math.min(w*0.32,150):Math.min(260,w*0.34);
        setMentor('hint_talk');
        await sleep(300);
        posChar('mentorChar',{opacity:1});
        await sleep(700);
        await showMentorHint(ev.coach||'Try asking a question back — good small talk is a two-way street!','💡 Conversation Tip');
        hideMentorHint();
        setMentor('hint_smile');
        posChar('mentorChar',{opacity:1});
      }, 2000);
    }
  }).catch(()=>{});

  const expr = Math.random()<0.3 ? 'attentive' : (Math.random()<0.5 ? 'respond' : 'think');
  setListener(expr);
  await sleep(400);
  showChallBubble(reply);
  setTimeout(()=>setListener('idle'), 1600);

  document.getElementById('micStatus').textContent='Your turn';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  S.voiceState='idle';
  S.phase='qa_listening';
}

async function launchArena(openingNote){
  S.qIndex=0;S.retryCount=0;S.voiceState='idle';
  S.phase='idle';
  hideVNTextbox();
  showScreen('arenaScreen');
  await sleep(80);

  const {w}=stageSize();
  posChar('mentorChar',{opacity:0});
  posChar('friendlyChar',{opacity:0});
  posChar('challChar',{opacity:0});

  $('scenePill').textContent=(S.position||'INTERVIEW').toUpperCase().slice(0,18);
  $('qPill').textContent='Starting…';
  $('statusPill').textContent='Welcome';
  $('qBarFill').style.width='0%';
  $('bigMicBtn').style.display='none';
  $('skipBtn').classList.remove('show');
  if($('hearingDisplay')){ $('hearingDisplay').textContent='';
    const ph=document.querySelector('.answer-placeholder');
    if(ph) ph.style.display='block'; }

  if($('mentorDot')) $('mentorDot').className = 'mentor-dot' + (S.mentorMode==='off'?' off':'');

  const ttsPill=$('ttsPill');
  if(ttsPill) ttsPill.style.display = S.minimaxKey ? 'inline-block' : 'none';

  const dtc=document.getElementById('debateTopicCard');
  const stc2=document.getElementById('stTopics');
  if(dtc) dtc.classList.remove('show');
  if(stc2) stc2.classList.remove('show');
  S._isDebate=false; S._isSmallTalk=false;
  setupScenarioCharacters();

  if(S.scenario==='debate'){
    await runDebate(openingNote);
  } else if(S.scenario==='smalltalk'){
    await runSmallTalk(openingNote);
  } else {
    if(S.mentorMode==='off'){
      await phaseInterviewerIn(openingNote);
    }else{
      await phaseMentorIntro(openingNote);
    }
  }
}

async function phaseMentorIntro(openingNote){
  S.phase='mentor_intro';
  const {w}=stageSize();
  const mob=isMobile();
  setMentor('greet_talk');
  await sleep(300);
  posChar('mentorChar',{opacity:1});
  posChar('friendlyChar',{opacity:0.1}); posChar('challChar',{opacity:0.1});
  await sleep(500);
  const introMsg = "Hello! 👋 Welcome to today's session. I'll be right here with you the whole way. A few things to remember: take a breath before each answer, draw on your real experiences, and be as specific as you can. The interviewer wants to hear your genuine story — not a rehearsed script. You are more prepared than you think. Now let's begin!";
  await showMentorBubble(introMsg);
  hideMentorBubble();
  setMentor('greet_smile');
  await sleep(700);

  setMentor('greet_smile');
  await sleep(300);
  posChar('mentorChar',{opacity:0});
  await sleep(600);

  await phaseInterviewerIn(openingNote);
}

async function phaseInterviewerIn(openingNote){
  S.phase='interviewer_in';
  const {w}=stageSize();
  const mob=isMobile();
  const isGentle = S.intensity==='gentle';
  S._usingFriendly = isGentle;

  if(isGentle){
    setFriendly('approve_talk');
    posChar('challChar',{opacity:0}); posChar('friendlyChar',{opacity:0});
    await sleep(200);
    posChar('friendlyChar',{opacity:1});
    await sleep(500);
  } else {
    setFriendly('calm'); setChall('neutral');
    posChar('friendlyChar',{opacity:0}); posChar('challChar',{opacity:0});
    await sleep(200);
    posChar('friendlyChar',{opacity:1}); posChar('challChar',{opacity:0.35});
    await sleep(500);
  }
  $('qPill').textContent=`Q 1 / ${S.questions.length}`;
  $('statusPill').textContent='Session Active';
  const greeting = openingNote || (S.intensity==='gentle'
    ? `Welcome! I'm really looking forward to our conversation today. Let's start whenever you're ready.`
    : `Good to meet you. I've had a chance to review your background. Let's begin — tell me about yourself.`);
  if(S.intensity==='gentle'){
    setFriendly('approve_talk');
    await showChallBubble(greeting);
    hideChallBubble();
    setFriendly('calm');
  } else {
    setFriendly('calm_talk');
    await showChallBubble(greeting);
    hideChallBubble();
    setFriendly('calm');
  }
  await sleep(400);
  await phaseAskQuestion(0);
}

async function phaseAskQuestion(idx){
  if(idx>=S.questions.length){await phaseEnd();return;}
  S.qIndex=idx;S.retryCount=0;
  S.phase='qa_ask';
  const q=S.questions[idx];
  const {w}=stageSize();

  $('qBarFill').style.width=((idx/S.questions.length)*100)+'%';
  $('qPill').textContent=`Q ${idx+1} / ${S.questions.length}`;
  $('statusPill').textContent='Interviewer';

  const hardKeywords=/weakness|failure|mistake|difficult|challenge|conflict|disagree|criticism|fired|regret|pressure|stress|worst|problem|struggle/i;
  const isHardQ = hardKeywords.test(q.q);

  if(S.intensity==='gentle' || !isHardQ){
    S._usingFriendly = true;
    setFriendly(S.intensity==='gentle'?'approve_talk':'calm_talk');
    posChar('friendlyChar',{opacity:1});
    posChar('challChar',{opacity:S.intensity==='gentle'?0:0.35});
    await sleep(300);
    showChallBubble(q.q);
    setTimeout(()=>setFriendly(S.intensity==='gentle'?'approve':'calm'), 1400);
  } else {
    S._usingFriendly = false;
    const cW=mob?Math.min(w*0.85,340):Math.min(480,w*0.70);
    const fW=mob?Math.min(w*0.65,260):Math.min(380,w*0.55);
    setChall('frown_talk');
    setFriendly('calm');
    posChar('challChar',   {opacity:1});
    posChar('friendlyChar',{opacity:0.15});
    await sleep(450);
    showChallBubble(q.q);
    setTimeout(()=>setChall('frown'), 1400);
  }

  $('bigMicBtn').style.display='flex';
  $('skipBtn').classList.add('show');
  $('micStatus').textContent='Tap to speak';
  $('micStatus').className='';
  if($('hearingDisplay')) $('hearingDisplay').textContent='';
  S.phase='qa_listening';
}

function initRec(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return null;
  const r=new SR();
  r.lang='en-US';
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  r.continuous=!isIOS;
  r.interimResults=true;
  r.maxAlternatives=1;

  r.onresult=e=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal){
        S.finalBuf+=e.results[i][0].transcript+' ';
      }else{
        interim+=e.results[i][0].transcript;
      }
    }
    const full=S.finalBuf+interim;
    S.wordCount=full.trim().split(/\s+/).filter(Boolean).length;
    const hd=$('hearingDisplay');
    if(hd){
      hd.textContent=full.trim();
      const ph=document.querySelector('.answer-placeholder');
      if(ph) ph.style.display=full.trim()?'none':'block';
      const bubble=$('answerBubble');
      if(bubble){ bubble.scrollTop=bubble.scrollHeight; }
    }

    if(S.finalBuf.trim()){
      clearTimeout(S.silTimer);
      if(S.wordCount>=CFG.voice.minWords){
        S.silTimer=setTimeout(()=>stopVoice(false), CFG.voice.silenceDly);
      }
    }
  };

  r.onerror=e=>{
    if(e.error==='not-allowed' || e.error==='service-not-allowed'){
      if($('micStatus')) $('micStatus').textContent='Mic blocked — check browser settings';
      S.voiceState='idle';
      if($('bigMicBtn')) $('bigMicBtn').classList.remove('recording');
    } else if(e.error!=='no-speech' && e.error!=='aborted'){
      console.warn('[Rec error]',e.error);
    }
  };

  r.onend=()=>{
    if(S.voiceState==='recording'){
      try{r.start();}catch{}
    }
  };
  return r;
}

function startVoice(){
  if(S.voiceState==='recording'){stopVoice(false);return;}
  if(!recognition){
    recognition=initRec();
    if(!recognition){
      alert('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }
  }
  S.voiceState='recording';
  S.finalBuf=''; S.interimBuf=''; S.wordCount=0;
  if($('hearingDisplay')) $('hearingDisplay').textContent='';
  clearTimeout(S.silTimer);
  if(S.voiceState!=='recording') TTS.stop();

  try{ recognition.abort(); }catch{}
  setTimeout(()=>{
    try{ recognition.start(); }catch(e){ console.warn('[Rec start]',e.message); }
  }, 80);

  $('bigMicBtn').classList.add('recording');
  $('micStatus').textContent='Listening…';
  $('micStatus').className='active';
  hideMentorHint();

  const maxD=CFG.voice.maxDur[S.intensity]||45000;
  S.maxTimer=setTimeout(()=>stopVoice(false), maxD);

  if(S.intensity==='hardcore' && Math.random()<CFG.voice.hcCutoffChance){
    const cutT=CFG.voice.hcCutoffMin+Math.random()*(CFG.voice.hcCutoffMax-CFG.voice.hcCutoffMin);
    S.hcCutTimer=setTimeout(()=>{
      if(S.voiceState==='recording' && S.wordCount>=8){
        stopVoice(true);
        showChallBubble("Thank you — that will do.");
        setChall('neutral');
      }
    },cutT);
  }
}

function stopVoice(forced=false){
  if(S.voiceState!=='recording') return;
  S.voiceState='processing';
  clearTimeout(S.silTimer);
  clearTimeout(S.maxTimer);
  clearTimeout(S.hcCutTimer);
  S.hcCutTimer=null;
  try{ recognition&&recognition.stop(); }catch{}

  $('bigMicBtn').classList.remove('recording');
  $('micStatus').textContent='Processing…';
  $('skipBtn').classList.remove('show');

  const text=(S.finalBuf+S.interimBuf).trim();
  if(text && S.wordCount>=3){
    processAnswer(text,forced);
  }else{
    $('micStatus').textContent='Tap to speak';
    $('micStatus').className='';
    S.voiceState='idle';
    if(S.mentorMode!=='off'){
      showMentorHint("It's OK — take a breath and try again. Start with a simple sentence.","💡 Hint");
    }
  }
}

$('bigMicBtn').addEventListener('click',()=>{
  const canSpeak = S.phase==='qa_listening'||S.phase==='qa_retry'||S.phase==='qa_ask';
  if(!canSpeak) return;
  if(S.voiceState==='recording') stopVoice(false);
  else startVoice();
});

$('skipBtn').addEventListener('click',()=>{
  if(S.voiceState==='recording') stopVoice(false);
  clearTimeout(S.silTimer);
  if(S.scenario==='debate'){
    if(S.qLog.length>0) S.qLog[S.qLog.length-1].finalScore=0;
    S._debateRound=(S._debateRound||0)+1;
    if((S._debateRound||0)>=CFG.DEBATE_ROUNDS){phaseEnd();return;}
    processDebateAnswer('(passed)');
    return;
  }
  if(S.scenario==='smalltalk'){
    if(S.qLog.length>0) S.qLog[S.qLog.length-1].finalScore=0;
    processSmallTalkAnswer('...');
    return;
  }
  if(S.qLog[S.qIndex]){
    S.qLog[S.qIndex].userAnswers.push('[Skipped]');
    S.qLog[S.qIndex].finalScore=0;
  }
  $('skipBtn').classList.remove('show');
  if($('hearingDisplay')) $('hearingDisplay').textContent='';
  hideMentorHint();
  const next=S.qIndex+1;
  if(next>=S.questions.length){phaseEnd();}
  else phaseAskQuestion(next);
});

async function processAnswer(userText, forced){
  if(S.scenario==='debate' && S._isDebate){
    return processDebateAnswer(userText);
  }
  if(S.scenario==='smalltalk' && S._isSmallTalk){
    return processSmallTalkAnswer(userText);
  }
  const qi=S.qIndex;
  const q=S.questions[qi];
  S.qLog[qi].userAnswers.push(userText);
  $('bigMicBtn').style.display='none';
  $('skipBtn').classList.remove('show');
  $('micStatus').textContent='Evaluating…';
  $('micStatus').className='active';
  if($('hearingDisplay')) $('hearingDisplay').textContent='Thinking…';

  const evalSys=`You are an expert English interview coach evaluating a live practice answer.
Candidate Profile:\n${buildProfile()}
Question asked: "${q.q}" | Testing: ${q.dimension} — ${q.intent}

Evaluate this answer on: content quality, grammar accuracy, fluency, confidence, STAR structure, vocabulary.
Return ONLY valid JSON (no markdown):
{"quality":"good"|"ok"|"weak"|"blank","score":0-100,
 "coach_msg":"1-2 warm specific coaching sentences — reference their ACTUAL words",
 "praise_msg":"1 sentence of specific genuine praise",
 "grammar_note":"specific grammar error if any, or empty string",
 "should_retry":true|false}`;

  let ev={quality:'ok',score:0,coach_msg:'',praise_msg:'Good attempt!',grammar_note:'',should_retry:false};
  if(S.apiKey){
    const raw=await callAPI([{role:'user',content:`Q: ${q.q}\nAnswer: "${userText}"\n\nEvaluate.`}],evalSys,280);
    if(raw){try{ev={...ev,...JSON.parse(raw.replace(/```json|```/g,'').trim())};}catch{}}
  }else{
    const wc=userText.trim().split(/\s+/).filter(Boolean).length;
    if(wc<5){ev.quality='weak';ev.score=0;ev.should_retry=S.retryCount<CFG.MAX_RETRIES;ev.coach_msg=FB.comfort[Math.floor(Math.random()*FB.comfort.length)];}
    else if(wc<15){ev.quality='ok';ev.score=Math.round(40+wc*2);ev.praise_msg=FB.praise[Math.floor(Math.random()*FB.praise.length)];}
    else{ev.quality='good';ev.score=Math.min(95,Math.round(55+wc*1.5));ev.praise_msg=FB.praise[Math.floor(Math.random()*FB.praise.length)];}
  }

  S.qLog[qi].finalScore=ev.score;
  S.qLog[qi].evalNotes=(S.qLog[qi].evalNotes||'')+(ev.grammar_note?`Grammar: ${ev.grammar_note}. `:'')+ev.coach_msg;

  $('micStatus').textContent='Tap to speak';
  $('micStatus').className='';
  S.voiceState='idle';

  if(ev.quality==='good'||(!ev.should_retry&&ev.quality!=='blank')){
    S.qLog[qi].retries=S.retryCount;
    if(S.intensity==='gentle' || S._usingFriendly){
      setFriendly('excited_talk');
      await showChallBubble(ev.quality==='good'?"Great answer! Let's continue.":"Alright, let's move on.");
      hideChallBubble();
      setFriendly('calm');
    } else {
      setChall('smile_talk');
      await showChallBubble(ev.quality==='good'?"Noted. Let's move on.":"Alright. Next question.");
      hideChallBubble();
      setChall('neutral');
    }

    if(S.mentorMode!=='off' && S.intensity==='gentle'){
      await phaseMentorPraise(ev.praise_msg);
    }else{
      await sleep(600);
    }
    const next=qi+1;
    if(next>=S.questions.length){await phaseEnd();}
    else await phaseAskQuestion(next);

  }else if(ev.should_retry && S.retryCount<CFG.MAX_RETRIES){
    S.retryCount++;
    S.qLog[qi].retries=S.retryCount;
    setChall('frown');
    await sleep(600);
    setChall('neutral');

    if(S.mentorMode!=='off'){
      await phaseMentorCoach(ev.coach_msg||FB.coach[S.retryCount%FB.coach.length],
        S.retryCount===1?'comfort':'coach');
    }
    S.phase='qa_retry';
    $('bigMicBtn').style.display='flex';
    $('skipBtn').classList.add('show');
    $('micStatus').textContent=`Try again (${S.retryCount}/${CFG.MAX_RETRIES})`;
    $('micStatus').className='active';

  }else{
    S.qLog[qi].retries=S.retryCount;
    if(S.mentorMode!=='off'){
      await showMentorHint("You gave it your all — we'll review this one at the end. Keep going! 💪","🌟 Keep Going");
      hideMentorHint();
    }
    setChall('neutral');
    const next=qi+1;
    if(next>=S.questions.length){await phaseEnd();}
    else{await sleep(400);await phaseAskQuestion(next);}
  }
}

async function phaseMentorCoach(text,type){
  const {w}=stageSize();
  posChar('mentorChar',{opacity:1});
  posChar('friendlyChar',{opacity:0.15}); posChar('challChar',{opacity:0.15});

  setMentor(type==='comfort'?'hint_talk':'hint_talk');
  await sleep(300);
  
  posChar('mentorChar',{opacity:1});
  posChar('friendlyChar',{opacity:0.15});
  posChar('challChar',{opacity:0.15});
  await sleep(400);

  await showMentorHint(text, type==='comfort'?'💜 Support':'🎯 Try This');
  hideMentorHint();
  setMentor('hint_smile');
  await sleep(500);

  posChar('mentorChar',{opacity:0});
  posChar('friendlyChar',{opacity:S.intensity==='gentle'?1:S._usingFriendly?1:0.25});
  posChar('challChar',{opacity:S.intensity==='gentle'?0:S._usingFriendly?0.35:1});
  await sleep(400);
}

async function phaseMentorPraise(text){
  const {w}=stageSize();
  setMentor('laugh_talk');
  await sleep(420);
  posChar('mentorChar',{opacity:1});
  await sleep(950);
  const praiseMsg = text||'Excellent! That was a genuinely strong answer.';
  await showMentorHint(praiseMsg,'🌟 Well Done!');
  hideMentorHint();
  setMentor('laugh');
  await sleep(700);

  posChar('mentorChar',{opacity:0});
  posChar('friendlyChar',{opacity:S.intensity==='gentle'?1:0.25});
  posChar('challChar',{opacity:S.intensity==='gentle'?0:0.35});
  await sleep(400);
}

async function phaseEnd(){
  S.phase='session_end';
  clearTimeout(S.silTimer);
  clearTimeout(S.maxTimer);
  clearTimeout(S.hcCutTimer);
  S.voiceState='idle';
  TTS.stop();
  $('bigMicBtn').style.display='none';
  $('skipBtn').classList.remove('show');
  $('qBarFill').style.width='100%';
  $('statusPill').textContent='Complete';

  setChall('neutral');
  const {w}=stageSize();
  const mob=isMobile();
  const cW=mob?Math.min(w*0.85,340):Math.min(480,w*0.70);
  const fW=mob?Math.min(w*0.65,260):Math.min(380,w*0.55);
  if(S.scenario==='interview' && S.intensity==='gentle'){
    posChar('friendlyChar',{opacity:1});
    posChar('challChar',{opacity:0});
    setFriendly('approve_talk');
    await showChallBubble("That wraps up our session! You did wonderfully. Let's see how you did!");
  } else {
    posChar('challChar',{opacity:1});
    posChar('friendlyChar',{opacity:0});
    setChall('neutral');
    await showChallBubble("That concludes our session. I'll review your performance now.");
  }
  hideChallBubble();
  await generateFeedback();
}

$('endBtn').addEventListener('click',()=>{
  if(!confirm('End the session and see your results?')) return;
  clearTimeout(S.silTimer);clearTimeout(S.maxTimer);clearTimeout(S.hcCutTimer);
  TTS.stop();
  if(S.voiceState==='recording'){try{recognition&&recognition.abort();}catch{}}
  S.voiceState='idle';
  phaseEnd();
});

async function generateFeedback(){
  showScreen('feedbackScreen');
  showLoad('Generating your detailed analysis…');

  const position=S.scenario==='debate'?'Debate Session':S.scenario==='smalltalk'?'Small Talk':(S.position||'Interview Session');
  const modeLabel=S.scenario==='debate'?'Debate':S.scenario==='smalltalk'?'Conversation':({gentle:'Gentle',medium:'Realistic',hardcore:'Hardcore'}[S.intensity]||'');
  const countLabel=S.scenario==='debate'?S.qLog.length+' rounds':S.scenario==='smalltalk'?S.qLog.length+' turns':S.questions.length+' questions';
  const fbSub=$('fbSub');
  if(fbSub) fbSub.textContent=position+' · '+countLabel+' · '+modeLabel+' Mode';

  const summaryLabel=S.scenario==='debate'?'Round':'Q';
  const sessionSummary=(S.qLog.length>0?S.qLog:[]).map((l,i)=>
    `${summaryLabel}${i+1} [${l.dimension||'General'}]: "${l.question||''}"\n  Answer: "${(l.userAnswers||[]).slice(-1)[0]||'(none)'}"\n  Notes: ${l.evalNotes||''}`
  ).join('\n\n')||'No recorded exchanges.';

  const scenarioContext = S.scenario==='debate'
    ? 'debate coach (assess argument, evidence, rebuttal, vocabulary, fluency, confidence)'
    : S.scenario==='smalltalk'
    ? 'conversational English coach (assess naturalness, question-asking, warmth, vocabulary, fluency, listening)'
    : 'interview coach (assess grammar, fluency, vocabulary, content, strategy, confidence)';

  const detailSys=`You are an expert English ${scenarioContext} conducting a POST-SESSION analysis.

Candidate Profile:\n${buildProfile()}

Full Session:
${sessionSummary}

Analyse comprehensively. Be SPECIFIC — reference the candidate's ACTUAL words. No generic comments.

Return ONLY valid JSON (no markdown):
{
  "dims":{
    "grammar":{"score":0-100,"note":"specific grammatical issues found or 'No major errors'"},
    "fluency":{"score":0-100,"note":"filler words, hesitation patterns, rhythm"},
    "vocabulary":{"score":0-100,"note":"precision, richness, incorrect word choices"},
    "content":{"score":0-100,"note":"specificity of examples, STAR structure"},
    "strategy":{"score":0-100,"note":"question addressing, opening, structure"},
    "confidence":{"score":0-100,"note":"directness, hedging language"},
    "argument":{"score":0-100,"note":"debate argument logic"},
    "evidence":{"score":0-100,"note":"use of examples in debate"},
    "rebuttal":{"score":0-100,"note":"counter-argument quality"},
    "naturalness":{"score":0-100,"note":"conversation naturalness"},
    "questions":{"score":0-100,"note":"quality of questions asked"},
    "warmth":{"score":0-100,"note":"friendliness in conversation"},
    "listening":{"score":0-100,"note":"responsiveness to partner"}
  },
  "issues":[
    {"type":"grammar|fluency|strategy","problem":"specific problem","fix":"concrete fix"}
  ],
  "vocab_upgrades":[
    {"original":"word/phrase they used","better":"superior alternative","context":"when to use"}
  ],
  "advanced_phrases":[
    {"phrase":"expression","meaning":"what it means","example":"example sentence using it"}
  ],
  "narrative":"Poetic 2-sentence summary: name a specific strength and a specific challenge",
  "challenger_verdict":"frank 3-4 sentence assessment. Start with one strength, then specific improvements. Reference actual answers.",
  "mentor_letter":"warm 3-4 sentence letter. One specific win, one specific next action. Like a wise friend."
}`;

  const [rJ,rC,rM]=await Promise.allSettled([
    callAPI([{role:'user',content:`Full session:\n${sessionSummary}\n\nProvide full analysis JSON.`}],detailSys,900),
    callAPI([{role:'user',content:`Session:\n${sessionSummary}\n\nGive your frank interviewer's assessment. 3-4 sentences. Be specific.`}],
      `You are the interviewer who just ran a "${position}" session. Be honest and professional.`,220),
    callAPI([{role:'user',content:`Session:\n${sessionSummary}\n\nWrite your warm mentor letter. 3-4 sentences. Be specific and encouraging.`}],
      `You are the warm Mentor from this session. Write like a brilliant older sibling who wants them to succeed.`,220),
  ]);

  hideLoad();

  let data={dims:{},issues:[],vocab_upgrades:[],advanced_phrases:[],narrative:'',challenger_verdict:'',mentor_letter:''};
  if(rJ.status==='fulfilled'&&rJ.value){
    try{data={...data,...JSON.parse(rJ.value.replace(/```json|```/g,'').trim())};}catch{}
  }
  S.feedbackData=data;
  S.advancedPhrases=data.advanced_phrases||[];

  const SCENARIO_DIMS={
    interview:[
      {key:'grammar',    icon:'G',label:'Grammar',    color:'#C03030'},
      {key:'fluency',    icon:'F',label:'Fluency',    color:'#2A6E4A'},
      {key:'vocabulary', icon:'V',label:'Vocabulary', color:'#243870'},
      {key:'content',    icon:'C',label:'Content',    color:'#7A4E08'},
      {key:'strategy',   icon:'S',label:'Strategy',  color:'#5A3888'},
      {key:'confidence', icon:'X',label:'Confidence', color:'#B06010'},
    ],
    debate:[
      {key:'argument',   icon:'A',label:'Argument',   color:'#0D7377'},
      {key:'evidence',   icon:'E',label:'Evidence',   color:'#085f63'},
      {key:'rebuttal',   icon:'R',label:'Rebuttal',   color:'#144552'},
      {key:'vocabulary', icon:'V',label:'Vocabulary', color:'#243870'},
      {key:'fluency',    icon:'F',label:'Fluency',    color:'#2A6E4A'},
      {key:'confidence', icon:'X',label:'Confidence', color:'#B06010'},
    ],
    smalltalk:[
      {key:'naturalness',icon:'N',label:'Naturalness', color:'#6B5B95'},
      {key:'questions',  icon:'Q',label:'Questions',   color:'#8a72b5'},
      {key:'warmth',     icon:'W',label:'Warmth',      color:'#a48dc0'},
      {key:'vocabulary', icon:'V',label:'Vocabulary',  color:'#243870'},
      {key:'fluency',    icon:'F',label:'Fluency',     color:'#2A6E4A'},
      {key:'listening',  icon:'L',label:'Listening',   color:'#5A3888'},
    ],
  };
  const DIM_DEFS=SCENARIO_DIMS[S.scenario]||SCENARIO_DIMS.interview;
  const dimScores=$('dimScores');
  if(dimScores){
    dimScores.innerHTML=DIM_DEFS.map(d=>{
      const dim=data.dims[d.key]||{score:0,note:'No data for this session.'};
      const s=dim.score;
      return `<div class="dim-card">
        <div class="dim-name">${d.icon} ${d.label}<span class="dim-score" style="color:${d.color}">${s}</span></div>
        <div class="dim-bar-bg"><div class="dim-bar-fill" style="width:${s}%;background:${d.color}"></div></div>
        <div class="dim-note">${esc(dim.note||'—')}</div>
      </div>`;
    }).join('');
  }
  setTimeout(()=>{document.querySelectorAll('.dim-bar-fill').forEach(b=>{b.style.transition='width 1.1s ease';});},100);

  if(data.narrative){
    const narrativeText=$('narrativeText');
    const narrativeBox=$('narrativeBox');
    if(narrativeText) narrativeText.textContent=data.narrative;
    if(narrativeBox) narrativeBox.style.display='block';
  }

  const issues=data.issues||[];
  if(issues.length){
    const issuesSection=$('issuesSection');
    const issuesList=$('issuesList');
    if(issuesSection) issuesSection.style.display='block';
    if(issuesList){
      issuesList.innerHTML=issues.map(i=>{
        const bc=i.type==='grammar'?'badge-err':i.type==='strategy'?'badge-tip':'badge-tip';
        return `<div class="issue-row">
          <span class="issue-badge ${bc}">${i.type.toUpperCase()}</span>
          <div class="issue-content"><strong>${esc(i.problem)}</strong><br>${esc(i.fix)}</div>
        </div>`;
      }).join('');
    }
  }

  const vu=data.vocab_upgrades||[];
  if(vu.length){
    const vocabSection=$('vocabSection');
    const vocabList=$('vocabList');
    if(vocabSection) vocabSection.style.display='block';
    if(vocabList){
      vocabList.innerHTML=vu.map(v=>`
        <div class="vocab-row">
          <span class="vocab-orig">${esc(v.original)}</span>
          <span class="vocab-arrow">→</span>
          <span class="vocab-better">${esc(v.better)}</span>
          <span></span>
          <span class="vocab-ctx" style="grid-column:1/-1">💬 ${esc(v.context)}</span>
        </div>`).join('');
    }
  }

  const ap=S.advancedPhrases;
  if(ap.length){
    const phrasesSection=$('phrasesSection');
    const phrasesList=$('phrasesList');
    const wordPracticeBtn=$('wordPracticeBtn');
    if(phrasesSection) phrasesSection.style.display='block';
    if(phrasesList){
      phrasesList.innerHTML=ap.map(p=>`
        <div class="phrase-card">
          <div class="phrase-text">"${esc(p.phrase)}"</div>
          <div class="phrase-meaning">↳ ${esc(p.meaning)}</div>
          <div class="phrase-example">e.g. "${esc(p.example)}"</div>
        </div>`).join('');
    }
    if(wordPracticeBtn) wordPracticeBtn.style.display='inline-flex';
    saveSRS(ap.map(p=>p.phrase));
  }

  const challCardHead=document.querySelector('.fb-card:first-child .fbc-name');
  const challCardRole=document.querySelector('.fb-card:first-child .fbc-role');
  if(S.scenario==='debate'&&challCardHead){challCardHead.textContent="Debater's Assessment";challCardRole.textContent="Sharp · Argumentative";}
  else if(S.scenario==='smalltalk'&&challCardHead){challCardHead.textContent="Your Conversation Partner";challCardRole.textContent="Gentle · Honest";}

  const fbChallenger=$('fbChallenger');
  const fbMentor=$('fbMentor');
  if(fbChallenger){
    fbChallenger.textContent=(rC.status==='fulfilled'&&rC.value?rC.value:null)||
      data.challenger_verdict||
      "You demonstrated real effort throughout. Your strongest moments came when you offered specific examples. Next time, ensure every answer contains at least one concrete, verifiable detail — a number, a date, a name.";
  }
  if(fbMentor){
    fbMentor.textContent=(rM.status==='fulfilled'&&rM.value?rM.value:null)||
      data.mentor_letter||
      "You showed up and that matters more than you know. Your answers grew more detailed as the session went on — that's real growth. For next time: practice your 60-second introduction three times before you sleep tonight. You're closer than you think.";
  }

  // ────────── AI 错误分析及练习生成（新增）──────────
  async function analyzeAnswersWithAI() {
    const allAnswers = [];
    for (const log of S.qLog) {
      const answers = log.userAnswers || [];
      for (const ans of answers) {
        if (ans && ans !== '[Skipped]' && ans !== '...' && ans.trim().length > 5) {
          allAnswers.push({
            question: log.question,
            answer: ans,
            dimension: log.dimension
          });
        }
      }
    }
    if (allAnswers.length === 0) return [];

    const prompt = `You are an expert English teacher. Analyze each user answer below and extract:
- The original incorrect phrase/sentence (exact wording)
- The corrected version (natural, grammatically correct)
- A short tip explaining why it's wrong
- Error type (grammar, vocabulary, preposition, tense, chinglish, etc.)
- Difficulty level of this error (beginner, intermediate, advanced) based on the user's overall English level (inferred from answers)

User answers:
${allAnswers.map((a, i) => `[Answer ${i+1}] Question: ${a.question}\nAnswer: "${a.answer}"`).join('\n\n')}

Return ONLY valid JSON array. Each object must have:
{"original": "the incorrect phrase", "correction": "correct version", "tip": "short explanation", "type": "error type", "difficulty": "beginner|intermediate|advanced"}

If an answer has no error, omit it. Maximum 6 errors total.`;

    try {
      const result = await callAPI([{ role: 'user', content: prompt }], prompt, 800);
      if (result) {
        const cleaned = result.replace(/```json|```/g, '').trim();
        const errors = JSON.parse(cleaned);
        return Array.isArray(errors) ? errors : [];
      }
    } catch (e) {
      console.warn('[AI Error Analysis]', e);
    }
    return [];
  }

  const aiErrors = await analyzeAnswersWithAI();
  if (aiErrors.length > 0) {
    S.practiceErrors = [];
    for (const err of aiErrors.slice(0, 6)) {
      S.practiceErrors.push({
        original: err.original,
        correction: err.correction,
        tip: err.tip,
        type: err.type,
        difficulty: err.difficulty || 'intermediate'
      });
    }
    if (typeof generateExercisesWithAI === 'function') {
      await generateExercisesWithAI();
    } else {
      console.warn('generateExercisesWithAI not defined');
    }
  }

  const epBtn = document.getElementById('errorPracticeBtn');
  if (epBtn) epBtn.style.display = (S.practiceErrors && S.practiceErrors.length > 0) ? 'inline-flex' : 'none';
}

/* ── AI 练习生成器（基于错误和用户水平）── */
async function generateExercisesWithAI() {
  if (!S.practiceErrors.length) return;

  const userLevel = inferUserLevel();
  const prompt = `You are an English tutor. For each error below, create a short practice exercise (translation or sentence construction) that matches the user's level (${userLevel}).

Rules:
- Exercise type: either "translate" (Chinese-to-English) or "rewrite" (correct a wrong sentence) or "complete" (fill in the blank).
- Difficulty: beginner = very simple sentences, intermediate = everyday topics, advanced = professional or nuanced.
- Keep each exercise short (1 sentence to translate, or 1 wrong sentence to rewrite).

Return ONLY valid JSON array with the same length as input errors. Each object:
{"type": "translate"|"rewrite"|"complete", "task": "the exercise text in English (if translate, provide Chinese sentence; if rewrite, provide wrong sentence)", "hint": "optional hint"}

Errors:
${JSON.stringify(S.practiceErrors.map(e => ({ original: e.original, correction: e.correction, type: e.type, difficulty: e.difficulty })), null, 2)}`;

  try {
    const result = await callAPI([{ role: 'user', content: prompt }], prompt, 1000);
    if (result) {
      const cleaned = result.replace(/```json|```/g, '').trim();
      const exercises = JSON.parse(cleaned);
      if (Array.isArray(exercises) && exercises.length === S.practiceErrors.length) {
        for (let i = 0; i < S.practiceErrors.length; i++) {
          S.practiceErrors[i].exercise = exercises[i];
        }
      } else {
        fallbackExercises();
      }
    } else {
      fallbackExercises();
    }
  } catch (e) {
    console.warn('[AI Exercise Generation]', e);
    fallbackExercises();
  }

  function fallbackExercises() {
    S.practiceErrors.forEach((err, idx) => {
      S.practiceErrors[idx].exercise = {
        type: 'translate',
        task: `请翻译：${err.correction}`,
        hint: `使用 "${err.correction}"`
      };
    });
  }
}

function inferUserLevel() {
  let totalWords = 0;
  let errorCount = 0;
  for (const log of S.qLog) {
    const answers = log.userAnswers || [];
    for (const ans of answers) {
      if (ans && typeof ans === 'string') {
        totalWords += ans.split(/\s+/).length;
        if (ans.includes('[Skipped]')) errorCount++;
      }
    }
  }
  const avgLen = totalWords / (S.qLog.length || 1);
  if (avgLen < 10 || errorCount > 3) return 'beginner';
  if (avgLen < 20) return 'intermediate';
  return 'advanced';
}

/* ── WORD PRACTICE ── */
$('wordPracticeBtn').addEventListener('click',()=>{
  if(!S.advancedPhrases.length) return;
  S.wpIndex=0;
  showScreen('wordPracticeScreen');
  showWPPhrase(0);
});

function showWPPhrase(idx){
  const phrases=S.advancedPhrases;
  if(idx>=phrases.length){wpDone();return;}
  const p=phrases[idx];
  const wpPhraseCard=$('wpPhraseCard');
  if(wpPhraseCard){
    wpPhraseCard.innerHTML=`
      <div class="wpp-num">PHRASE ${idx+1} / ${phrases.length}</div>
      <div class="wpp-phrase">"${esc(p.phrase)}"</div>
      <div class="wpp-meaning">Meaning: ${esc(p.meaning)}</div>
      <div class="wpp-example">Example: "${esc(p.example)}"</div>`;
  }
  const wpPrompt=$('wpPrompt');
  if(wpPrompt) wpPrompt.textContent=`Now try using this phrase naturally in a sentence — talk about your interview topic or yourself.`;
  const wpTranscript=$('wpTranscript');
  if(wpTranscript) wpTranscript.textContent='';
  const wpEval=$('wpEval');
  if(wpEval){ wpEval.style.display='none'; wpEval.className='wp-eval'; }
  const wpNextBtn=$('wpNextBtn');
  if(wpNextBtn) wpNextBtn.style.display='none';
  const wpMicStatus=$('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent='Tap to speak';
  const wpProgress=$('wpProgress');
  if(wpProgress) wpProgress.textContent=`${idx+1} of ${phrases.length} phrases`;
}

let wpRec=null;
$('wpMicBtn').addEventListener('click',()=>{
  if($('wpMicBtn').classList.contains('recording')){
    wpRec&&wpRec.stop();
    $('wpMicBtn').classList.remove('recording');
    const wpMicStatus=$('wpMicStatus');
    if(wpMicStatus) wpMicStatus.textContent='Processing…';
    return;
  }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Voice requires Chrome or Edge.');return;}
  wpRec=new SR();
  wpRec.lang='en-US';wpRec.continuous=false;wpRec.interimResults=true;
  let buf='';
  wpRec.onresult=e=>{buf=Array.from(e.results).map(r=>r[0].transcript).join('');const wpTranscript=$('wpTranscript');if(wpTranscript) wpTranscript.textContent=buf;};
  wpRec.onend=async()=>{
    $('wpMicBtn').classList.remove('recording');
    if(buf.trim().length>4) await evaluateWPAnswer(buf.trim());
    else{const wpMicStatus=$('wpMicStatus');if(wpMicStatus) wpMicStatus.textContent='Tap to speak';}
  };
  wpRec.start();
  $('wpMicBtn').classList.add('recording');
  const wpMicStatus=$('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent='Listening (20s)…';
  setTimeout(()=>{try{wpRec.stop();}catch{}},20000);
});

async function evaluateWPAnswer(text){
  const phrase=S.advancedPhrases[S.wpIndex]?.phrase||'';
  const evalEl=$('wpEval');
  const wpMicStatus=$('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent='Evaluating…';
  let evalResult={correct:false,feedback:'Nice try! Keep practising this phrase.'};
  if(S.apiKey){
    const sys=`You are a language coach. The learner was asked to use the phrase "${phrase}" in a sentence.
Their sentence: "${text}"
Did they use the phrase correctly (or a close natural variation)? 
Return ONLY JSON: {"correct":true|false,"feedback":"one warm specific sentence of feedback"}`;
    const raw=await callAPI([{role:'user',content:text}],sys,100);
    if(raw){try{evalResult={...evalResult,...JSON.parse(raw.replace(/```json|```/g,'').trim())};}catch{}}
  }else{
    const used=text.toLowerCase().includes((phrase||'').toLowerCase().split(' ')[0]);
    evalResult.correct=used;
    evalResult.feedback=used?'Great — you used it naturally!':'Try working the exact phrase into your sentence.';
  }

  if(evalEl){
    evalEl.textContent=evalResult.feedback;
    evalEl.className='wp-eval '+(evalResult.correct?'good':'ok');
    evalEl.style.display='block';
  }
  const wpNextBtn=$('wpNextBtn');
  if(wpNextBtn) wpNextBtn.style.display='inline-flex';
  if(wpMicStatus) wpMicStatus.textContent='Done';
}

$('wpNextBtn').addEventListener('click',()=>{S.wpIndex++;showWPPhrase(S.wpIndex);});
$('wpDoneBtn').addEventListener('click',wpDone);
function wpDone(){showScreen('feedbackScreen');}

/* ── FEEDBACK ACTIONS ── */
$('againBtn').addEventListener('click',()=>{
  S.qIndex=0;S.retryCount=0;S.voiceState='idle';S.phase='idle';
  S._isDebate=false;S._isSmallTalk=false;S._debateRound=0;S._stTurn=0;S._stHistory=[];
  TTS.stop();
  try{recognition&&recognition.abort();}catch{}
  $('bigMicBtn').style.display='none';
  const dimScores=$('dimScores'); if(dimScores) dimScores.innerHTML='';
  const issuesList=$('issuesList'); if(issuesList) issuesList.innerHTML='';
  const vocabList=$('vocabList'); if(vocabList) vocabList.innerHTML='';
  const phrasesList=$('phrasesList'); if(phrasesList) phrasesList.innerHTML='';
  const narrativeBox=$('narrativeBox'); if(narrativeBox) narrativeBox.style.display='none';
  const issuesSection=$('issuesSection'); if(issuesSection) issuesSection.style.display='none';
  const vocabSection=$('vocabSection'); if(vocabSection) vocabSection.style.display='none';
  const phrasesSection=$('phrasesSection'); if(phrasesSection) phrasesSection.style.display='none';
  const wordPracticeBtn=$('wordPracticeBtn'); if(wordPracticeBtn) wordPracticeBtn.style.display='none';
  S.feedbackData=null;S.advancedPhrases=[];S.qLog=S.questions.map(q=>({question:q.q,dimension:q.dimension||'',intent:q.intent||'',userAnswers:[],finalScore:null,retries:0,evalNotes:''}));
  launchArena("Welcome back. Let's try this again — you'll do even better this time.");
});
$('newIntakeBtn').addEventListener('click',()=>{
  ['fiSpeciality','fiResume','fiPosition','fiGoal','fiCompany'].forEach(id=>{const el=$(id);if(el)el.value='';});
  const savedK=localStorage.getItem('mm_apikey')||'';
  if(savedK && $('fiApiKey')){ $('fiApiKey').value=savedK; }
  document.querySelectorAll('.id-pill,.int-pill,.tog-opt,.prov-pill').forEach(x=>x.classList.remove('on'));
  const mediumPill=document.querySelector('.int-pill[data-int="medium"]');
  if(mediumPill) mediumPill.classList.add('on');
  const autoToggle=document.querySelector('.tog-opt[data-mode="auto"]');
  if(autoToggle) autoToggle.classList.add('on');
  const deepseekPill=document.querySelector('.prov-pill[data-provider="deepseek"]');
  if(deepseekPill) deepseekPill.classList.add('on');
  S.questions=[];S.qLog=[];S.position='';
  S._isDebate=false;S._isSmallTalk=false;S._debateRound=0;S._stTurn=0;S._stHistory=[];
  showScreen('hubScreen');
  const p=loadProfile();
  if(p&&p.position){
    const d=new Date(p.savedAt).toLocaleDateString();
    const bannerText=$('bannerText');
    if(bannerText) bannerText.textContent=`📋 Profile saved on ${d} (${p.position}). Load it?`;
    const profileBanner=$('profileBanner');
    if(profileBanner) profileBanner.classList.add('show');
  }
});

document.addEventListener('touchstart',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});

let _resizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(_resizeTimer);
  _resizeTimer=setTimeout(()=>{
    if(!$('stage')) return;
    const {w}=stageSize();
    const mob=isMobile();
    const phase=S.phase;
    if(['qa_listening','qa_retry','qa_ask'].includes(phase)){
      const cW=mob?Math.min(w*0.85,340):Math.min(480,w*0.70);
      posChar('challChar',{left:(w-cW)/2,width:cW,opacity:1});
      posChar('mentorChar',{opacity:1});
    }
  },180);
});
document.addEventListener('touchstart', ()=>{
  if(window.speechSynthesis){
    const u=new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(u);
  }
},{once:true,passive:true});

/* ──────────────────────────────────────────────
   纠错练习屏控制函数（新增）
────────────────────────────────────────────── */
function startErrorPractice() {
  if (!S.practiceErrors.length) {
    alert('没有收集到错误，试试先完成一次面试吧！');
    return;
  }
  S.practiceIndex = 0;
  showScreen('errorPracticeScreen');
  const mentorImg = document.getElementById('epMentorSprite');
  if (mentorImg) mentorImg.src = MENTOR_EXPR.greet_smile;
  if (S.epRecognition) {
    try { S.epRecognition.abort(); } catch(e) {}
  }
  S.epRecognition = initEpRecognition();
  loadPracticeItem(0);
}

function loadPracticeItem(idx) {
  if (idx >= S.practiceErrors.length) {
    const mentorText = document.getElementById('epMentorText');
    if(mentorText) mentorText.innerHTML = "🎉 太棒了！你完成了所有纠错练习！继续加油～";
    const nextBtn = document.getElementById('epNextBtn');
    if(nextBtn) nextBtn.style.display = 'none';
    const doneBtn = document.getElementById('epDoneBtn');
    if(doneBtn) doneBtn.style.display = 'inline-flex';
    return;
  }
  const err = S.practiceErrors[idx];
  const ex = err.exercise || { type: 'translate', task: `请正确说出：${err.correction}`, hint: '' };
  
  let taskHtml = '';
  if (ex.type === 'translate') {
    taskHtml = `📝 汉译英：<br>“${ex.task}”`;
  } else if (ex.type === 'rewrite') {
    taskHtml = `✏️ 改错：<br>“${ex.task}”<br><span style="font-size:14px;">→ 改正这个句子</span>`;
  } else {
    taskHtml = `📖 完成句子：<br>${ex.task}`;
  }
  if (ex.hint) taskHtml += `<br><span style="font-size:13px; color:var(--ink-dim);">💡 提示：${ex.hint}</span>`;

  const errorOriginal = document.getElementById('epErrorOriginal');
  if(errorOriginal) errorOriginal.innerHTML = `❌ 你说：${err.original}`;
  const correction = document.getElementById('epCorrection');
  if(correction) correction.innerHTML = `✅ 应该说：${err.correction}`;
  const tip = document.getElementById('epTip');
  if(tip) tip.innerHTML = `💡 ${err.tip}`;
  const task = document.getElementById('epTask');
  if(task) task.innerHTML = taskHtml;
  const progress = document.getElementById('epProgress');
  if(progress) progress.innerHTML = `${idx+1} / ${S.practiceErrors.length}`;
  const answerDisplay = document.getElementById('epAnswerDisplay');
  if(answerDisplay) answerDisplay.innerHTML = '';
  const micStatus = document.getElementById('epMicStatus');
  if(micStatus) micStatus.innerHTML = 'Tap to speak';
  const micBtn = document.getElementById('epMicBtn');
  if(micBtn) micBtn.classList.remove('recording');
  const nextBtn = document.getElementById('epNextBtn');
  if(nextBtn) nextBtn.style.display = 'none';
  const mentorText = document.getElementById('epMentorText');
  if(mentorText) mentorText.innerHTML = '读一读左边的提示，然后按下麦克风练习吧！';
}

function initEpRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'en-US';
  r.continuous = false;
  r.interimResults = true;
  r.onresult = (e) => {
    let final = '';
    for (let i = 0; i < e.results.length; i++) {
      final += e.results[i][0].transcript;
    }
    S.epCurrentAnswer = final;
    const answerDisplay = document.getElementById('epAnswerDisplay');
    if(answerDisplay) answerDisplay.innerHTML = final;
  };
  r.onerror = (e) => {
    console.warn('[EP Rec]', e.error);
    const micStatus = document.getElementById('epMicStatus');
    if(micStatus) micStatus.innerHTML = 'Mic error, try again';
    const micBtn = document.getElementById('epMicBtn');
    if(micBtn) micBtn.classList.remove('recording');
  };
  r.onend = () => {
    const micBtn = document.getElementById('epMicBtn');
    if(micBtn) micBtn.classList.remove('recording');
    if (S.epCurrentAnswer && S.epCurrentAnswer.trim().length > 3) {
      const micStatus = document.getElementById('epMicStatus');
      if(micStatus) micStatus.innerHTML = '✔ 已记录';
      const nextBtn = document.getElementById('epNextBtn');
      if(nextBtn) nextBtn.style.display = 'inline-flex';
      const curErr = S.practiceErrors[S.practiceIndex];
      const mentorText = document.getElementById('epMentorText');
      if (curErr && S.epCurrentAnswer.toLowerCase().includes(curErr.correction.toLowerCase().split(' ')[0])) {
        if(mentorText) mentorText.innerHTML = '👍 很好！你正在进步。点击下一题。';
      } else {
        if(mentorText) mentorText.innerHTML = '再试试看，尽量用上刚才学的正确表达～';
      }
    } else {
      const micStatus = document.getElementById('epMicStatus');
      if(micStatus) micStatus.innerHTML = 'Tap to speak again';
    }
  };
  return r;
}

function startEpRecording() {
  if (!S.epRecognition) {
    alert('浏览器不支持语音识别，请使用 Chrome/Edge/Safari');
    return;
  }
  const micBtn = document.getElementById('epMicBtn');
  if (micBtn && micBtn.classList.contains('recording')) {
    try { S.epRecognition.stop(); } catch(e) {}
    return;
  }
  S.epCurrentAnswer = '';
  const answerDisplay = document.getElementById('epAnswerDisplay');
  if(answerDisplay) answerDisplay.innerHTML = '';
  const micStatus = document.getElementById('epMicStatus');
  if(micStatus) micStatus.innerHTML = 'Listening...';
  if(micBtn) micBtn.classList.add('recording');
  try { S.epRecognition.start(); } catch(e) { console.warn(e); }
}

function nextPracticeItem() {
  S.practiceIndex++;
  loadPracticeItem(S.practiceIndex);
}

function finishErrorPractice() {
  showScreen('feedbackScreen');
  if (S.epRecognition) {
    try { S.epRecognition.abort(); } catch(e) {}
  }
}

function bindErrorPracticeEvents() {
  const epMic = document.getElementById('epMicBtn');
  if (epMic) epMic.addEventListener('click', startEpRecording);
  const epNext = document.getElementById('epNextBtn');
  if (epNext) epNext.addEventListener('click', nextPracticeItem);
  const epDone = document.getElementById('epDoneBtn');
  if (epDone) epDone.addEventListener('click', finishErrorPractice);
  const epErrorBtn = document.getElementById('errorPracticeBtn');
  if (epErrorBtn) epErrorBtn.addEventListener('click', startErrorPractice);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindErrorPracticeEvents);
} else {
  bindErrorPracticeEvents();
}

console.log('🎭 Mirror & Mentor v5 — Complete');
