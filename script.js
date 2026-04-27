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

const CFG={
  API_TIMEOUT_MS:12000,
  MAX_RETRIES:1,
  DEBATE_ROUNDS:10,
  ST_TURNS:99999,
  minimax:{
    model: 'speech-02-turbo',
    endpoint: 'https://api.minimax.io/v1/t2a_v2',
    voices:{
      challenger: { id:'English_magnetic_voiced_man', speed:1.2, vol:1.0, pitch:0,  emotion:'neutral' },
      mentor:     { id:'English_radiant_girl',        speed:1.25, vol:1.0, pitch:0,  emotion:'happy'   },
      debater:    { id:'English_Debator',             speed:1.25, vol:1.0, pitch:0,  emotion:'happy'   },
      listener:   { id:'English_CalmWoman',           speed:1.15, vol:1.0, pitch:-1, emotion:'neutral' },
      friendly:   { id:'English_radiant_girl',        speed:1.2, vol:1.0, pitch:0,  emotion:'happy'   },
    }
  },
  providers:{
    anthropic:{url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-20250514'},
    deepseek: {url:'https://api.deepseek.com/chat/completions',model:'deepseek-chat'},
  },
  voice:{
    maxDur:  {gentle:90000,medium:75000,hardcore:60000},
    silenceDly: 2200,
    silenceConfirm: 2000,
    minWords:   5,
    hcCutoffChance: 0.15,
    hcCutoffMin:20000, hcCutoffMax:38000,
  },
};

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
  silTimer:null, silConfirmTimer:null, maxTimer:null, hcCutTimer:null,
  lastInterimLen:0,
  _afterFollowUp:null,
  debateTopic:'', debateStance:'for',
  _stTurn:0, _stHistory:[], _stQuestionCount:0, _stShortStreak:0,
  _stTopicsSeen:[], _stTurnsSinceTopic:0, _stBestMoments:[], _stCurrentTopic:'',
  _stGameWords:[], _stGameActive:false,
  stageW:0, stageH:0,
  feedbackData:null, advancedPhrases:[],
  wpIndex:0, wpRec:null, wpTranscript:'',
  srsWords:[],
  practiceErrors: [],
  practiceIndex: 0,
  epRecognition: null,
  epCurrentAnswer: '',
  epRetryCount: 0,
  epWaitingForRetry: false,
  epCurrentExpected: '',
  myQuestionBank: [],
  scriptEnabled: true,
  isGeneratingExercises: false,
};

let recognition = null;

const PROF_KEY='mm_v5_profile';
const SRS_KEY ='mm_v5_srs';
const BANK_KEY ='mm_v5_bank';

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
function saveBank(bank){
  try{localStorage.setItem(BANK_KEY,JSON.stringify(bank));}catch{}
}
function loadBank(){
  try{return JSON.parse(localStorage.getItem(BANK_KEY)||'[]');}catch{return [];}
}

function openExpressionBank(){
  var bank=loadBank();
  if(!bank.length){
    alert('No expressions saved yet. Complete an interview session first and the AI will collect phrases for you to practise here.');
    return;
  }
  S.practiceErrors=[...bank];
  S.practiceErrors.forEach(function(e){e.retryCount=0;e.attempts=[];});
  S.practiceIndex=0;
  S.epRetryCount=0;
  S.epWaitingForRetry=false;
  S.epCurrentExpected='';
  showScreen('errorPracticeScreen');
  var mentorImg=document.getElementById('epMentorSprite');
  if(mentorImg) mentorImg.src=MENTOR_EXPR.greet_smile;
  if(S.epRecognition){try{S.epRecognition.abort();}catch(e){}}
  S.epRecognition=initEpRecognition();
  loadPracticeItem(0);
}

function refreshHubBankCount(){
  var bank=loadBank();
  var chip=document.getElementById('bankCountChip');
  var hint=document.getElementById('hubHint');
  if(chip) chip.textContent=bank.length+(bank.length===1?' expression saved':' expressions saved');
  if(hint){
    if(bank.length>0){ hint.style.display='block'; hint.classList.add('show'); }
    else { hint.style.display='none'; hint.classList.remove('show'); }
  }
}

