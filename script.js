'use strict';

/* ── SPRITES (保持不变) ── */
const MENTOR_EXPR={
  greet_talk:  IMGS.mentor_hello_talk,
  greet_smile: IMGS.mentor_hello_smile,
  praise:      IMGS.mentor_praise,
  hint_talk:   IMGS.mentor_hint_talk,
  hint_smile:  IMGS.mentor_hint_smile,
  laugh:       IMGS.mentor_clap1,
  laugh_talk:  IMGS.mentor_clap2,
};
const CHALL_EXPR={
  neutral:      IMGS.chall_neutral,
  talk:         IMGS.chall_neutral_talk,
  frown:        IMGS.chall_frown,
  frown_talk:   IMGS.chall_frown_talk,
  smile:        IMGS.chall_smile,
  smile_talk:   IMGS.chall_smile_talk,
};
const FRIENDLY_EXPR={
  calm:         IMGS.fi_calm,
  calm_talk:    IMGS.fi_calm_talk,
  approve:      IMGS.fi_approve,
  approve_talk: IMGS.fi_approve_talk,
  excited_talk: IMGS.fi_highly_approve,
};

const _imgCache = {};
function preloadImg(src){
  if(!_imgCache[src]){ const i=new Image(); i.src=src; _imgCache[src]=i; }
}
function setExpr(spriteId, src){
  const el=document.getElementById(spriteId);
  if(!el || el._currentSrc===src) return;
  el._currentSrc=src;
  if(!_imgCache[src]){ const i=new Image(); i.src=src; _imgCache[src]=i; }
  el.style.transition='none';
  el.style.opacity='1';
  el.src=src;
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

const DEBATE_EXPR={
  neutral:   IMGS.mentor_hint_smile,
  talk:      IMGS.mentor_hint_talk,
  challenge: IMGS.mentor_greet_talk,
  agree:     IMGS.mentor_laugh,
  fire:      IMGS.mentor_laugh_talk,
};
const LISTEN_EXPR={
  idle:      IMGS.mentor_greet_smile,
  attentive: IMGS.mentor_hint_talk,
  respond:   IMGS.mentor_greet_talk,
  think:     IMGS.mentor_hint_smile,
  encourage: IMGS.mentor_laugh,
};

let ACTIVE_CHAR_EXPR = CHALL_EXPR;

function setDebater(expr){ setExpr('challSprite', DEBATE_EXPR[expr]||DEBATE_EXPR.neutral); }
function setListener(expr){ setExpr('challSprite', LISTEN_EXPR[expr]||LISTEN_EXPR.idle); }

document.getElementById('mentorSprite').src  = MENTOR_EXPR.greet_smile;
document.getElementById('challSprite').src   = CHALL_EXPR.neutral;
document.getElementById('friendlySprite').src = FRIENDLY_EXPR.calm;

/* ── CONFIG (语速调整) ── */
const CFG={
  API_TIMEOUT_MS:12000,
  MAX_RETRIES:3,
  DEBATE_ROUNDS:6,
  ST_TURNS:8,
  minimax:{
    model: 'speech-02-turbo',
    endpoint: 'https://api.minimax.io/v1/t2a_v2',
    voices:{
      challenger: { id:'English_magnetic_voiced_man', speed:1.2, vol:1.0, pitch:1,  emotion:'neutral' },
      mentor:     { id:'English_radiant_girl',        speed:1.25, vol:1.0, pitch:1,  emotion:'happy'   },
      debater:    { id:'English_Debator',             speed:1.3,  vol:1.0, pitch:1,  emotion:'happy'   },
      listener:   { id:'English_CalmWoman',           speed:1.15, vol:1.0, pitch:0,  emotion:'neutral' },
      friendly:   { id:'English_radiant_girl',        speed:1.2,  vol:1.0, pitch:1,  emotion:'happy'   },
    }
  },
  providers:{
    anthropic:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514'},
    deepseek: {url:'https://api.deepseek.com/chat/completions',model:'deepseek-chat'},
  },
  voice:{
    maxDur:  {gentle:50000,medium:45000,hardcore:32000},
    silenceDly: 3800,
    minWords:   5,
    hcCutoffChance: 0.28,
    hcCutoffMin:12000, hcCutoffMax:22000,
  },
};

/* ── STATE (新增 scriptVisible, userPracticeHistory) ── */
const S={
  scenario:'interview',
  apiKey:'', provider:'deepseek',
  minimaxKey:'',
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
  practiceErrors: [],
  practiceIndex: 0,
  epRecognition: null,
  epCurrentAnswer: '',
  // 新增
  scriptVisible: true,
  userPracticeHistory: [],   // 存储 { original, correction, exercise, userAnswer, timestamp, harderLevel }
};

let recognition = null;

const PROF_KEY='mm_v5_profile';
const SRS_KEY ='mm_v5_srs';
const PRACTICE_HISTORY_KEY = 'mm_practice_history';

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
function loadPracticeHistory(){
  try{ S.userPracticeHistory = JSON.parse(localStorage.getItem(PRACTICE_HISTORY_KEY)||'[]'); }catch(e){ S.userPracticeHistory = []; }
}
function savePracticeHistory(){
  try{ localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(S.userPracticeHistory)); }catch(e){}
}
(()=>{try{S.srsWords=JSON.parse(localStorage.getItem(SRS_KEY)||'[]');}catch{}})();
(()=>{ try{ const k=localStorage.getItem('mm_apikey')||''; if(k) S.apiKey=k; }catch{} })();
(()=>{ try{ const k=localStorage.getItem('mm_minimaxkey')||''; if(k) S.minimaxKey=k; }catch{} })();
loadPracticeHistory();

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
  if(id !== 'arenaScreen') hideVNTextbox();
}
function showLoad(m){$('loadingMsg').textContent=m||'Thinking…';$('loadingVeil').classList.add('show');}
function hideLoad(){$('loadingVeil').classList.remove('show');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* 角色定位函数 (保持不变) */
function stageSize(){ /* 同原代码 */ }
function isMobile(){ return window.innerWidth <= 600; }
function isLandscape(){ return window.innerWidth > window.innerHeight; }
function posInterviewers(difficulty){ /* 同原代码 */ }
function posChar(id,cfg){ /* 同原代码 */ }
function offLeft(id, w=320){ /* 同原代码 */ }
function offRight(id, w=320){ /* 同原代码 */ }
function center(id, w=360){ /* 同原代码 */ }
function leftMain(id, w=310){ /* 同原代码 */ }
function rightSmall(id, w=240){ /* 同原代码 */ }

/* ── TTS MODULE (队列完善) ── */
window._mmCorsBlocked = false;
const TTS = (()=>{
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

  let _audioCtx = null;
  let _currentSource = null;
  function getAudioCtx(){
    if(!_audioCtx || _audioCtx.state==='closed'){
      _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    }
    if(_audioCtx.state==='suspended') _audioCtx.resume();
    return _audioCtx;
  }

  function mmVoiceCfg(role){
    const m = CFG.minimax.voices;
    if(role==='challenger') return m.challenger;
    if(role==='debater')    return m.debater;
    if(role==='listener')   return m.listener;
    return m.mentor;
  }

  function roleForMode(mode){
    if(mode==='chall'){
      if(S.scenario==='debate')    return 'debater';
      if(S.scenario==='smalltalk') return 'listener';
      if(S._usingFriendly)         return 'friendly';
      return 'challenger';
    }
    return 'mentor';
  }

  async function callMiniMax(text, role){
    if (!text || text.trim().length === 0) return null;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let apiUrl, headers;
    if (!isLocal) {
      apiUrl = '/api/minimax';
      headers = { 'Content-Type': 'application/json' };
    } else {
      const key = S.minimaxKey;
      if (!key) return null;
      apiUrl = CFG.minimax.endpoint;
      headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
    }
    const vc = mmVoiceCfg(role);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
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
      const responseText = await res.text();
      let data;
      try { data = JSON.parse(responseText); } catch(e) { return null; }
      if (!res.ok) { console.warn('[MiniMax TTS] HTTP', res.status); return null; }
      if (data?.base_resp?.status_code !== 0 && data?.base_resp?.status_code !== undefined) {
        console.warn('[MiniMax TTS] API error:', data?.base_resp?.status_msg);
        return null;
      }
      const hexAudio = data?.data?.audio || data?.audio_file;
      if (!hexAudio) { console.warn('[MiniMax TTS] no audio in response'); return null; }
      const cleanHex = hexAudio.replace(/\s/g, '');
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i/2] = parseInt(cleanHex.substr(i,2), 16);
      }
      const ctx = getAudioCtx();
      let audioBuf;
      try {
        audioBuf = await ctx.decodeAudioData(bytes.buffer);
      } catch (decodeError) {
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        return null;
      }
      return audioBuf;
    } catch(e) { console.warn('[MiniMax TTS] error:', e.message); return null; }
  }

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

  function stopMiniMax(){ if(_currentSource){ try{ _currentSource.stop(); }catch{} _currentSource=null; } }
  function stop(){ stopMiniMax(); synth.cancel(); }
  function setEnabled(v){ enabled=v; if(!v) stop(); }

  function createUtterance(text, role){
    const u = new SpeechSynthesisUtterance(text);
    if(role==='challenger'||role==='debater'){
      u.voice=challVoice; u.pitch=0.80; u.rate=0.86; u.volume=1.0;
    } else {
      u.voice=mentorVoice; u.pitch=1.12; u.rate=0.88; u.volume=0.92;
    }
    return u;
  }

  function speakUtterance(u){
    if(!enabled||!u) return;
    synth.cancel();
    const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent);
    let _iosKA=null;
    if(isIOS){ _iosKA=setInterval(()=>{ if(synth.speaking&&synth.paused) synth.resume(); },200); }
    u.onerror = (e)=>{ if(e.error!=='interrupted'&&e.error!=='canceled'&&e.error!=='not-allowed') console.warn('[TTS] error:', e.error); };
    u.onend = ()=>{ clearInterval(_iosKA); };
    setTimeout(()=>{ synth.speak(u); }, 50);
  }

  let _isPlaying = false;
  let _pendingQueue = [];

  function speak(text, role){
    if (!enabled || !text) return Promise.resolve();
    const play = () => {
      _isPlaying = true;
      return callMiniMax(text, role).then(buf => {
        if (buf) return playAudioBuffer(buf);
        else return _webSpeakSimple(text, role);
      }).finally(() => {
        _isPlaying = false;
        if (_pendingQueue.length) {
          const next = _pendingQueue.shift();
          speak(next.text, next.role).then(next.resolve).catch(next.reject);
        }
      });
    };
    if (_isPlaying) {
      return new Promise((resolve, reject) => {
        _pendingQueue.push({ text, role, resolve, reject });
      });
    } else {
      return play();
    }
  }

  function _webSpeakSimple(text, role){
    return new Promise((resolve) => {
      if(!voices.length) loadVoices();
      synth.cancel();
      const u = createUtterance(text, role);
      u.onend = () => resolve();
      u.onerror = () => resolve();
      setTimeout(()=>synth.speak(u), 80);
    });
  }

  return { speak, stop, setEnabled, createUtterance, speakUtterance,
    callMiniMax, playAudioBuffer, roleForMode,
    get voices(){ return voices; },
    get challVoice(){ return challVoice; },
    get mentorVoice(){ return mentorVoice; }
  };
})();