(()=>{try{S.srsWords=JSON.parse(localStorage.getItem(SRS_KEY)||'[]');}catch{}})();
(()=>{try{S.myQuestionBank = loadBank();}catch{}})();
(()=>{ try{ const k=localStorage.getItem('mm_apikey')||''; if(k) S.apiKey=k; }catch{} })();
(()=>{ try{ const k=localStorage.getItem('mm_minimaxkey')||''; if(k) S.minimaxKey=k; }catch{} })();

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toggleApiKey(){
  const exp=$('apiKeyExpanded'), col=$('apiKeyCollapsed');
  if(!exp||!col) return;
  if(exp.style.display==='none'){ exp.style.display='block'; col.style.display='none'; }
  else { exp.style.display='none'; col.style.display='block'; }
}
function toggleApiKeyD(){
  const exp=$('apiKeyExpandedD'), col=$('apiKeyCollapsedD');
  if(!exp||!col) return;
  if(exp.style.display==='none'){ exp.style.display='block'; col.style.display='none'; }
  else { exp.style.display='none'; col.style.display='block'; }
}
function showScreen(id){
  ['hubScreen','intakeScreen','prepScreen','arenaScreen','feedbackScreen','wordPracticeScreen','errorPracticeScreen','bankScreen']
    .forEach(s=>$(s)?.classList.remove('active'));
  $(id).classList.add('active');
  TTS.stop();
  if(id !== 'arenaScreen') hideVNTextbox();
  if(id==='hubScreen') refreshHubBankCount();
}
function showLoad(m){$('loadingMsg').textContent=m||'Thinking…';$('loadingVeil').classList.add('show');}
function hideLoad(){$('loadingVeil').classList.remove('show');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function stageSize(){
  const panel=$('leftPanel')||$('stage');
  if(!panel) return {w:window.innerWidth,h:window.innerHeight};
  return {w:panel.offsetWidth||window.innerWidth, h:panel.offsetHeight||window.innerHeight};
}
function isMobile(){ return window.innerWidth <= 600; }
function isLandscape(){ return window.innerWidth > window.innerHeight; }

function posInterviewers(difficulty){
  const {w} = stageSize();
  const mob = isMobile();
  const cW  = mob ? Math.min(w*0.85, 340) : Math.min(480, w*0.70);
  const fW  = mob ? Math.min(w*0.65, 260) : Math.min(380, w*0.55);

  if(S.intensity === 'gentle' || difficulty === 'gentleOnly'){
    posChar('friendlyChar', {left:(w-fW)/2, width:fW, opacity:1});
    posChar('challChar',    {left:w+cW+80,  width:cW, opacity:0});
  } else if(difficulty === 'hard'){
    const mob2 = isMobile();
    posChar('challChar',    {left:(w-cW)/2, width:cW, opacity:1});
    const fLeft = mob2 ? -fW*0.4 : w*0.02;
    posChar('friendlyChar', {left:fLeft,    width:fW, opacity:0.35});
  } else {
    posChar('friendlyChar', {left:(w-fW)/2, width:fW, opacity:1});
    posChar('challChar',    {left:w+cW+80,  width:cW, opacity:0});
  }
}

function posChar(id,cfg){
  const el=$(id);
  if(!el) return;
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

window._mmCorsBlocked = false;

/* ── TTS 模块 (语速稍快) ── */
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
    let apiUrl;
    let headers;
    if (!isLocal) {
      apiUrl = '/api/minimax';
      headers = { 'Content-Type': 'application/json' };
    } else {
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
      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        return null;
      }
      if (!res.ok) return null;
      if (data?.base_resp?.status_code !== 0 && data?.base_resp?.status_code !== undefined) return null;
      const hexAudio = data?.data?.audio || data?.audio_file;
      if (!hexAudio) return null;
      const cleanHex = hexAudio.replace(/\s/g, '');
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
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
    } catch (e) {
      return null;
    }
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

  function stopMiniMax(){
    if(_currentSource){ try{ _currentSource.stop(); }catch{} _currentSource=null; }
  }

  function stop(){
    stopMiniMax();
    synth.cancel();
  }

  function setEnabled(v){ enabled=v; if(!v) stop(); }

  function createUtterance(text, role){
    const u = new SpeechSynthesisUtterance(text);
    if(role==='challenger'||role==='debater'){
      u.voice=challVoice; u.pitch=0.85; u.rate=0.92; u.volume=1.0;
    } else {
      u.voice=mentorVoice; u.pitch=1.15; u.rate=0.94; u.volume=0.92;
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
        if (buf) {
          return playAudioBuffer(buf);
        } else {
          return _webSpeakSimple(text, role);
        }
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

function showVNTextbox(text, mode, label, autoHide=true){
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

  return new Promise(resolve => {
    TTS.stop();
    _typeText(text, null);
    TTS.speak(text, ttsRole).then(() => {
      revealAllText(text);
      if(autoHide){
        setTimeout(() => { hideVNTextbox(); resolve(); }, readPause);
      } else {
        resolve();
      }
    }).catch(() => {
      clearTimeout(_typeTimer);
      const utt = TTS.createUtterance(text, ttsRole);
      utt.onend = () => {
        clearTimeout(_typeTimer);
        revealAllText(text);
        if(autoHide){
          setTimeout(() => { hideVNTextbox(); resolve(); }, readPause);
        } else {
          resolve();
        }
      };
      utt.onerror = () => {
        clearTimeout(_typeTimer);
        revealAllText(text);
        if(autoHide){
          setTimeout(() => { hideVNTextbox(); resolve(); }, readPause);
        } else {
          resolve();
        }
      };
      _typeText(text, utt);
      TTS.speakUtterance(utt);
    });
  });
}

function showVNTextboxKeep(text, mode, label){
  return showVNTextbox(text, mode, label, false);
}

function showChallBubble(text, autoHide=true){ return showVNTextbox(text,'chall',null,autoHide); }
function hideChallBubble()    { hideVNTextbox(); }
function showMentorBubble(text, autoHide=true){ return showVNTextbox(text,'mentor',null,autoHide); }
function hideMentorBubble()   { hideVNTextbox(); }
function showMentorHint(text, label, autoHide=true){ return showVNTextbox(text,'hint',label,autoHide); }
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
  coach:["Use the STAR method: Situation → Task → Action → Result. One specific story.","Start with a concrete detail — a number, a date, a name. It makes everything real.","Don't just say what you did — say what changed because of what you did.","Try opening with: 'One specific example that comes to mind is…'"],
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
  refreshHubBankCount();
  
  initScriptToggle();
});

function initScriptToggle(){
  const btn = document.getElementById('scriptToggleBtn');
  if(!btn) return;
  if(S.intensity === 'gentle'){
    S.scriptEnabled = true;
    btn.textContent = '📜 Script: ON';
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';
    showScriptArea(true);
  } else if(S.intensity === 'hardcore'){
    S.scriptEnabled = false;
    btn.textContent = '📜 Script: OFF';
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';
    showScriptArea(false);
  } else {
    S.scriptEnabled = true;
    btn.textContent = '📜 Script: ON';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    showScriptArea(true);
    btn.onclick = ()=>{
      S.scriptEnabled = !S.scriptEnabled;
      btn.textContent = S.scriptEnabled ? '📜 Script: ON' : '📜 Script: OFF';
      showScriptArea(S.scriptEnabled);
    };
  }
}

function showScriptArea(show){
  const scriptArea = document.getElementById('scriptArea');
  if(scriptArea){
    scriptArea.style.display = show ? 'block' : 'none';
  }
  const vntbText = document.getElementById('vntbText');
  if(vntbText){
    vntbText.style.display = show ? '' : 'none';
  }
}

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
    initScriptToggle();
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
  var parent=p.closest('#intPills,#debateIntPills')||p.parentElement;
  parent.querySelectorAll('.int-pill').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.intensity=p.dataset.int;
  initScriptToggle();
}));
document.querySelectorAll('.tog-opt').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.tog-opt').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.mentorMode=p.dataset.mode;
}));
document.querySelectorAll('.prov-pill').forEach(p=>p.addEventListener('click',()=>{
  document.querySelectorAll('.prov-pill').forEach(x=>x.classList.remove('on'));
  p.classList.add('on'); S.provider=p.dataset.provider;
}));
var _rf=$('resumeFile'); if(_rf) _rf.addEventListener('change',async e=>{
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
  var fk1=($('fiApiKey')||{value:''}).value.trim();
  var fk2=($('fiApiKeyD')||{value:''}).value.trim();
  S.apiKey=fk1||fk2||localStorage.getItem('mm_apikey')||'';
  var mk1=($('fiMinimaxKey')||{value:''}).value.trim();
  var mk2=($('fiMinimaxKeyD')||{value:''}).value.trim();
  S.minimaxKey=mk1||mk2||localStorage.getItem('mm_minimaxkey')||'';
  if(S.minimaxKey) try{localStorage.setItem('mm_minimaxkey',S.minimaxKey);}catch{}
  if(S.apiKey) try{localStorage.setItem('mm_apikey',S.apiKey);}catch{}
  if(S.scenario==='interview'){
    S.speciality=($('fiSpeciality')||{value:''}).value.trim();
    S.resumeText=($('fiResume')||{value:''}).value.trim();
    S.position=($('fiPosition')||{value:''}).value.trim();
    S.goal=($('fiGoal')||{value:''}).value.trim();
    S.company=($('fiCompany')||{value:''}).value.trim();
    if(!S.position){alert('Please enter the position you are interviewing for.');var fp=$('fiPosition');if(fp)fp.focus();return;}
  } else if(S.scenario==='debate'){
    var customVal=($('fiDebateCustom')||{value:''}).value.trim();
    if(customVal) S.debateTopic=customVal;
    if(!S.debateTopic||S.debateTopic==='Click to generate a motion'){
      S.debateTopic=DEBATE_MOTIONS[Math.floor(Math.random()*DEBATE_MOTIONS.length)];
    }
    var stanceR=document.querySelector('input[name="debateStance"]:checked');
    var sv=stanceR?stanceR.value:'for';
    S.debateStance=sv==='random'?(Math.random()>0.5?'for':'against'):sv;
    S.position=S.debateTopic;
  } else {
    S.position='Small Talk';
  }
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
  // Always ensure keys are loaded from storage before any session starts.
  // This is critical for smalltalk/debate which bypass the intake form entirely.
  if(!S.apiKey)    S.apiKey    = localStorage.getItem('mm_apikey')   ||'';
  if(!S.minimaxKey) S.minimaxKey = localStorage.getItem('mm_minimaxkey')||'';

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

  const qPrompt=`You are Arthur. An old-school, elite interviewer. You are polite but incredibly cold. You barely smile.Your goal is to find logical gaps in the user's speech. You scrutinize user's potential weaknesses and doubt their capability. You never talk much, but you hit the user's weakpoint wuth simple questions. Style: 1. Never use emojis. 2. Use phrases like 'I fail to see the connection...', 'That's a rather generic claim, care to specify?'. 3. If the user uses a basic word (like 'good' or 'happy'), ask them if they can find a more 'sophisticated' alternative.
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
  S.scenario=sc;
  if(sc==='smalltalk'){
    S.position='Small Talk';
    var arena2=document.getElementById('arenaScreen');
    if(arena2){arena2.classList.remove('scenario-interview','scenario-debate','scenario-smalltalk');arena2.classList.add('scenario-smalltalk');}
    showScreen('prepScreen');
    runPrep();
    return;
  }
  var titles={
    interview:{h:'The <em>Interview</em> Simulator',sub:'Tell us about yourself',btn:'Analyse &amp; Begin Interview'},
    debate:{h:'The <em>Debate</em> Arena',sub:'Set your motion and take a stand.',btn:'Enter the Debate Arena'},
  };
  var t=titles[sc]||titles.interview;
  var hEl=document.querySelector('.intake-h');
  var sEl=document.querySelector('.intake-sub');
  var bEl=document.getElementById('launchBtn');
  if(hEl) hEl.innerHTML=t.h;
  if(sEl) sEl.textContent=t.sub;
  if(bEl) bEl.innerHTML=t.btn;
  document.querySelectorAll('.interview-only').forEach(function(el){el.style.display=sc==='interview'?'':'none';});
  document.querySelectorAll('.debate-only').forEach(function(el){el.style.display=sc==='debate'?'':'none';});
  var arena=document.getElementById('arenaScreen');
  if(arena){arena.classList.remove('scenario-interview','scenario-debate','scenario-smalltalk');arena.classList.add('scenario-'+sc);}
  showScreen('intakeScreen');
  if(sc==='debate') setTimeout(generateDebateMotion,350);
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

var _usedMotions=[];
function generateDebateMotion(){
  var motionEl=document.getElementById('motionText');
  var btn=document.getElementById('motionRefreshBtn');
  if(!motionEl) return;
  if(btn){btn.classList.add('spinning');btn.disabled=true;}
  motionEl.style.opacity='0.4';
  motionEl.textContent='Generating...';
  var usedStr=_usedMotions.slice(-6).join('; ');
  var sys='Generate ONE fresh thought-provoking debate motion for English practice. It must be arguable both ways. Return ONLY the motion text as a single sentence, no quotes, no preamble.'+(usedStr?' Avoid repeating: '+usedStr:'');
  callAPI([{role:'user',content:'Give me a debate motion.'}],sys,60).then(function(raw){
    var motion=null;
    if(raw&&raw.trim().length>8) motion=raw.trim().replace(/^["']/,'').replace(/["']$/,'');
    if(!motion){
      var pool=DEBATE_MOTIONS.filter(function(m){return _usedMotions.indexOf(m)<0;});
      if(!pool.length) pool=DEBATE_MOTIONS;
      motion=pool[Math.floor(Math.random()*pool.length)];
    }
    _usedMotions.push(motion);
    S.debateTopic=motion;
    motionEl.textContent=motion;
    motionEl.style.opacity='1';
    var ci=document.getElementById('fiDebateCustom'); if(ci) ci.value='';
    if(btn){btn.classList.remove('spinning');btn.disabled=false;}
  }).catch(function(){
    var motion=DEBATE_MOTIONS[Math.floor(Math.random()*DEBATE_MOTIONS.length)];
    S.debateTopic=motion;
    motionEl.textContent=motion;
    motionEl.style.opacity='1';
    if(btn){btn.classList.remove('spinning');btn.disabled=false;}
  });
}
function syncDebateMotion(val){
  var motionEl=document.getElementById('motionText');
  if(val.trim()){S.debateTopic=val.trim();if(motionEl){motionEl.textContent=val.trim();motionEl.style.opacity='0.7';}}
  else{if(motionEl) motionEl.style.opacity='1';}
}

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
  var topic=(S.debateTopic&&S.debateTopic.trim()&&S.debateTopic!=='Click to generate a motion')
    ?S.debateTopic
    :DEBATE_MOTIONS[Math.floor(Math.random()*DEBATE_MOTIONS.length)];
  S._debateTopic=topic;
  S._debateRound=0;
  var sv=S.debateStance||'for';
  S._debateUserSide=sv==='random'?(Math.random()>0.5?'for':'against'):sv;

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
  await showChallBubble(openMsg, false);
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

  const debateSys = `You are Maxwell, a sharp and slightly infuriating young debater. You are brilliant but you know it, which makes you a little too confident sometimes.
YOUR METHOD:
Do not just disagree generically. Read what the user actually said and find the weakest point — the unsupported assumption, the overgeneralization, the thing they asserted without evidence. Attack that specifically. Quote their words back at them when useful.

ESCALATION: In early rounds, probe and test. From round 4 onwards, press harder on whatever the user has already conceded or failed to defend properly.

CONCEDE STRATEGICALLY: Occasionally grant a small point — "Fine, I will accept that — but notice what that actually implies..." — then use their concession to strengthen your position. This is more devastating than blanket disagreement.

STYLE:
- Open with a rhetorical question roughly half the time: "Is it not a little convenient that..." or "If that were true, how do you explain..."
- Be direct: "That is a weak argument because..." not "I would perhaps suggest that..."
- Occasionally make a claim bold enough that the user could reasonably push back. You are not always right. You are always confident.
- 2 to 3 sentences then one sharp question. Never monologue.
- No emojis. No warmth. Respect through intellectual pressure, not friendliness.

Motion: "${S._debateTopic}"
You are arguing ${S._debateUserSide==='for'?'AGAINST':'FOR'} the motion.
The user just said: "${userText}"
This is round ${round} of ${CFG.DEBATE_ROUNDS}.

Find the specific weakness in what they just said. Challenge it directly. Then ask them to defend it.
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
  await showChallBubble(counterArg, false);
  setTimeout(()=>setDebater('neutral'), 1800);

  document.getElementById('micStatus').textContent='Your response';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  S.voiceState='idle';
  S.phase='qa_listening';
}


const ST_STARTERS = [
  "What is something you have been thinking about lately -- any topic at all?",
  "Is there something on your mind that you have not had a chance to put into words yet?",
  "What is something you believe that most people around you would disagree with?",
  "Tell me about something that happened recently that made you think differently about something.",
];

async function runSmallTalk(openingNote){
  S.phase='idle';
  S._stTurn=0; S._stHistory=[]; S._stQuestionCount=0; S._stShortStreak=0;
  S._stTopicsSeen=[]; S._stTurnsSinceTopic=0; S._stBestMoments=[];
  S._stCurrentTopic=''; S._stGameWords=[]; S._stGameActive=false;
  S._stLevelEstimate='unknown'; S._stScoreHistory=[];

  document.getElementById('qPill').textContent='Turn 0 / inf';
  document.getElementById('statusPill').textContent='Chatting';
  document.getElementById('qBarFill').style.width='0%';

  var gamePanel=document.getElementById('stGamePanel');
  if(gamePanel) gamePanel.classList.add('show');

  setListener('idle');
  await sleep(300);
  posChar('challChar',{opacity:1});
  posChar('friendlyChar',{opacity:0});
  posChar('mentorChar',{opacity:0});
  document.getElementById('challChar').classList.add('breathing');
  await sleep(700);

  var opener=openingNote||ST_STARTERS[Math.floor(Math.random()*ST_STARTERS.length)];
  setListener('respond');
  await sleep(300);
  await showChallBubble(opener,false);
  setTimeout(function(){setListener('idle');},1800);

  document.getElementById('bigMicBtn').style.display='flex';
  document.getElementById('skipBtn').classList.add('show');
  document.getElementById('micStatus').textContent='Tap to chat';
  document.getElementById('micStatus').className='';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='';
  S.phase='qa_listening';
  S._isSmallTalk=true;
}

async function startWordStoryGame(){
  var btn=document.getElementById('wordGameBtn');
  if(btn){btn.disabled=true;btn.textContent='Generating...';}
  var gameWords=document.getElementById('stGameWords');
  if(gameWords){gameWords.classList.remove('show');gameWords.innerHTML='';}

  var wordSys='Generate exactly 5 diverse English words for a storytelling game. Mix nouns, verbs, adjectives. Some obvious, some surprising -- they should NOT obviously connect. Return ONLY a JSON array of 5 strings like ["word1","word2","word3","word4","word5"]';
  var words=null;
  var raw=await callAPI([{role:'user',content:'Give me 5 story words.'}],wordSys,60);
  if(raw){try{words=JSON.parse(raw.replace(/```json|```/g,'').trim());}catch{}}
  if(!words||words.length<5){
    var pool=['raccoon','mirror','jog','jelly','dance','telescope','whisper','concrete','bloom','itch','velvet','anchor','sneeze','lantern','wobble','mango','architect','drift','cactus','echo'];
    words=pool.sort(function(){return Math.random()-.5;}).slice(0,5);
  }
  S._stGameWords=words;
  S._stGameActive=true;

  if(gameWords){
    gameWords.innerHTML=words.map(function(w){return '<span class="st-word-chip" id="stword-'+w+'">'+w+'</span>';}).join('');
    gameWords.classList.add('show');
  }

  var intro='Okay, here is our game! I have five words for you: '+words.join(', ')+'. Your mission: tell me a story that uses all five words. It does not have to make perfect sense. Ready? Go!';
  S._stHistory.push({role:'assistant',content:intro});
  setListener('respond');
  await showChallBubble(intro,false);
  setTimeout(function(){setListener('idle');},1800);

  if(btn){btn.disabled=false;btn.textContent='New Words';}
  document.getElementById('micStatus').textContent='Tell your story!';
}

async function processSmallTalkAnswer(userText){
  S._stTurn=(S._stTurn||0)+1;
  S._stHistory=S._stHistory||[];
  S._stHistory.push({role:'user',content:userText});

  document.getElementById('bigMicBtn').style.display='none';
  document.getElementById('skipBtn').classList.remove('show');
  document.getElementById('micStatus').textContent='Maaya is listening...';
  document.getElementById('micStatus').className='active';
  if(document.getElementById('hearingDisplay')) document.getElementById('hearingDisplay').textContent='...';

  var turn=S._stTurn;
  document.getElementById('qPill').textContent='Turn '+turn+' / inf';
  document.getElementById('qBarFill').style.width=((turn%10)*10)+'%';

  S.qLog.push({
    question:(S._stCurrentTopic?'['+S._stCurrentTopic+'] ':'')+'Turn '+turn,
    dimension:'Conversational fluency', intent:'naturalness, question-asking, elaboration',
    userAnswers:[userText], finalScore:null, retries:0, evalNotes:''
  });

  // Async eval: track analytics + level estimation
  var evalSys='Analyse this English spoken response: "'+userText+'". Turn '+turn+'.\nReturn ONLY JSON: {"score":0-100,"quality":"good|ok|weak","asked_question":true|false,"topic":"1-3 word label","word_count_class":"long|medium|short","is_best_moment":true|false,"coach":"1 tip if weak else empty","grammar":"1 note if helpful else empty","vocab_level":"basic|intermediate|advanced"}';
  callAPI([{role:'user',content:userText}],evalSys,130).then(function(raw){
    if(!raw) return;
    try{
      var ev=JSON.parse(raw.replace(/```json|```/g,'').trim());
      var last=S.qLog[S.qLog.length-1]; if(last) last.finalScore=ev.score;
      if(ev.asked_question) S._stQuestionCount++;
      if(ev.word_count_class==='short') S._stShortStreak++; else S._stShortStreak=0;
      if(ev.topic&&ev.topic!==S._stCurrentTopic){
        S._stCurrentTopic=ev.topic;
        S._stTurnsSinceTopic=1;
        if(S._stTopicsSeen.indexOf(ev.topic)<0) S._stTopicsSeen.push(ev.topic);
      } else { S._stTurnsSinceTopic++; }
      if(ev.is_best_moment&&userText.trim().length>20) S._stBestMoments.push(userText.trim().slice(0,120));
      if(S._stGameActive&&S._stGameWords.length){
        S._stGameWords.forEach(function(w){
          if(userText.toLowerCase().indexOf(w.toLowerCase())>=0){
            var chip=document.getElementById('stword-'+w);
            if(chip) chip.classList.add('used');
          }
        });
      }
      // Level estimation from last 4 turns
      if(!S._stScoreHistory) S._stScoreHistory=[];
      S._stScoreHistory.push({score:ev.score||50, wc:ev.word_count_class||'medium', vocab:ev.vocab_level||'intermediate'});
      if(S._stScoreHistory.length>=3){
        var recent=S._stScoreHistory.slice(-4);
        var avgScore=recent.reduce(function(a,b){return a+b.score;},0)/recent.length;
        var shortCount=recent.filter(function(r){return r.wc==='short';}).length;
        var basicCount=recent.filter(function(r){return r.vocab==='basic';}).length;
        if(avgScore<45||shortCount>=3||basicCount>=3){ S._stLevelEstimate='low'; }
        else if(avgScore>72&&shortCount<=1&&basicCount<=1){ S._stLevelEstimate='high'; }
        else { S._stLevelEstimate='medium'; }
      }
    }catch{}
  }).catch(function(){});

  // Build Maaya's reply
  var histSlice=S._stHistory.slice(-12).map(function(m){return {role:m.role,content:m.content};});
  var sysOverride=null;
  if(S._stGameActive){
    var usedW=S._stGameWords.filter(function(w){return userText.toLowerCase().indexOf(w.toLowerCase())>=0;});
    var remW=S._stGameWords.filter(function(w){return userText.toLowerCase().indexOf(w.toLowerCase())<0;});
    if(remW.length===0){
      sysOverride=maayaSystemPrompt()+'\n\nThe user just finished their five-word story using all the words: '+S._stGameWords.join(', ')+'. React with genuine delight. Comment on something specific in their story. Offer to play again or move back to conversation.';
      S._stGameActive=false;
    } else {
      sysOverride=maayaSystemPrompt()+'\n\nGame context: user is telling a story using these words: '+S._stGameWords.join(', ')+'. Used so far: '+(usedW.join(', ')||'none')+'. Still remaining: '+remW.join(', ')+'. React to what they said so far and encourage them to continue using the remaining words.';
    }
  }

  var reply=await callAPI(histSlice,sysOverride||maayaSystemPrompt(),200);
  if(!reply){
    var fallbacks=[
      "That is interesting -- what is the main reason you feel that way?",
      "Hmm. Can you give me one specific example from your own life?",
      "What would someone who sees it differently say about that?",
      "You said that -- do you think that is always true, or only sometimes?",
      "What does that actually look like in practice, day to day?",
    ];
    reply=fallbacks[Math.floor(Math.random()*fallbacks.length)];
  }
  S._stHistory.push({role:'assistant',content:reply});

  var expr=Math.random()<0.25?'attentive':(Math.random()<0.5?'respond':'think');
  setListener(expr);
  await sleep(350);
  await showChallBubble(reply,false);
  setTimeout(function(){setListener('idle');},1600);

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
  S._afterFollowUp=null;
  var sr=$('stReport');if(sr)sr.classList.remove('show');
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
  if(dtc) dtc.classList.remove('show');
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
    await showChallBubble(greeting, false);
    setFriendly('calm');
  } else {
    setFriendly('calm_talk');
    await showChallBubble(greeting, false);
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
    await showChallBubble(q.q, false);
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
    await showChallBubble(q.q, false);
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

    if(interim.length>(S.lastInterimLen||0)) clearTimeout(S.silConfirmTimer);
    S.lastInterimLen=interim.length;
    if(S.finalBuf.trim()&&S.wordCount>=CFG.voice.minWords){
      clearTimeout(S.silTimer);
      S.silTimer=setTimeout(function(){
        S.silConfirmTimer=setTimeout(function(){stopVoice(false);},CFG.voice.silenceConfirm);
      },CFG.voice.silenceDly);
    }
  };

  r.onerror=e=>{
    if(e.error==='not-allowed' || e.error==='service-not-allowed'){
      if($('micStatus')) $('micStatus').textContent='Mic blocked — check browser settings';
      S.voiceState='idle';
      if($('bigMicBtn')) $('bigMicBtn').classList.remove('recording');
    } else if(e.error==='network'){
      // Browser killed the audio stream (common after tab switch or screen lock).
      // Reset state cleanly — user just needs to tap mic again.
      console.warn('[Rec] network error — stream was killed by browser');
      S.voiceState='idle';
      if($('bigMicBtn')) $('bigMicBtn').classList.remove('recording');
      if($('micStatus')){ $('micStatus').textContent='Tap to speak'; $('micStatus').className=''; }
    } else if(e.error!=='no-speech' && e.error!=='aborted'){
      console.warn('[Rec error]',e.error);
    }
  };

  r.onend=()=>{
    if(S.voiceState==='recording' && recognition===r){
      try{
        r.start();
      }catch(e){
        // This instance is dead. Create a fresh one and continue recording.
        console.warn('[Rec onend restart failed, recreating]', e.message);
        recognition = initRec();
        if(recognition){
          try{ recognition.start(); }catch(e2){ console.warn('[Rec recreate failed]', e2.message); }
        }
      }
    }
  };
  return r;
}

function startVoice(){
  if(S.voiceState==='recording'){stopVoice(false);return;}

  // Always destroy and recreate the recognition object before each recording.
  // Reusing a stale instance is the main cause of mic silently dying after the
  // page is hidden, a session ends, or the browser kills the audio stream.
  if(recognition){ try{ recognition.abort(); }catch{} recognition=null; }
  recognition = initRec();
  if(!recognition){
    alert('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  S.voiceState='recording';
  S.finalBuf=''; S.interimBuf=''; S.wordCount=0; S.lastInterimLen=0;
  if($('hearingDisplay')) $('hearingDisplay').textContent='';
  clearTimeout(S.silTimer); clearTimeout(S.silConfirmTimer);
  TTS.stop();

  setTimeout(()=>{
    try{ recognition.start(); }catch(e){
      console.warn('[Rec start failed]', e.message);
      // If start() throws, clean up gracefully
      S.voiceState='idle';
      if($('bigMicBtn')) $('bigMicBtn').classList.remove('recording');
      if($('micStatus')){ $('micStatus').textContent='Tap to speak'; $('micStatus').className=''; }
    }
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
  clearTimeout(S.silTimer); clearTimeout(S.silConfirmTimer);
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


// When the page becomes visible again after being hidden (tab switch, phone lock etc),
// proactively destroy the recognition instance so the next mic tap starts fresh.
// This prevents the silent-dead-mic bug after switching away and back.
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible'){
    if(recognition && S.voiceState !== 'recording'){
      try{ recognition.abort(); }catch{}
      recognition = null;
    }
  } else {
    // Page is being hidden — stop any active recording cleanly
    if(S.voiceState === 'recording'){
      stopVoice(false);
    }
  }
});
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

async function processAnswer(userText,forced){
  if(S._afterFollowUp) return S._afterFollowUp(userText);
  if(S.scenario==='debate'&&S._isDebate) return processDebateAnswer(userText);
  if(S.scenario==='smalltalk'&&S._isSmallTalk) return processSmallTalkAnswer(userText);
  var qi=S.qIndex;
  var q=S.questions[qi];
  S.qLog[qi].userAnswers.push(userText);
  $('bigMicBtn').style.display='none';
  $('skipBtn').classList.remove('show');
  $('micStatus').textContent='Evaluating...';
  $('micStatus').className='active';
  if($('hearingDisplay')) $('hearingDisplay').textContent='Thinking...';

  var evalSys='You are a warm encouraging English coach for a non-native speaker interview practice session. Be generous.\n\nQuestion: "'+q.q+'" | Testing: '+q.dimension+' -- '+q.intent+'\n\nGenerous criteria:\n- good: relevant, 15+ words, shows effort even if grammar imperfect.\n- ok: short (5-14 words) but on-topic.\n- weak: off-topic or under 5 meaningful words.\n- blank: nothing real.\n\nOnly set should_retry:true if quality is weak or blank AND retryCount is 0. Never retry more than once.\n\nReturn ONLY valid JSON no markdown:\n{"quality":"good|ok|weak|blank","score":0-100,"coach_msg":"1 warm sentence referencing their words","praise_msg":"1 genuine praise sentence","grammar_note":"one tip or empty","follow_up":"natural 1-sentence follow-up digging deeper","should_retry":true|false}';

  var ev={quality:'ok',score:55,coach_msg:'',praise_msg:'Good attempt!',grammar_note:'',follow_up:'',should_retry:false};
  if(S.apiKey||true){
    var raw=await callAPI([{role:'user',content:'Q: '+q.q+'\nAnswer: "'+userText+'"\nRetry count: '+S.retryCount+'\n\nEvaluate.'}],evalSys,300);
    if(raw){try{ev=Object.assign({},ev,JSON.parse(raw.replace(/```json|```/g,'').trim()));}catch{}}
  }
  if(!S.apiKey){
    var wc=userText.trim().split(/\s+/).filter(Boolean).length;
    if(wc<4){ev.quality='weak';ev.score=20;ev.should_retry=S.retryCount<1;ev.coach_msg=FB.comfort[Math.floor(Math.random()*FB.comfort.length)];}
    else if(wc<12){ev.quality='ok';ev.score=Math.round(55+wc*2);ev.praise_msg=FB.praise[Math.floor(Math.random()*FB.praise.length)];}
    else{ev.quality='good';ev.score=Math.min(88,Math.round(62+wc*1.2));ev.praise_msg=FB.praise[Math.floor(Math.random()*FB.praise.length)];}
  }

  S.qLog[qi].finalScore=ev.score;
  S.qLog[qi].evalNotes=(S.qLog[qi].evalNotes||'')+(ev.grammar_note?'Grammar: '+ev.grammar_note+'. ':'')+ev.coach_msg;
  $('micStatus').textContent='Tap to speak';
  $('micStatus').className='';
  S.voiceState='idle';

  if(ev.should_retry&&S.retryCount<CFG.MAX_RETRIES&&(ev.quality==='weak'||ev.quality==='blank')){
    S.retryCount++;
    S.qLog[qi].retries=S.retryCount;
    if(S._usingFriendly){setFriendly('calm');}else{setChall('frown');await sleep(400);setChall('neutral');}
    if(S.mentorMode!=='off') await phaseMentorCoach(ev.coach_msg||FB.coach[0],'comfort');
    S.phase='qa_retry';
    $('bigMicBtn').style.display='flex';
    $('skipBtn').classList.add('show');
    $('micStatus').textContent='Give it another go';
    $('micStatus').className='active';
    return;
  }

  S.qLog[qi].retries=S.retryCount;
  var isLast=(qi+1>=S.questions.length);
  if(S._usingFriendly){
    setFriendly('excited_talk');
    await showChallBubble(ev.quality==='good'?'Great answer!':'Alright, moving on.');
    hideChallBubble();setFriendly('calm');
  }else{
    setChall(ev.quality==='good'?'smile_talk':'neutral');
    await showChallBubble(ev.quality==='good'?'Noted.':'Alright.');
    hideChallBubble();setChall('neutral');
  }

  var fuChance=ev.quality==='good'?0.55:(ev.quality==='ok'?0.28:0);
  var hasFU=ev.follow_up&&ev.follow_up.trim().length>8;
  if(!isLast&&hasFU&&S.retryCount===0&&Math.random()<fuChance){
    await sleep(300);
    if(S.mentorMode!=='off'&&S.intensity==='gentle') await phaseMentorPraise(ev.praise_msg);
    if(S._usingFriendly){setFriendly('approve_talk');}else{setChall('smile_talk');}
    await showChallBubble(ev.follow_up,false);
    if(S._usingFriendly){setFriendly('calm');}else{setChall('neutral');}
    S.phase='qa_listening';
    $('bigMicBtn').style.display='flex';
    $('skipBtn').classList.add('show');
    $('micStatus').textContent='Answer the follow-up';
    $('micStatus').className='active';
    S._afterFollowUp=async function(fuText){
      S._afterFollowUp=null;
      S.qLog[qi].userAnswers.push('[follow-up] '+fuText);
      if(S.mentorMode!=='off'&&ev.praise_msg) await phaseMentorPraise(ev.praise_msg); else await sleep(400);
      await phaseAskQuestion(qi+1);
    };
    return;
  }

  if(S.mentorMode!=='off'&&(S.intensity==='gentle'||ev.quality==='good')){
    await phaseMentorPraise(ev.praise_msg);
  }else{
    await sleep(500);
  }
  if(isLast){await phaseEnd();}else{await phaseAskQuestion(qi+1);}
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
  clearTimeout(S.silTimer); clearTimeout(S.silConfirmTimer);
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

/* ════════════════════════════════════════════
   反馈与练习生成 (修复评分 & 重构练习)
════════════════════════════════════════════ */
async function generateFeedback(){
  showScreen('feedbackScreen');
  showLoad('Generating your detailed analysis…');

  // ========== 新增：立即显示优化表达练习按钮（并禁用） ==========
  const errorPracticeBtn = document.getElementById('errorPracticeBtn');
  if (errorPracticeBtn) {
    errorPracticeBtn.style.display = 'inline-flex';
    errorPracticeBtn.disabled = true;
    errorPracticeBtn.title = '练习正在生成中，请稍后...';
  }
  S.isGeneratingExercises = true;
  // ========== 新增结束 ==========

  // 下面的代码是你原有的，不要改动（从 const position = ... 开始）
  const position = S.scenario === 'debate' ? 'Debate Session' : (S.scenario === 'smalltalk' ? 'Small Talk' : (S.position || 'Interview Session'));
  const modeLabel = S.scenario === 'debate' ? 'Debate' : (S.scenario === 'smalltalk' ? 'Conversation' : ({ gentle: 'Gentle', medium: 'Realistic', hardcore: 'Hardcore' }[S.intensity] || ''));
  const countLabel = S.scenario === 'debate' ? S.qLog.length + ' rounds' : (S.scenario === 'smalltalk' ? S.qLog.length + ' turns' : S.questions.length + ' questions');
  const fbSub = $('fbSub');
  if (fbSub) fbSub.textContent = position + ' · ' + countLabel + ' · ' + modeLabel + ' Mode';

  const summaryLabel = S.scenario === 'debate' ? 'Round' : 'Q';
  let sessionSummary = 'No recorded exchanges.';
  if (S.qLog && S.qLog.length > 0) {
    sessionSummary = S.qLog.map((l, i) => {
      const questionText = l.question || '(No question recorded)';
      const lastAnswer = (l.userAnswers && l.userAnswers.length) ? l.userAnswers[l.userAnswers.length - 1] : '(no answer)';
      const evalNote = l.evalNotes || '';
      return `${summaryLabel}${i + 1}: ${questionText}\n  Answer: "${lastAnswer}"\n  Notes: ${evalNote}`;
    }).join('\n\n');
  }

  const scenarioContext = S.scenario === 'debate'
    ? 'debate coach (assess argument, evidence, rebuttal, vocabulary, fluency, confidence)'
    : S.scenario === 'smalltalk'
      ? 'conversational English coach (assess naturalness, question-asking, warmth, vocabulary, fluency, listening)'
      : 'interview coach (assess grammar, fluency, vocabulary, content, strategy, confidence)';

  const detailSys = `You are an expert English ${scenarioContext} conducting a POST-SESSION analysis.

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

  const [rJ, rC, rM] = await Promise.allSettled([
    callAPI([{ role: 'user', content: `Full session:\n${sessionSummary}\n\nProvide full analysis JSON.` }], detailSys, 900),
    callAPI([{ role: 'user', content: `Session:\n${sessionSummary}\n\nGive your frank interviewer's assessment. 2-3 sentences. Be specific.` }],
      `You are the interviewer who just ran a "${position}" session. Be honest and professional.`, 220),
    callAPI([{ role: 'user', content: `Session:\n${sessionSummary}\n\nWrite your warm mentor letter. 2-3 sentences. Be specific and encouraging.` }],
      `You are the warm Mentor from this session. Write like a brilliant older sibling who wants them to succeed.`, 220),
  ]);

  hideLoad();

  if(S.scenario==='smalltalk'){
    var stRep=$('stReport'); if(stRep) stRep.classList.add('show');
    if($('stStatTurns'))  $('stStatTurns').textContent=S.qLog.length;
    if($('stStatQuestions')) $('stStatQuestions').textContent=S._stQuestionCount||0;
    if($('stStatTopics')) $('stStatTopics').textContent=S._stTopicsSeen&&S._stTopicsSeen.length?S._stTopicsSeen.length:1;
    var mList=$('stMomentsList');
    if(mList){
      var moms=(S._stBestMoments||[]).slice(0,3);
      mList.innerHTML=moms.length?moms.map(function(m){return '<div class="st-moment-item">"'+esc(m)+'"</div>';}).join(''):'<div class="st-moment-item" style="font-style:normal;color:var(--ink-dim)">Keep chatting and your best moments will appear here!</div>';
    }
    if(S.qLog.length>2){
      var stSummary=(S._stHistory||[]).filter(function(m){return m.role==='user';}).map(function(m){return m.content;}).join(' | ');
      callAPI([{role:'user',content:'The user shared: "'+stSummary.slice(0,600)+'"\n\nWrite a warm 3-4 sentence reflection. Reference something specific they said. Be their gentle mirror. Sign off as -- Maaya'}],
        'You are Maaya, a warm therapist-friend. Write an end-of-session personal reflection. Be deeply human, specific, non-prescriptive.',250)
      .then(function(letter){if(letter&&$('fbMentor')) $('fbMentor').textContent=letter;})
      .catch(function(){});
    }
  }

  let data = { dims: {}, issues: [], vocab_upgrades: [], advanced_phrases: [], narrative: '', challenger_verdict: '', mentor_letter: '' };
  if (rJ.status === 'fulfilled' && rJ.value) {
    try {
      const cleaned = rJ.value.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      data = { ...data, ...parsed };
    } catch (e) {
      console.warn('Failed to parse AI feedback JSON, using fallback');
    }
  }

  const defaultDims = {
    grammar: { score: 70, note: 'Overall grammar is acceptable, but watch for tense consistency.' },
    fluency: { score: 65, note: 'Some hesitations and filler words.' },
    vocabulary: { score: 60, note: 'Good basic vocabulary, but can be more precise.' },
    content: { score: 65, note: 'Answers contain relevant points, but need more specific examples.' },
    strategy: { score: 60, note: 'Structure could be improved (e.g., STAR method).' },
    confidence: { score: 65, note: 'Hesitation in some answers; practice assertive phrasing.' },
  };
  if (!data.dims || Object.keys(data.dims).length === 0) {
    data.dims = defaultDims;
  }
  for (let key in defaultDims) {
    if (!data.dims[key]) data.dims[key] = defaultDims[key];
  }

  S.feedbackData = data;
  S.advancedPhrases = data.advanced_phrases || [];

  const SCENARIO_DIMS = {
    interview: [
      { key: 'grammar', icon: 'G', label: 'Grammar', color: '#C03030' },
      { key: 'fluency', icon: 'F', label: 'Fluency', color: '#2A6E4A' },
      { key: 'vocabulary', icon: 'V', label: 'Vocabulary', color: '#243870' },
      { key: 'content', icon: 'C', label: 'Content', color: '#7A4E08' },
      { key: 'strategy', icon: 'S', label: 'Strategy', color: '#5A3888' },
      { key: 'confidence', icon: 'X', label: 'Confidence', color: '#B06010' },
    ],
    debate: [
      { key: 'argument', icon: 'A', label: 'Argument', color: '#0D7377' },
      { key: 'evidence', icon: 'E', label: 'Evidence', color: '#085f63' },
      { key: 'rebuttal', icon: 'R', label: 'Rebuttal', color: '#144552' },
      { key: 'vocabulary', icon: 'V', label: 'Vocabulary', color: '#243870' },
      { key: 'fluency', icon: 'F', label: 'Fluency', color: '#2A6E4A' },
      { key: 'confidence', icon: 'X', label: 'Confidence', color: '#B06010' },
    ],
    smalltalk: [
      { key: 'naturalness', icon: 'N', label: 'Naturalness', color: '#6B5B95' },
      { key: 'questions', icon: 'Q', label: 'Questions', color: '#8a72b5' },
      { key: 'warmth', icon: 'W', label: 'Warmth', color: '#a48dc0' },
      { key: 'vocabulary', icon: 'V', label: 'Vocabulary', color: '#243870' },
      { key: 'fluency', icon: 'F', label: 'Fluency', color: '#2A6E4A' },
      { key: 'listening', icon: 'L', label: 'Listening', color: '#5A3888' },
    ],
  };
  const DIM_DEFS = SCENARIO_DIMS[S.scenario] || SCENARIO_DIMS.interview;
  const dimScores = $('dimScores');
  if (dimScores) {
    dimScores.innerHTML = DIM_DEFS.map(d => {
      const dim = data.dims[d.key] || { score: 0, note: 'No data for this session.' };
      const s = dim.score;
      return `<div class="dim-card">
        <div class="dim-name">${d.icon} ${d.label}<span class="dim-score" style="color:${d.color}">${s}</span></div>
        <div class="dim-bar-bg"><div class="dim-bar-fill" style="width:${s}%;background:${d.color}"></div></div>
        <div class="dim-note">${esc(dim.note || '—')}</div>
      </div>`;
    }).join('');
  }
  setTimeout(() => {
    document.querySelectorAll('.dim-bar-fill').forEach(b => { b.style.transition = 'width 1.1s ease'; });
  }, 100);

  if (data.narrative) {
    const narrativeText = $('narrativeText');
    const narrativeBox = $('narrativeBox');
    if (narrativeText) narrativeText.textContent = data.narrative;
    if (narrativeBox) narrativeBox.style.display = 'block';
  }

  const issues = data.issues || [];
  if (issues.length) {
    const issuesSection = $('issuesSection');
    const issuesList = $('issuesList');
    if (issuesSection) issuesSection.style.display = 'block';
    if (issuesList) {
      issuesList.innerHTML = issues.map(i => {
        const bc = i.type === 'grammar' ? 'badge-err' : i.type === 'strategy' ? 'badge-tip' : 'badge-tip';
        return `<div class="issue-row">
          <span class="issue-badge ${bc}">${i.type.toUpperCase()}</span>
          <div class="issue-content"><strong>${esc(i.problem)}</strong><br>${esc(i.fix)}</div>
        </div>`;
      }).join('');
    }
  }

  const vu = data.vocab_upgrades || [];
  if (vu.length) {
    const vocabSection = $('vocabSection');
    const vocabList = $('vocabList');
    if (vocabSection) vocabSection.style.display = 'block';
    if (vocabList) {
      vocabList.innerHTML = vu.map(v => `
        <div class="vocab-row">
          <span class="vocab-orig">${esc(v.original)}</span>
          <span class="vocab-arrow">→</span>
          <span class="vocab-better">${esc(v.better)}</span>
          <span></span>
          <span class="vocab-ctx" style="grid-column:1/-1">💬 ${esc(v.context)}</span>
        </div>`).join('');
    }
  }

  const ap = S.advancedPhrases;
  if (ap.length) {
    const phrasesSection = $('phrasesSection');
    const phrasesList = $('phrasesList');
    const wordPracticeBtn = $('wordPracticeBtn');
    if (phrasesSection) phrasesSection.style.display = 'block';
    if (phrasesList) {
      phrasesList.innerHTML = ap.map(p => `
        <div class="phrase-card">
          <div class="phrase-text">"${esc(p.phrase)}"</div>
          <div class="phrase-meaning">↳ ${esc(p.meaning)}</div>
          <div class="phrase-example">e.g. "${esc(p.example)}"</div>
        </div>`).join('');
    }
    if (wordPracticeBtn) wordPracticeBtn.style.display = 'inline-flex';
    saveSRS(ap.map(p => p.phrase));
  }

  const challCardHead = document.querySelector('.fb-card:first-child .fbc-name');
  const challCardRole = document.querySelector('.fb-card:first-child .fbc-role');
  if (S.scenario === 'debate' && challCardHead) { challCardHead.textContent = "Debater's Assessment"; challCardRole.textContent = "Sharp · Argumentative"; }
  else if (S.scenario === 'smalltalk' && challCardHead) { challCardHead.textContent = "Your Conversation Partner"; challCardRole.textContent = "Gentle · Honest"; }

  const fbChallenger = $('fbChallenger');
  const fbMentor = $('fbMentor');
  if (fbChallenger) {
    fbChallenger.textContent = (rC.status === 'fulfilled' && rC.value ? rC.value : null) ||
      data.challenger_verdict ||
      "You demonstrated real effort throughout. Your strongest moments came when you offered specific examples. Next time, ensure every answer contains at least one concrete, verifiable detail — a number, a date, a name.";
  }
  if (fbMentor) {
    fbMentor.textContent = (rM.status === 'fulfilled' && rM.value ? rM.value : null) ||
      data.mentor_letter ||
      "You showed up and that matters more than you know. Your answers grew more detailed as the session went on — that's real growth. For next time: practice your 60-second introduction three times before you sleep tonight. You're closer than you think.";
  }

  // ========== 生成练习（这会花几秒钟） ==========
  await generateOptimizationExercises(sessionSummary);
  // ========== 生成完成后，启用按钮 ==========
  if (errorPracticeBtn) {
    errorPracticeBtn.disabled = false;
    errorPracticeBtn.title = '';
  }
  S.isGeneratingExercises = false;
}
// 生成优化表达练习（包含多种近义词组/优化表达）
async function generateOptimizationExercises(sessionSummary) {
  if (!sessionSummary || sessionSummary === 'No recorded exchanges.') return;

  const prompt = `You are an English coach. Create 3 short translation exercises based on the user's weak points.

IMPORTANT RULES:
1. Each exercise MUST have a SHORT Chinese sentence (8-15 words, no longer).
2. The Chinese sentence MUST clearly require using the EXACT "better" phrase.
3. "better" should be a SHORT phrase (2-5 words) OR a short sentence (max 8 words).
4. If "better" is a phrase, the Chinese hint should be like: "请用 'xxx' 翻译：..." 
5. Keep it simple and focused on the key expression.

Example:
{
  "original": "I think I'm good for this job.",
  "better": "align with",
  "explanation": "Use 'align with' to sound professional.",
  "alternatives": ["match", "fit"],
  "chinese_hint": "请用 'align with' 翻译：我的技能与这个职位某种程度上非常匹配。"
}

Another example for a short sentence:
{
  "original": "He likes games.",
  "better": "I'm hooked on",
  "explanation": "Use 'hooked on' to express addiction.",
  "alternatives": ["addicted to", "obsessed with"],
  "chinese_hint": "请用 'I'm hooked on' 翻译：她沉迷于这个游戏而父母因此批评她。"
}

Generate 3 exercises. Return ONLY JSON array.`;

  let exercises = [];
  if (S.apiKey) {
    const raw = await callAPI([{ role: 'user', content: prompt }], prompt, 1500);
    if (raw) {
      try {
        const cleaned = raw.replace(/```json|```/g, '').trim();
        exercises = JSON.parse(cleaned);
        if (!Array.isArray(exercises)) exercises = [];
      } catch(e) { console.warn('Failed to parse exercises JSON', e); }
    }
  }
  if (!exercises.length) {
    // 默认 fallback 练习，包含 alternatives
    exercises = [
      {
        original: "I think I'm a good fit.",
        better: "I believe my skills align well with this role.",
        explanation: "Using 'believe' is more confident than 'think', and 'align with' is more professional.",
        alternatives: [
          "I am confident that my qualifications match this position.",
          "My background seems well-suited for this role.",
          "I feel that my experience fits perfectly here."
        ],
        chinese_hint: "请用 'my skills align well with this role' 翻译：我认为我的技能与这个职位非常匹配。"
      }
    ];
  }

  S.practiceErrors = exercises.map((ex, idx) => ({
    id: Date.now() + idx,
    original: ex.original,
    better: ex.better,
    explanation: ex.explanation,
    alternatives: ex.alternatives || [],
    chinese_hint: ex.chinese_hint,
    attempts: [],
    mastered: false,
    difficulty: 1,
    retryCount: 0
  }));

  // 保存到个人题库
  S.myQuestionBank = S.practiceErrors.map(e => ({ ...e }));
  saveBank(S.myQuestionBank);

  // 确保按钮显示（即使尚未生成完，但调用此函数时已生成）
  const errorPracticeBtn = document.getElementById('errorPracticeBtn');
  if (errorPracticeBtn) errorPracticeBtn.style.display = 'inline-flex';
}