/* ── VN TEXTBOX CONTROLLER (支持 scriptVisible) ── */
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

  // 字幕显示控制
  if (S.scriptVisible === false) {
    // 只播放语音，不显示文字
    return TTS.speak(text, ttsRole).then(() => {
      setTimeout(resolve, readPause);
    });
  }

  // 正常模式：打字 + 语音
  return new Promise(resolve => {
    TTS.stop();
    _typeText(text, null);
    TTS.speak(text, ttsRole).then(() => {
      revealAllText(text);
      setTimeout(resolve, readPause);
    }).catch(() => {
      clearTimeout(_typeTimer);
      const utt = TTS.createUtterance(text, ttsRole);
      utt.onend = () => { clearTimeout(_typeTimer); revealAllText(text); setTimeout(resolve, readPause); };
      utt.onerror = () => { clearTimeout(_typeTimer); revealAllText(text); setTimeout(resolve, readPause); };
      _typeText(text, utt);
      TTS.speakUtterance(utt);
    });
  });
}

function showChallBubble(text){ return showVNTextbox(text,'chall'); }
function hideChallBubble()    { hideVNTextbox(); }
function showMentorBubble(text){ return showVNTextbox(text,'mentor'); }
function hideMentorBubble()   { hideVNTextbox(); }
function showMentorHint(text, label){ return showVNTextbox(text,'hint',label); }
function hideMentorHint()     { hideVNTextbox(); }