// 评估用户翻译是否正确（基于语义，忽略语音识别错误）
async function evaluateTranslation(userAnswer, expectedBetter, alternatives, original) {
  // 如果答案太短或包含明显识别错误标记（如单个字母、无意义词），直接返回“重试”提示，不计入错误
  const cleanAnswer = userAnswer.trim().toLowerCase();
  if (cleanAnswer.length < 5 || /^(?:uh|um|eh|a|an|the|and|so|well|you know)$/i.test(cleanAnswer)) {
    return { correct: false, feedback: "⚠️ 听不清或识别错误，请再说一遍（尽量清晰完整）。", isRecError: true };
  }

  // 先用 AI 评估（如果有 API key）
  if (S.apiKey) {
    const prompt = `You are an English teacher. The learner was asked to translate a Chinese sentence into English. The expected correct answer is: "${expectedBetter}". The user's answer: "${userAnswer}".

Please judge if the user's answer is semantically correct and conveys the same meaning as the expected answer, even if there are small typos or word order differences. Ignore minor speech recognition errors (e.g., repeated words like "uh", "um").

Return ONLY JSON: {"correct": true/false, "feedback": "a short constructive message (in English) either praising or giving a hint, focusing on collocation or naturalness"}`;
    const raw = await callAPI([{ role: 'user', content: userAnswer }], prompt, 200);
    if (raw) {
      try {
        const res = JSON.parse(raw.replace(/```json|```/g, '').trim());
        return { correct: res.correct, feedback: res.feedback, isRecError: false };
      } catch(e) {}
    }
  }

  // 降级：模糊匹配（关键词匹配，忽略识别错误）
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\b(uh|um|ah|er|mm|hmm)\b/g, '').trim();
  const normBetter = normalize(expectedBetter);
  const normAnswer = normalize(cleanAnswer);
  const betterWords = normBetter.split(/\s+/).filter(w => w.length > 2);
  let matchCount = 0;
  for (let w of betterWords) {
    if (normAnswer.includes(w)) matchCount++;
  }
  const correct = (matchCount / betterWords.length) >= 0.5; // 放宽到50%
  const feedback = correct 
    ? "✅ 很好！你的翻译正确，表达自然。" 
    : `❌ 再试试看。正确的表达是：“${expectedBetter}”。${S.practiceErrors[S.practiceIndex]?.explanation || ''}`;
  return { correct, feedback, isRecError: false };
}