/* ── API LAYER (保持不变) ── */
async function callArtifactProxy(messages, systemPrompt, maxTok){
  try{
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTok||250, system: systemPrompt, messages: messages.filter(m=>m.role!=='system') })
    });
    if(!res.ok) return null;
    const d = await res.json();
    return d.content?.[0]?.text?.trim() || null;
  }catch(e){ console.warn('[Proxy]',e.message); return null; }
}
async function callAPI(messages, systemPrompt, maxTok=250){
  if(!S.apiKey) return callArtifactProxy(messages, systemPrompt, maxTok);
  const cfg=CFG.providers[S.provider];
  const fetchWithTimeout = (url, opts, ms) => new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(url, opts).then(r => { clearTimeout(tid); resolve(r); }).catch(e => { clearTimeout(tid); reject(e); });
  });
  try{
    const hdrs={'Content-Type':'application/json'};
    let body;
    if(S.provider==='anthropic'){
      hdrs['x-api-key']=S.apiKey;
      hdrs['anthropic-version']='2023-06-01';
      hdrs['anthropic-dangerous-direct-browser-access']='true';
      body={model:cfg.model,max_tokens:maxTok,system:systemPrompt, messages:messages.filter(m=>m.role!=='system')};
    }else{
      hdrs['Authorization']=`Bearer ${S.apiKey}`;
      body={model:cfg.model,max_tokens:maxTok,temperature:0.78, messages:[{role:'system',content:systemPrompt},...messages.filter(m=>m.role!=='system')]};
    }
    const res=await fetchWithTimeout(cfg.url,{method:'POST',headers:hdrs,body:JSON.stringify(body)},CFG.API_TIMEOUT_MS);
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`HTTP ${res.status}`);}
    const d=await res.json();
    return(S.provider==='anthropic'?d.content?.[0]?.text:d.choices?.[0]?.message?.content)?.trim()||null;
  }catch(e){ if(e.message==='timeout')console.warn('[API] timeout');else console.error('[API]',e.message); return null; }
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