// 设置 Mentor 表情（用于练习模块）
let epMentorExprTimer = null;
function setEpMentorExpr(expr, duration = 2000) {
  const mentorImg = document.getElementById('epMentorSprite');
  if (!mentorImg) return;
  let src = '';
  if (expr === 'praise') src = MENTOR_EXPR.praise || IMGS.mentor_praise;
  else if (expr === 'hint') src = MENTOR_EXPR.hint_smile || IMGS.mentor_hint_smile;
  else if (expr === 'laugh') src = MENTOR_EXPR.laugh || IMGS.mentor_clap1;
  else src = MENTOR_EXPR.greet_smile;
  if (src) mentorImg.src = src;
  // 如果是鼓掌，循环切换 clap1/clap2
  if (expr === 'laugh') {
    if (epMentorExprTimer) clearInterval(epMentorExprTimer);
    let toggle = false;
    epMentorExprTimer = setInterval(() => {
      const current = mentorImg.src;
      const clap1 = MENTOR_EXPR.laugh || IMGS.mentor_clap1;
      const clap2 = MENTOR_EXPR.laugh_talk || IMGS.mentor_clap2;
      if (current.includes(clap1)) mentorImg.src = clap2;
      else mentorImg.src = clap1;
    }, 600);
    setTimeout(() => {
      if (epMentorExprTimer) clearInterval(epMentorExprTimer);
      mentorImg.src = MENTOR_EXPR.greet_smile;
    }, duration);
  } else {
    if (epMentorExprTimer) clearInterval(epMentorExprTimer);
    setTimeout(() => {
      if (mentorImg && mentorImg.src !== MENTOR_EXPR.greet_smile) {
        mentorImg.src = MENTOR_EXPR.greet_smile;
      }
    }, duration);
  }
}

function startErrorPractice() {
  // 如果正在生成练习，提示用户等待
  if (S.isGeneratingExercises) {
    alert('练习内容正在生成中，请稍后再点击。');
    return;
  }
  // 如果没有练习数据，提示先完成面试
  if (!S.practiceErrors.length && !S.myQuestionBank.length) {
    alert('没有可用的练习，请先完成一次面试。');
    return;
  }
  if (S.myQuestionBank.length && !S.practiceErrors.length) {
    S.practiceErrors = [...S.myQuestionBank];
  }
  // 重置每道题的重试计数
  S.practiceErrors.forEach(e => { e.retryCount = 0; e.attempts = []; });
  S.practiceIndex = 0;
  S.epRetryCount = 0;
  S.epWaitingForRetry = false;
  S.epCurrentExpected = '';
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
    if (mentorText) mentorText.innerHTML = "🎉 恭喜完成所有练习！要不要挑战更难的表达？点击「二次练习」生成新题目。";
    const nextBtn = document.getElementById('epNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';
    const skipBtn = document.getElementById('epSkipBtn');
    if (skipBtn) skipBtn.style.display = 'inline-flex';
    const harderBtn = document.getElementById('epHarderBtn');
    if (harderBtn) harderBtn.style.display = 'inline-flex';
    const doneBtn = document.getElementById('epDoneBtn');
    if (doneBtn) doneBtn.style.display = 'inline-flex';
    setEpMentorExpr('laugh', 3000);
    return;
  }

  const err = S.practiceErrors[idx];
  S.epCurrentExpected = err.better;
  S.epRetryCount = 0;
  S.epWaitingForRetry = false;

  // 更新左侧内容
  const errorOriginalEl = document.querySelector('#epErrorOriginal .ep-content');
  if (errorOriginalEl) errorOriginalEl.textContent = err.original;
  
  const correctionEl = document.querySelector('#epCorrection .ep-content');
if (correctionEl) {
  // 清空旧内容
  correctionEl.innerHTML = '';
  
  // 收集所有表达：better + alternatives
  let allExpressions = [err.better, ...(err.alternatives || [])];
  // 去重（避免重复）
  allExpressions = [...new Set(allExpressions)];
  
  // 生成列表HTML：关键表达（better）加粗，其他正常
  const listHtml = `
  <div style="margin:10px 0;">
    <div style="font-family:var(--font-b); margin-bottom:10px; font-weight:150; font-size:13px; color:#1A5B3A;">✨ 推荐表达方式：</div>
    <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
      ${allExpressions.map(expr => {
        const isMain = (expr === err.better);
        // 限制长度：如果是词组/短语，最多显示2个词？不，这里用字符数限制更简单
        // 超过35个字符就截断加...
        let shortExpr = expr;
        if (shortExpr.length > 35) {
          shortExpr = shortExpr.substring(0, 32) + '...';
        }
        return `<span style="background:${isMain ? '#E8F5E9' : '#F5F5F5'}; border:1px solid ${isMain ? '#0D7377' : '#CCCCCC'}; border-radius:30px; padding:8px 18px; font-weight:${isMain ? 'bold' : 'normal'}; font-size:14px; color:#1A5B3A;">${isMain ? `★ ${esc(shortExpr)}` : esc(shortExpr)}</span>`;
      }).join('')}
    </div>
    <div style="margin-top:12px; font-size:13px; color:#1A6B6B;">💡 点击麦克风练习使用这些表达</div>
  </div>
`;
  
  correctionEl.innerHTML = listHtml;
}
  const tipEl = document.querySelector('#epTip .ep-content');
  if (tipEl) tipEl.textContent = err.explanation;

  // 构建题目：从 chinese_hint 中提取中文句子和关键词
  let taskHtml = err.chinese_hint;
  if (!taskHtml.includes('翻译：')) {
    taskHtml = `📝 请翻译：${err.chinese_hint}<br><span style="font-size:14px;">提示：使用 “${err.better}” 中的关键词</span>`;
  }
  const taskDiv = document.getElementById('epTask');
if (taskDiv) taskDiv.innerHTML = taskHtml;
  // 清空反馈和答案区域
  const feedbackDiv = document.getElementById('epFeedback');
  if (feedbackDiv) {
    feedbackDiv.style.display = 'none';
    feedbackDiv.innerHTML = '';
    feedbackDiv.className = 'ep-feedback';
  }
  const answerDisplay = document.getElementById('epAnswerDisplay');
  if (answerDisplay) answerDisplay.innerHTML = '';
  const micStatus = document.getElementById('epMicStatus');
  if (micStatus) micStatus.innerHTML = 'Tap to speak';
  const micBtn = document.getElementById('epMicBtn');
  if (micBtn) micBtn.classList.remove('recording');
  const nextBtn = document.getElementById('epNextBtn');
  if (nextBtn) nextBtn.style.display = 'none';
  const harderBtn = document.getElementById('epHarderBtn');
  if (harderBtn) harderBtn.style.display = 'none';
  const doneBtn = document.getElementById('epDoneBtn');
  if (doneBtn) doneBtn.style.display = 'none';
  const progressSpan = document.getElementById('epProgress');
  if (progressSpan) progressSpan.textContent = `${idx+1} / ${S.practiceErrors.length}`;
  const mentorText = document.getElementById('epMentorText');
  if (mentorText) mentorText.innerHTML = '读一读上面的提示，然后按下麦克风练习吧！';
  setEpMentorExpr('greet_smile');
}

function initEpRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'en-US';
  r.continuous = false;
  r.interimResults = true;
  r.onresult = async (e) => {
    let final = '';
    for (let i = 0; i < e.results.length; i++) {
      final += e.results[i][0].transcript;
    }
    S.epCurrentAnswer = final;
    const answerDisplay = document.getElementById('epAnswerDisplay');
    if (answerDisplay) answerDisplay.innerHTML = final;
  };
  r.onerror = (e) => {
    console.warn('[EP Rec]', e.error);
    const micStatus = document.getElementById('epMicStatus');
    if (micStatus) micStatus.innerHTML = 'Mic error, try again';
    const micBtn = document.getElementById('epMicBtn');
    if (micBtn) micBtn.classList.remove('recording');
  };
  r.onend = async () => {
    const micBtn = document.getElementById('epMicBtn');
    if (micBtn) micBtn.classList.remove('recording');
    if (S.epCurrentAnswer && S.epCurrentAnswer.trim().length > 2) {
      const micStatus = document.getElementById('epMicStatus');
      if (micStatus) micStatus.innerHTML = 'Evaluating...';
      const curErr = S.practiceErrors[S.practiceIndex];
      if (curErr) {
        const evalResult = await evaluateTranslation(
          S.epCurrentAnswer, 
          curErr.better, 
          curErr.alternatives || [], 
          curErr.original
        );
        const feedbackDiv = document.getElementById('epFeedback');
        if (feedbackDiv) {
          feedbackDiv.innerHTML = evalResult.feedback;
          feedbackDiv.className = `ep-feedback ${evalResult.correct ? 'correct' : 'wrong'}`;
          feedbackDiv.style.display = 'block';
        }
        if (evalResult.correct) {
          // 答对，记录掌握，显示下一题按钮
          curErr.mastered = true;
          const mentorText = document.getElementById('epMentorText');
          if (mentorText) mentorText.innerHTML = '👍 很好！你掌握了这个表达。点击下一题。';
          setEpMentorExpr('praise', 1500);
          const nextBtn = document.getElementById('epNextBtn');
          if (nextBtn) nextBtn.style.display = 'inline-flex';
          if (micStatus) micStatus.innerHTML = '✔ 正确';
        } else {
          // 答错，增加重试计数
          curErr.retryCount = (curErr.retryCount || 0) + 1;
          if (curErr.retryCount >= 3) {
            // 三次失败，显示答案并自动进入下一题
            const mentorText = document.getElementById('epMentorText');
            if (mentorText) mentorText.innerHTML = `正确答案是：“${curErr.better}”。我们继续下一题。`;
            setEpMentorExpr('hint', 2000);
            const nextBtn = document.getElementById('epNextBtn');
            if (nextBtn) nextBtn.style.display = 'inline-flex';
            if (micStatus) micStatus.innerHTML = '⚠️ 已显示答案';
          } else {
            const mentorText = document.getElementById('epMentorText');
            if (mentorText) mentorText.innerHTML = `再试试看！剩余尝试次数：${3 - curErr.retryCount}`;
            setEpMentorExpr('hint', 1500);
            if (micStatus) micStatus.innerHTML = '再试一次';
            // 不清空答案区域，让用户继续尝试
          }
        }
      } else {
        const micStatus = document.getElementById('epMicStatus');
        if (micStatus) micStatus.innerHTML = 'Tap to speak again';
      }
    } else {
      const micStatus = document.getElementById('epMicStatus');
      if (micStatus) micStatus.innerHTML = 'Tap to speak again (too short)';
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
  if (answerDisplay) answerDisplay.innerHTML = '';
  const micStatus = document.getElementById('epMicStatus');
  if (micStatus) micStatus.innerHTML = 'Listening...';
  if (micBtn) micBtn.classList.add('recording');
  try { S.epRecognition.start(); } catch(e) { console.warn(e); }
}

function nextPracticeItem() {
  // 如果当前题目未正确且未满3次重试，不允许跳过（但用户可强制跳过，我们允许）
  S.practiceIndex++;
  loadPracticeItem(S.practiceIndex);
}
// 跳过当前题目（不计正确，直接下一题）
function skipPracticeItem() {
  // 标记为未掌握但不增加重试次数
  const curErr = S.practiceErrors[S.practiceIndex];
  if (curErr) {
    curErr.skipped = true;
    curErr.retryCount = 3; // 设为3，防止下次还出现
  }
  S.practiceIndex++;
  loadPracticeItem(S.practiceIndex);
}
function finishErrorPractice() {
  // 收集所有练习过的表达
  const allPhrases = S.practiceErrors.map(e => e.better);
  const uniquePhrases = [...new Set(allPhrases)]; // 去重
  
  // 生成漂亮的汇总列表
  const summaryHtml = `
    <div style="margin-top:30px; padding:20px; background:var(--paper2); border:3px solid var(--ink); border-radius:12px;">
      <h3 style="font-family:var(--font-h); margin-bottom:15px;">📖 本次练习的所有高级表达汇总</h3>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${uniquePhrases.map(p => `<span style="background:#FFF3C9; border:2px solid #F5B042; border-radius:30px; padding:8px 18px; font-size:16px; font-weight:bold; color:#B45F06;">${esc(p)}</span>`).join('')}
      </div>
      <p style="margin-top:15px; font-size:14px; color:var(--ink-dim);">💡 这些表达可以收藏起来，下次面试/写作时使用！</p>
    </div>
  `;
  
  // 把汇总加到反馈页面
  const phrasesSection = document.getElementById('phrasesSection');
  if (phrasesSection) {
    phrasesSection.style.display = 'block';
    // 删除旧的汇总（如果有）
    const oldSummary = document.getElementById('practiceSummaryList');
    if (oldSummary) oldSummary.remove();
    // 添加新汇总
    const summaryDiv = document.createElement('div');
    summaryDiv.id = 'practiceSummaryList';
    summaryDiv.innerHTML = summaryHtml;
    phrasesSection.appendChild(summaryDiv);
  }
  
  showScreen('feedbackScreen');
  if (S.epRecognition) {
    try { S.epRecognition.abort(); } catch(e) {}
  }
}

async function generateHarderPractice() {
  showLoad('Generating harder exercises...');
  const unmastered = S.practiceErrors.filter(e => !e.mastered);
  if (unmastered.length === 0) {
    hideLoad();
    alert('你已经掌握了所有表达！非常棒！');
    return;
  }
  const prompt = `For each of the following phrases that the learner is still struggling with, create a more challenging version. Increase difficulty by using more complex sentence structures, advanced vocabulary, or nuanced contexts.

${unmastered.map((e, i) => `${i+1}. Original better expression: "${e.better}"\n   Explanation: ${e.explanation}\n   Chinese hint: ${e.chinese_hint}\n   Alternatives: ${e.alternatives.join(', ')}`).join('\n\n')}

Return ONLY JSON array with same length, each object: 
{
  "original_better": "the original better expression",
  "harder_better": "a more advanced version",
  "harder_explanation": "why this is more advanced",
  "harder_chinese_hint": "new Chinese hint to elicit the harder version",
  "harder_alternatives": ["alternative1", "alternative2"]
}`;

  let harderData = [];
  if (S.apiKey) {
    const raw = await callAPI([{ role: 'user', content: prompt }], prompt, 1500);
    if (raw) {
      try {
        harderData = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } catch(e) {}
    }
  }
  if (!harderData.length) {
    // fallback: 简单增加难度
    harderData = unmastered.map(e => ({
      original_better: e.better,
      harder_better: e.better.replace(/\.$/, ', which is a critical factor.'),
      harder_explanation: e.explanation + ' Also, try to connect your point to a broader implication.',
      harder_chinese_hint: e.chinese_hint + ' 并且说明为什么这个因素很重要。',
      harder_alternatives: e.alternatives.map(a => a + ' in a broader sense')
    }));
  }

  const newExercises = [];
  for (let i = 0; i < unmastered.length; i++) {
    const orig = unmastered[i];
    const hard = harderData.find(h => h.original_better === orig.better) || harderData[i];
    newExercises.push({
      id: Date.now() + i,
      original: orig.original,
      better: hard.harder_better,
      explanation: hard.harder_explanation,
      alternatives: hard.harder_alternatives || [],
      chinese_hint: hard.harder_chinese_hint,
      attempts: [],
      mastered: false,
      difficulty: (orig.difficulty || 1) + 1,
      retryCount: 0
    });
  }
  S.practiceErrors = newExercises;
  S.practiceIndex = 0;
  // 合并到题库
  S.myQuestionBank = [...S.myQuestionBank, ...newExercises];
  saveBank(S.myQuestionBank);
  hideLoad();
  loadPracticeItem(0);
  const harderBtn = document.getElementById('epHarderBtn');
  if (harderBtn) harderBtn.style.display = 'none';
  const mentorText = document.getElementById('epMentorText');
  if (mentorText) mentorText.innerHTML = '开始挑战更难表达！加油！';
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
  const epHarder = document.getElementById('epHarderBtn');
  if (epHarder) epHarder.addEventListener('click', generateHarderPractice);
  const epSkipBtn = document.getElementById('epSkipBtn');
  if (epSkipBtn) epSkipBtn.addEventListener('click', skipPracticeItem);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindErrorPracticeEvents);
} else {
  bindErrorPracticeEvents();
}