/* ── DAILY GREETING (保持不变) ── */
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

/* ── PREP (保持不变) ── */
async function runPrep(){ /* 同原代码 */ }

/* ── ARENA LAUNCH (增强 scriptVisible 控制) ── */
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

function setupScenarioCharacters(){ /* 同原代码 */ }

const DEBATE_MOTIONS = [ /* 同原代码 */ ];
const DEBATE_FB = { /* 同原代码 */ };

async function runDebate(openingNote){ /* 同原代码 */ }
async function processDebateAnswer(userText){ /* 同原代码，但确保 showChallBubble 前有 await */ }
const ST_TOPICS = [ /* 同原代码 */ ];
const ST_STARTERS = [ /* 同原代码 */ ];
async function runSmallTalk(openingNote){ /* 同原代码 */ }
function injectSTTopic(topic){ /* 同原代码 */ }
async function processSmallTalkAnswer(userText){ /* 同原代码，确保 await */ }

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

  // 初始化 script 控制
  const scriptToggle = $('#scriptToggleBtn');
  if (S.intensity === 'gentle') {
    S.scriptVisible = true;
    if (scriptToggle) scriptToggle.style.display = 'none';
  } else if (S.intensity === 'hardcore') {
    S.scriptVisible = false;
    if (scriptToggle) scriptToggle.style.display = 'none';
    const scriptArea = $('#scriptArea');
    if (scriptArea) scriptArea.style.display = 'none';
  } else {
    S.scriptVisible = true;
    if (scriptToggle) {
      scriptToggle.style.display = 'inline-block';
      scriptToggle.textContent = '📜 Script: ON';
      scriptToggle.onclick = () => {
        S.scriptVisible = !S.scriptVisible;
        scriptToggle.textContent = S.scriptVisible ? '📜 Script: ON' : '📜 Script: OFF';
        const scriptArea = $('#scriptArea');
        if (scriptArea) scriptArea.style.display = S.scriptVisible ? 'block' : 'none';
      };
    }
  }

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

async function phaseMentorIntro(openingNote){ /* 同原代码 */ }
async function phaseInterviewerIn(openingNote){ /* 同原代码 */ }
async function phaseAskQuestion(idx){ /* 同原代码 */ }

/* 语音识别初始化 (同原代码) */
function initRec(){ /* 同原代码 */ }
function startVoice(){ /* 同原代码 */ }
function stopVoice(forced=false){ /* 同原代码 */ }

$('bigMicBtn').addEventListener('click',()=>{ /* 同原代码 */ });
$('skipBtn').addEventListener('click',()=>{ /* 同原代码 */ });

async function processAnswer(userText, forced){ /* 同原代码，但需确保 showChallBubble 前有 await */ }
async function phaseMentorCoach(text,type){ /* 同原代码 */ }
async function phaseMentorPraise(text){ /* 同原代码 */ }
async function phaseEnd(){ /* 同原代码 */ }
$('endBtn').addEventListener('click',()=>{ /* 同原代码 */ });

/* ── FEEDBACK GENERATION (修复打分系统) ── */
async function generateFeedback(){
  showScreen('feedbackScreen');
  showLoad('Generating your detailed analysis…');

  const position=S.scenario==='debate'?'Debate Session':S.scenario==='smalltalk'?'Small Talk':(S.position||'Interview Session');
  const modeLabel=S.scenario==='debate'?'Debate':S.scenario==='smalltalk'?'Conversation':({gentle:'Gentle',medium:'Realistic',hardcore:'Hardcore'}[S.intensity]||'');
  const countLabel=S.scenario==='debate'?S.qLog.length+' rounds':S.scenario==='smalltalk'?S.qLog.length+' turns':S.questions.length+' questions';
  const fbSub=$('fbSub');
  if(fbSub) fbSub.textContent=position+' · '+countLabel+' · '+modeLabel+' Mode';

  const summaryLabel = S.scenario === 'debate' ? 'Round' : 'Q';
  let sessionSummary = 'No recorded exchanges.';
  if (S.qLog && S.qLog.length > 0) {
    sessionSummary = S.qLog.map((l, i) => {
      const questionText = l.question || '(No question recorded)';
      const lastAnswer = (l.userAnswers && l.userAnswers.length) ? l.userAnswers[l.userAnswers.length - 1] : '(no answer)';
      const evalNote = l.evalNotes || '';
      return `${summaryLabel}${i+1}: ${questionText}\n  Answer: "${lastAnswer}"\n  Notes: ${evalNote}`;
    }).join('\n\n');
  }
  console.log('[DEBUG] Session summary:', sessionSummary);

  const scenarioContext = S.scenario==='debate'
    ? 'debate coach (assess argument, evidence, rebuttal, vocabulary, fluency, confidence)'
    : S.scenario==='smalltalk'
    ? 'conversational English coach (assess naturalness, question-asking, warmth, vocabulary, fluency, listening)'
    : 'interview coach (assess grammar, fluency, vocabulary, content, strategy, confidence)';

  const detailSys=`You are an expert English ${scenarioContext} conducting a POST-SESSION analysis.
Candidate Profile:\n${buildProfile()}
Full Session:\n${sessionSummary}
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
    try{
      const cleaned = rJ.value.replace(/```json|```/g,'').trim();
      const parsed = JSON.parse(cleaned);
      data={...data,...parsed};
    }catch(e){ console.error('[Feedback parse]', e); }
  }
  // 确保 dims 有默认值
  const defaultDims = {
    grammar: { score: 0, note: 'Not enough data' },
    fluency: { score: 0, note: 'Not enough data' },
    vocabulary: { score: 0, note: 'Not enough data' },
    content: { score: 0, note: 'Not enough data' },
    strategy: { score: 0, note: 'Not enough data' },
    confidence: { score: 0, note: 'Not enough data' },
  };
  data.dims = { ...defaultDims, ...(data.dims || {}) };
  S.feedbackData = data;
  S.advancedPhrases = data.advanced_phrases || [];

  /* 显示维度分数等 (同原代码) */
  const SCENARIO_DIMS={ /* 同原代码 */ };
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
  // 其余反馈显示 (issues, vocab_upgrades, phrases) 同原代码，省略重复

  // ────────── 生成高级练习 (优化表达 + 造句/汉译英) ──────────
  const errorsForPractice = [];
  if (data.issues && data.issues.length) {
    for (const issue of data.issues.slice(0, 5)) {
      errorsForPractice.push({
        original: issue.problem,
        correction: issue.fix,
        type: issue.type,
        tip: `Try to use: ${issue.fix}`
      });
    }
  } else {
    // fallback
    errorsForPractice.push({ original: "repetitive phrasing", correction: "vary your sentence structure", type: "vocabulary", tip: "Use different transition words" });
  }
  S.practiceErrors = errorsForPractice;

  // 生成更优表达练习
  await generateEnhancedExercises();

  const epBtn = document.getElementById('errorPracticeBtn');
  if (epBtn) epBtn.style.display = (S.practiceErrors.length > 0) ? 'inline-flex' : 'none';
}

/* ── 增强练习生成 (更优表达 + 造句/汉译英) ── */
let currentPracticeSet = null;
let currentPracticeIndex = 0;
let practiceAnswers = [];
let practiceHarderLevel = 0;

async function generateEnhancedExercises() {
  if (!S.practiceErrors.length) return;
  const system = `You are an expert English coach. Based on the candidate's errors, create 3-5 exercises.
Each exercise must:
- Provide an "optimized_expression" (a natural, improved version of what the candidate tried to say).
- Ask the user to create their OWN sentences or do Chinese-to-English translation using that optimized expression. DO NOT use fill-in-the-blank or English-to-Chinese.
- Provide a "sample_answer" (one correct example sentence using the expression).
Output JSON array: [{"optimized_expression": "...", "prompt": "Use this expression to write a sentence about your work experience.", "sample_answer": "..."}, ...]
Keep the language clear and encouraging.`;
  const userPrompt = `Errors: ${S.practiceErrors.map(e => e.original).join('; ')}\nCorrections: ${S.practiceErrors.map(e => e.correction).join('; ')}`;
  const res = await callAPI([{ role: 'user', content: userPrompt }], system, 800);
  if (!res) {
    // fallback
    currentPracticeSet = S.practiceErrors.map(err => ({
      optimized_expression: err.correction,
      prompt: `Create a sentence using the expression "${err.correction}".`,
      sample_answer: `Example: ${err.correction}`
    }));
  } else {
    try {
      let cleaned = res.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
      const data = JSON.parse(cleaned);
      if (Array.isArray(data) && data.length) currentPracticeSet = data;
      else throw new Error('Invalid format');
    } catch(e) {
      console.warn('[EnhancedExercises]', e);
      currentPracticeSet = S.practiceErrors.map(err => ({
        optimized_expression: err.correction,
        prompt: `Translate into English: 使用 "${err.correction}" 造一个句子。`,
        sample_answer: `Example: ${err.correction}`
      }));
    }
  }
}

async function generateHarderExercise() {
  if (!S.practiceErrors.length) return null;
  const system = `You are an advanced English coach. Generate 2-3 HARDER exercises based on previous errors. The exercises must require users to create complex sentences (e.g., using subordinate clauses, advanced vocabulary, or idiomatic expressions). Output JSON array same format as before.`;
  const userPrompt = `Original errors: ${S.practiceErrors.map(e => e.original).join('; ')}\nCurrent difficulty level: ${practiceHarderLevel+1}`;
  const res = await callAPI([{ role: 'user', content: userPrompt }], system, 800);
  if (!res) return null;
  try {
    let cleaned = res.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    return JSON.parse(cleaned);
  } catch(e) { return null; }
}

/* ── 纠错练习屏控制器 (增强版) ── */
function startErrorPractice() {
  if (!currentPracticeSet || currentPracticeSet.length === 0) {
    alert('No exercises generated yet. Please complete a session first.');
    return;
  }
  currentPracticeIndex = 0;
  practiceAnswers = [];
  practiceHarderLevel = 0;
  showScreen('errorPracticeScreen');
  const mentorImg = document.getElementById('epMentorSprite');
  if (mentorImg) mentorImg.src = MENTOR_EXPR.greet_smile;
  if (S.epRecognition) {
    try { S.epRecognition.abort(); } catch(e) {}
  }
  S.epRecognition = initEpRecognition();
  showPracticeItem(0);
}

function showPracticeItem(idx) {
  if (idx >= currentPracticeSet.length) {
    showPracticeSummary();
    return;
  }
  const item = currentPracticeSet[idx];
  const container = $('#epCard');
  if (!container) return;
  container.innerHTML = `
    <div class="optimized-expr">✨ ${esc(item.optimized_expression)}</div>
    <div class="prompt">📝 ${esc(item.prompt)}</div>
    <div class="sample-answer" style="display:none; margin-top:12px; background:#f0f0f0; padding:8px; border-radius:6px;">
      💡 Example: ${esc(item.sample_answer)}
    </div>
    <button id="revealSampleBtn" class="secondary-btn" style="margin-top:8px;">Show example</button>
  `;
  const answerDisplay = $('#epAnswerDisplay');
  if (answerDisplay) answerDisplay.innerHTML = practiceAnswers[idx] || '';
  const nextBtn = $('#epNextBtn');
  if (nextBtn) nextBtn.style.display = 'none';
  const progress = $('#epProgress');
  if (progress) progress.textContent = `${idx+1} / ${currentPracticeSet.length}`;
  const mentorText = $('#epMentorText');
  if (mentorText) mentorText.innerHTML = 'Read the expression above, then tap the mic to create your own sentence.';

  // 显示示例按钮
  const revealBtn = $('#revealSampleBtn');
  if (revealBtn) {
    revealBtn.onclick = () => {
      const sampleDiv = container.querySelector('.sample-answer');
      if (sampleDiv) sampleDiv.style.display = 'block';
      revealBtn.disabled = true;
    };
  }
}

async function showPracticeSummary() {
  const container = $('#epCard');
  const nextBtn = $('#epNextBtn');
  const harderBtn = $('#epHarderBtn');
  const mentorText = $('#epMentorText');
  const answerDisplay = $('#epAnswerDisplay');
  
  let summaryHtml = '<h3>📚 Practice Summary</h3><ul>';
  for (let i = 0; i < currentPracticeSet.length; i++) {
    const ex = currentPracticeSet[i];
    const userAns = practiceAnswers[i] || '(not answered)';
    summaryHtml += `<li><strong>${esc(ex.optimized_expression)}</strong><br>
                     Your answer: ${esc(userAns)}<br>
                     <span style="color:var(--green);">Suggested: ${esc(ex.sample_answer)}</span></li>`;
  }
  summaryHtml += '</ul><p>✅ Great effort! Review the suggestions above.</p>';
  container.innerHTML = summaryHtml;
  if (answerDisplay) answerDisplay.style.display = 'none';
  if (mentorText) mentorText.innerHTML = 'You completed all exercises! Click "Harder Practice" for more challenging questions.';
  if (nextBtn) nextBtn.style.display = 'none';
  
  // 存储到个人题库
  const timestamp = Date.now();
  for (let i = 0; i < currentPracticeSet.length; i++) {
    S.userPracticeHistory.unshift({
      optimized: currentPracticeSet[i].optimized_expression,
      exercisePrompt: currentPracticeSet[i].prompt,
      userAnswer: practiceAnswers[i] || '',
      sampleAnswer: currentPracticeSet[i].sample_answer,
      timestamp: timestamp,
      harderLevel: practiceHarderLevel
    });
  }
  savePracticeHistory();
  
  // 显示二次练习按钮
  if (!harderBtn) {
    const btn = document.createElement('button');
    btn.id = 'epHarderBtn';
    btn.className = 'ep-harder-btn';
    btn.textContent = '🔥 Harder Practice';
    btn.onclick = async () => {
      const harderSet = await generateHarderExercise();
      if (harderSet && harderSet.length) {
        currentPracticeSet = harderSet;
        currentPracticeIndex = 0;
        practiceAnswers = [];
        practiceHarderLevel++;
        showPracticeItem(0);
      } else {
        alert('Could not generate harder questions. Please try again later.');
      }
    };
    const dock = document.querySelector('.ep-mic-dock');
    if (dock) dock.appendChild(btn);
  } else {
    harderBtn.style.display = 'inline-block';
  }
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
    const answerDisplay = $('#epAnswerDisplay');
    if (answerDisplay) answerDisplay.innerHTML = final;
  };
  r.onerror = (e) => {
    console.warn('[EP Rec]', e.error);
    const micStatus = $('#epMicStatus');
    if (micStatus) micStatus.innerHTML = 'Mic error, try again';
    const micBtn = $('#epMicBtn');
    if (micBtn) micBtn.classList.remove('recording');
  };
  r.onend = () => {
    const micBtn = $('#epMicBtn');
    if (micBtn) micBtn.classList.remove('recording');
    if (S.epCurrentAnswer && S.epCurrentAnswer.trim().length > 3) {
      const micStatus = $('#epMicStatus');
      if (micStatus) micStatus.innerHTML = '✔ Recorded';
      // 保存答案
      practiceAnswers[currentPracticeIndex] = S.epCurrentAnswer;
      const nextBtn = $('#epNextBtn');
      if (nextBtn) nextBtn.style.display = 'inline-flex';
      const mentorText = $('#epMentorText');
      if (mentorText) mentorText.innerHTML = 'Great! Click "Next" to continue.';
    } else {
      const micStatus = $('#epMicStatus');
      if (micStatus) micStatus.innerHTML = 'Tap to speak again';
    }
  };
  return r;
}

function startEpRecording() {
  if (!S.epRecognition) {
    alert('Browser does not support voice input.');
    return;
  }
  const micBtn = $('#epMicBtn');
  if (micBtn && micBtn.classList.contains('recording')) {
    try { S.epRecognition.stop(); } catch(e) {}
    return;
  }
  S.epCurrentAnswer = '';
  const answerDisplay = $('#epAnswerDisplay');
  if (answerDisplay) answerDisplay.innerHTML = '';
  const micStatus = $('#epMicStatus');
  if (micStatus) micStatus.innerHTML = 'Listening...';
  if (micBtn) micBtn.classList.add('recording');
  try { S.epRecognition.start(); } catch(e) { console.warn(e); }
}

function nextPracticeItem() {
  currentPracticeIndex++;
  showPracticeItem(currentPracticeIndex);
}

function finishErrorPractice() {
  showScreen('feedbackScreen');
  if (S.epRecognition) {
    try { S.epRecognition.abort(); } catch(e) {}
  }
}

function showMyPracticeBank() {
  if (!S.userPracticeHistory.length) {
    alert('No practice records yet. Complete some exercises first!');
    return;
  }
  let html = '<h3>📖 My Practice Bank</h3><ul>';
  S.userPracticeHistory.slice(0, 20).forEach(item => {
    html += `<li><strong>${esc(item.optimized)}</strong><br>
             Your sentence: ${esc(item.userAnswer)}<br>
             <span class="sample">💡 ${esc(item.sampleAnswer)}</span></li>`;
  });
  html += '</ul><button onclick="showScreen(\'feedbackScreen\')">Back</button>';
  const container = $('#epCard');
  if (container) {
    container.innerHTML = html;
    showScreen('errorPracticeScreen');
  }
}

function bindErrorPracticeEvents() {
  const epMic = $('#epMicBtn');
  if (epMic) epMic.addEventListener('click', startEpRecording);
  const epNext = $('#epNextBtn');
  if (epNext) epNext.addEventListener('click', nextPracticeItem);
  const epDone = $('#epDoneBtn');
  if (epDone) epDone.addEventListener('click', finishErrorPractice);
  const errorBtn = $('#errorPracticeBtn');
  if (errorBtn) errorBtn.addEventListener('click', startErrorPractice);
  const bankBtn = $('#viewMyBankBtn');
  if (bankBtn) bankBtn.addEventListener('click', showMyPracticeBank);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindErrorPracticeEvents);
} else {
  bindErrorPracticeEvents();
}

console.log('🎭 Mirror & Mentor v5 — Complete (Enhanced Practice + Script Control)');