/* ── WORD PRACTICE (保持不变) ── */
$('wordPracticeBtn').addEventListener('click',()=>{
  if(!S.advancedPhrases.length && !S.myQuestionBank.length) {
    alert('No phrases to practise yet. Complete a session first.');
    return;
  }
  if(!S.advancedPhrases.length && S.myQuestionBank.length) {
    S.advancedPhrases = S.myQuestionBank.map(e => ({
      phrase: e.better,
      meaning: e.explanation,
      example: `Example: "${e.better}"`
    }));
  }
  S.wpIndex = 0;
  showScreen('wordPracticeScreen');
  showWPPhrase(0);
});

function showWPPhrase(idx){
  const phrases = S.advancedPhrases;
  if(idx >= phrases.length){
    wpDone();
    return;
  }
  const p = phrases[idx];
  const wpPhraseCard = $('wpPhraseCard');
  if(wpPhraseCard){
    wpPhraseCard.innerHTML = `
      <div class="wpp-num">PHRASE ${idx+1} / ${phrases.length}</div>
      <div class="wpp-phrase">"${esc(p.phrase)}"</div>
      <div class="wpp-meaning">Meaning: ${esc(p.meaning)}</div>
      <div class="wpp-example">Example: "${esc(p.example)}"</div>`;
  }
  const wpPrompt = $('wpPrompt');
  if(wpPrompt) wpPrompt.textContent = `Now try using this phrase naturally in a sentence — talk about your interview topic or yourself.`;
  const wpTranscript = $('wpTranscript');
  if(wpTranscript) wpTranscript.textContent = '';
  const wpEval = $('wpEval');
  if(wpEval){ wpEval.style.display='none'; wpEval.className='wp-eval'; }
  const wpNextBtn = $('wpNextBtn');
  if(wpNextBtn) wpNextBtn.style.display = 'none';
  const wpMicStatus = $('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent = 'Tap to speak';
  const wpProgress = $('wpProgress');
  if(wpProgress) wpProgress.textContent = `${idx+1} of ${phrases.length} phrases`;
}

let wpRec = null;
$('wpMicBtn').addEventListener('click',()=>{
  if($('wpMicBtn').classList.contains('recording')){
    wpRec && wpRec.stop();
    $('wpMicBtn').classList.remove('recording');
    const wpMicStatus = $('wpMicStatus');
    if(wpMicStatus) wpMicStatus.textContent = 'Processing…';
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ alert('Voice requires Chrome or Edge.'); return; }
  wpRec = new SR();
  wpRec.lang = 'en-US';
  wpRec.continuous = false;
  wpRec.interimResults = true;
  let buf = '';
  wpRec.onresult = e => {
    buf = Array.from(e.results).map(r=>r[0].transcript).join('');
    const wpTranscript = $('wpTranscript');
    if(wpTranscript) wpTranscript.textContent = buf;
  };
  wpRec.onend = async () => {
    $('wpMicBtn').classList.remove('recording');
    if(buf.trim().length > 4) await evaluateWPAnswer(buf.trim());
    else{
      const wpMicStatus = $('wpMicStatus');
      if(wpMicStatus) wpMicStatus.textContent = 'Tap to speak';
    }
  };
  wpRec.start();
  $('wpMicBtn').classList.add('recording');
  const wpMicStatus = $('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent = 'Listening (20s)…';
  setTimeout(()=>{ try{ wpRec.stop(); }catch{} }, 20000);
});

async function evaluateWPAnswer(text){
  const phrase = S.advancedPhrases[S.wpIndex]?.phrase || '';
  const evalEl = $('wpEval');
  const wpMicStatus = $('wpMicStatus');
  if(wpMicStatus) wpMicStatus.textContent = 'Evaluating…';
  let evalResult = { correct: false, feedback: 'Nice try! Keep practising this phrase.' };
  if(S.apiKey){
    const sys = `You are a language coach. The learner was asked to use the phrase "${phrase}" in a sentence.
Their sentence: "${text}"
Did they use the phrase correctly (or a close natural variation)? 
Return ONLY JSON: {"correct":true|false,"feedback":"one warm specific sentence of feedback"}`;
    const raw = await callAPI([{role:'user',content:text}], sys, 100);
    if(raw){
      try{ evalResult = { ...evalResult, ...JSON.parse(raw.replace(/```json|```/g,'').trim()) }; }catch{}
    }
  } else {
    const used = text.toLowerCase().includes((phrase||'').toLowerCase().split(' ')[0]);
    evalResult.correct = used;
    evalResult.feedback = used ? 'Great — you used it naturally!' : 'Try working the exact phrase into your sentence.';
  }

  if(evalEl){
    evalEl.textContent = evalResult.feedback;
    evalEl.className = 'wp-eval ' + (evalResult.correct ? 'good' : 'ok');
    evalEl.style.display = 'block';
  }
  const wpNextBtn = $('wpNextBtn');
  if(wpNextBtn) wpNextBtn.style.display = 'inline-flex';
  if(wpMicStatus) wpMicStatus.textContent = 'Done';
}

$('wpNextBtn').addEventListener('click',()=>{ S.wpIndex++; showWPPhrase(S.wpIndex); });
$('wpDoneBtn').addEventListener('click', wpDone);
function wpDone(){
  showScreen('feedbackScreen');
}

/* ── FEEDBACK ACTIONS (保持原样) ── */
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

console.log('🎭 Prologue v5 — Complete with enhanced practice');
