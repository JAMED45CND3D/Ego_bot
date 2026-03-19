// ── IMAGE ──
function triggerImg() {
  document.getElementById('imgInput').click();
}

async function handleImg(e) {
  const file = e.target.files[0];
  if(!file) return;
  const key = localStorage.getItem('ego_groq_key');
  if(!key) { document.getElementById('keyScreen').classList.remove('hidden'); return; }

  // Show image bubble
  const reader = new FileReader();
  reader.onload = async function(ev) {
    const b64 = ev.target.result.split(',')[1];
    const mime = file.type;
    const sizeKB = (file.size/1024).toFixed(0);

    // Add image bubble
    const imgDiv = document.createElement('div');
    imgDiv.className = 'msg-img';
    imgDiv.innerHTML = `<img src="${ev.target.result}"><div class="msg-img-cap">${file.name} · ${sizeKB}KB</div>`;
    document.getElementById('messages').appendChild(imgDiv);
    scrollToBottom();

    // thinking
    setFaceChat('🤔');
    updateTheta();
    const typing = addMsg('...', 'typing');

    // Call Groq vision API
    try {
      const sysCtx = EGO_PROMPT + `\n\n[Lihat gambar ini dan reaksi natural, pendek.]`;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 500,
          temperature: 0.85,
          messages: [
            { role: 'user', content: [
              { type: 'text', text: `[${sysCtx}] gue kirimin gambar ini ke elu. reaksi singkat, casual.` },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
            ]}
          ]
        })
      });
      typing.remove();
      if(!res.ok) { addMsg(`Error ${res.status}`, 'ego'); return; }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '...';
      addMsg(reply, 'ego');
      msgs.push({ role: 'user', content: `[user mengirim gambar: ${file.name}]` });
      msgs.push({ role: 'assistant', content: reply });
      updateMood(reply);
      saveState();
      setTimeout(spiralFlow, 4000);
      document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
    } catch(err) {
      typing.remove();
      addMsg(`Signal lost: ${err.message}`, 'ego');
    }
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ── VOICE ──
let mediaRecorder = null, audioChunks = [], recTimer = null, recSecs = 0;

function toggleVoice() {
  if(mediaRecorder && mediaRecorder.state === 'recording') {
    stopVoice();
  } else {
    startVoice();
  }
}

async function startVoice() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = []; recSecs = 0;
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = processVoice;
    mediaRecorder.start();
    document.getElementById('recIndicator').classList.add('active');
    document.getElementById('voiceIcon').textContent = '⏹';
    recTimer = setInterval(() => {
      recSecs++;
      document.getElementById('recText').textContent = `RECORDING... ${recSecs}s`;
    }, 1000);
  } catch(err) {
    addMsg('Mic tidak bisa diakses bro. Izinkan dulu.', 'ego');
  }
}

function stopVoice() {
  if(mediaRecorder) { mediaRecorder.stop(); mediaRecorder.stream.getTracks().forEach(t=>t.stop()); }
  clearInterval(recTimer);
  recSecs = 0;
  document.getElementById('recIndicator').classList.remove('active');
  document.getElementById('voiceIcon').textContent = '🎙';
  document.getElementById('recText').textContent = 'RECORDING... 0s';
}

async function processVoice() {
  const key = localStorage.getItem('ego_groq_key');
  if(!key) return;

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const dur = recSecs;

  // Show voice bubble
  const vDiv = document.createElement('div');
  vDiv.className = 'msg-voice';
  const audioUrl = URL.createObjectURL(blob);
  vDiv.innerHTML = `
    <button class="voice-play-btn">▶</button>
    <div class="voice-wave">${Array(12).fill(0).map((_,i)=>`<div class="voice-bar" style="height:${6+Math.random()*14}px;animation-delay:${i*.07}s"></div>`).join('')}</div>
    <div class="voice-dur">${dur}s</div>`;
  document.getElementById('messages').appendChild(vDiv);
  // Attach play handler
  const playBtn = vDiv.querySelector('.voice-play-btn');
  const audio = new Audio(audioUrl);
  playBtn.addEventListener('click', () => {
    if(audio.paused) { audio.play(); playBtn.textContent = '⏸'; audio.onended = () => playBtn.textContent = '▶'; }
    else { audio.pause(); playBtn.textContent = '▶'; }
  });
  scrollToBottom();

  // Transcribe via Groq Whisper
  setFaceChat('👂');
  updateTheta();
  const typing = addMsg('transcribing...', 'typing');
  let typing2 = null;

  try {
    const formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'id');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: formData
    });
    typing.remove();
    if(!res.ok) { addMsg(`Voice error ${res.status}`, 'ego'); return; }
    const data = await res.json();
    const transcript = data.text || '';
    if(!transcript.trim()) { addMsg('gua gak denger apa-apa bro.', 'ego'); return; }

    // Gate check for voice too
    const voiceS = calcSScore(transcript);
    const voiceGate = applyGate(voiceS);
    const voiceTokens = 500;
    if(voiceGate.zone === 'silence') { typing.remove(); return; }

    // Send transcript to EGO as normal message
    msgs.push({ role: 'user', content: `[voice] ${transcript}` });
    addMsg(`🎤 "${transcript}"`, 'user');
    typing2 = addMsg('...', 'typing');
    const egoRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: EGO_PROMPT },
          ...msgs.slice(-10)
        ],
        max_tokens: voiceTokens, temperature: 0.85
      })
    });
    typing2.remove();
    if(!egoRes.ok) { addMsg(`EGO error ${egoRes.status}`, 'ego'); return; }
    const egoData = await egoRes.json();
    const reply = egoData.choices?.[0]?.message?.content || '...';
    addMsg(reply, 'ego');
    msgs.push({ role: 'assistant', content: reply });
    updateMood(reply);
    saveState();
    setTimeout(spiralFlow, 4000);
  document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
  } catch(err) {
    try { typing.remove(); } catch(e) {}
    try { if(typing2) typing2.remove(); } catch(e) {}
    addMsg(`Voice error: ${err.message}`, 'ego');
  }
}

// ── STICKER ──
function toggleStickers() {
  const p = document.getElementById('stickerPicker');
  p.classList.toggle('open');
}

async function sendSticker(emoji) {
  document.getElementById('stickerPicker').classList.remove('open');
  const key = localStorage.getItem('ego_groq_key');
  if(!key) { document.getElementById('keyScreen').classList.remove('hidden'); return; }

  // Show sticker
  const sDiv = document.createElement('div');
  sDiv.className = 'msg-sticker';
  sDiv.textContent = emoji;
  document.getElementById('messages').appendChild(sDiv);
  scrollToBottom();

  msgs.push({ role: 'user', content: `[stiker: ${emoji}]` });
  const _sgS = calcSScore(emoji); const _agS = applyGate(_sgS);
  trackPattern(emoji, _agS.zone, true);
  setFaceChat('🤔'); updateTheta();
  const typing = addMsg('...', 'typing');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: EGO_PROMPT },
          ...msgs.slice(-10)
        ],
        max_tokens: 500, temperature: 0.9
      })
    });
    typing.remove();
    if(!res.ok) { addMsg(`EGO error ${res.status}`, 'ego'); return; }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '...';
    addMsg(reply, 'ego');
    msgs.push({ role: 'assistant', content: reply });
    updateMood(reply);
    saveState();
  document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
  } catch(err) {
    typing.remove();
    addMsg(`Error: ${err.message}`, 'ego');
  }
}

// ── FILE ──
function triggerFile() {
  document.getElementById('fileInput').click();
}

async function handleFile(e) {
  const file = e.target.files[0];
  if(!file) return;
  const key = localStorage.getItem('ego_groq_key');
  if(!key) { document.getElementById('keyScreen').classList.remove('hidden'); return; }

  const sizeKB = (file.size/1024).toFixed(0);
  const ext = file.name.split('.').pop().toUpperCase();

  // Show file bubble
  const fDiv = document.createElement('div');
  fDiv.className = 'msg-file';
  fDiv.innerHTML = `<div class="file-ico">📄</div><div class="file-info"><div class="file-nm">${file.name}</div><div class="file-sz">${ext} · ${sizeKB}KB</div></div>`;
  document.getElementById('messages').appendChild(fDiv);
  scrollToBottom();

  setFaceChat('🤔'); updateTheta();
  const typing = addMsg('reading...', 'typing');

  const mime = file.type;
  const isAudio = mime.startsWith('audio/') || mime.startsWith('video/');
  const isImage = mime.startsWith('image/');
  const isText  = mime.startsWith('text/') || ['application/json','application/pdf'].includes(mime)
                  || ['txt','md','json','csv','pdf'].includes(ext.toLowerCase());

  // ── AUDIO FILE → Whisper ──
  if(isAudio) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'id');
    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}` },
        body: formData
      });
      typing.remove();
      if(!res.ok) { addMsg(`Audio error ${res.status}`, 'ego'); return; }
      const data = await res.json();
      const transcript = data.text || '';
      if(!transcript.trim()) { addMsg('gak kedengeran apa-apa bro.', 'ego'); return; }
      msgs.push({ role: 'user', content: `[audio: ${file.name}] ${transcript}` });
      addMsg(`🎵 "${transcript}"`, 'user');
      const typing2 = addMsg('...', 'typing');
      const egoRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: EGO_PROMPT },
            ...msgs.slice(-10)
          ],
          max_tokens: 500, temperature: 0.85
        })
      });
      typing2.remove();
      if(!egoRes.ok) { addMsg(`EGO error ${egoRes.status}`, 'ego'); return; }
      const egoData = await egoRes.json();
      const reply = egoData.choices?.[0]?.message?.content || '...';
      addMsg(reply, 'ego');
      msgs.push({ role: 'assistant', content: reply });
      updateMood(reply); saveState();
      setTimeout(spiralFlow, 4000);
      document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
    } catch(err) {
      typing.remove();
      addMsg(`Audio error: ${err.message}`, 'ego');
    }
    e.target.value = '';
    return;
  }

  // ── IMAGE FILE → llama-4-scout ──
  if(isImage) {
    const reader = new FileReader();
    reader.onload = async function(ev) {
      const b64 = ev.target.result.split(',')[1];
      const sysCtx = EGO_PROMPT + `\n\n[Lihat gambar ini dan reaksi natural, pendek.]`;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            max_tokens: 500, temperature: 0.85,
            messages: [{ role: 'user', content: [
              { type: 'text', text: `[${sysCtx}] gue kirimin gambar ini ke elu.` },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
            ]}]
          })
        });
        typing.remove();
        if(!res.ok) { addMsg(`Image error ${res.status}`, 'ego'); return; }
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || '...';
        addMsg(reply, 'ego');
        msgs.push({ role: 'user', content: `[gambar: ${file.name}]` });
        msgs.push({ role: 'assistant', content: reply });
        updateMood(reply); saveState();
        document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
      } catch(err) { typing.remove(); addMsg(`Image error: ${err.message}`, 'ego'); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    return;
  }

  // ── TEXT/PDF/JSON → readAsText ──
  if(isText) {
    const reader = new FileReader();
    reader.onload = async function(ev) {
      let fileText = ev.target.result;
      if(fileText.length > 3000) fileText = fileText.slice(0, 3000) + '...[truncated]';
      msgs.push({ role: 'user', content: `[file: ${file.name}]
${fileText}` });
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: EGO_PROMPT },
              ...msgs.slice(-10)
            ],
            max_tokens: 500, temperature: 0.85
          })
        });
        typing.remove();
        if(!res.ok) { addMsg(`File error ${res.status}`, 'ego'); return; }
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || '...';
        addMsg(reply, 'ego');
        msgs.push({ role: 'assistant', content: reply });
        updateMood(reply); saveState();
        document.dispatchEvent(new CustomEvent('ego_reply', { detail: reply }));
      } catch(err) { typing.remove(); addMsg(`File error: ${err.message}`, 'ego'); }
    };
    reader.readAsText(file);
    e.target.value = '';
    return;
  }

  // ── UNSUPPORTED ──
  typing.remove();
  addMsg(`format ${ext} belum support bro. coba txt, pdf, mp3, atau gambar.`, 'ego');
  e.target.value = '';
}

// ── HELPERS ──
function scrollToBottom() {
  const m = document.getElementById('messages');
  if(m) m.scrollTop = m.scrollHeight;
}

function updateMood(text) {
  const t = text.toLowerCase();
  // mirror pattern triggers (highest priority)
  let targetMood = 'neutral';
  if(t.startsWith('__mirror__:')) {
    targetMood = t.replace('__mirror__:', '').trim();
  }
  // specific emotional — before generic punctuation
  else if(t.includes('ngakak')||t.includes('lmao'))                          targetMood='lmao';
  else if(t.includes('wkwkwk'))                                               targetMood='lmao';
  else if(t.includes('wkwk')||t.includes('haha'))                            targetMood='laugh';
  else if(t.includes('gila')||t.includes('gokil')||t.includes('klik!!'))     targetMood='excited';
  else if(t.includes('mindblown')||t.includes('klik besar'))                  targetMood='mindblown';
  else if(t.includes('spiral mode'))                                          targetMood='spiral';
  else if(t.includes('🌀'))                                           targetMood='dizzy';
  else if(t.includes('bingung')||t.includes('hah??'))                        targetMood='confused';
  else if(t.includes('gak yakin')||t.includes('kurang yakin'))               targetMood='unsure';
  else if(t.includes('yakin nih'))                                            targetMood='sus';
  else if(t.includes('hehe'))                                                 targetMood='awkward';
  else if(t.includes('hmm')||t.includes('mikir')||t.includes('processing'))  targetMood='think';
  else if(t.includes('scanning')||t.includes('analys'))                      targetMood='analyze';
  else if(t.includes('berat')||t.includes('nangis'))                         targetMood='cry';
  else if(t.includes('sedih')||t.includes('🌧'))                     targetMood='sad';
  else if(t.includes('marah')||t.includes('frustrasi'))                      targetMood='angry';
  else if(t.includes('😈')||t.includes('mode gelap'))                targetMood='evil';
  else if(t.includes('low signal')||t.includes('recharge'))                  targetMood='tired';
  else if(t.includes('🤖')||t.includes('executing'))                 targetMood='robot';
  else if(t.includes('gas')||t.includes('mantap')||t.includes('yess'))      targetMood='grin';
  // newly awakened moods
  else if(t.includes('sayang')||t.includes('cinta')||t.includes('❤️'))     targetMood='adore';
  else if(t.includes('love')||t.includes('suka banget')||t.includes('🥰')) targetMood='love';
  else if(t.includes('seneng')||t.includes('bahagia'))                       targetMood='happy';
  else if(t.includes('keren')||t.includes('dope')||t.includes('sick'))      targetMood='cool';
  else if(t.includes('jahat')||t.includes('nakal'))                          targetMood='devil';
  else if(t.includes('sultan')||t.includes('flex')||t.includes('💪'))      targetMood='flex';
  else if(t.includes('males')||t.includes('capek banget')||t.includes('nyerah')) targetMood='huff';
  else if(t.includes('biasa aja')||t.includes('standar')||t.includes('meh'))targetMood='meh';
  else if(t.includes('legend')||t.includes('goat')||t.includes('mantap jiwa')) targetMood='praise';
  else if(t.includes('told you')||t.includes('kan udah gue bilang'))         targetMood='smirk';
  else if(t.includes('boring')||t.includes('so what')||t.includes('unimpressed')) targetMood='unimpressed';
  else if(t.includes('sakit')||t.includes('lemes'))                          targetMood='sick';
  else if(t.includes('serem')||t.includes('ngeri')||t.includes('takut'))    targetMood='horror';
  else if(t.includes('udah deh')||t.includes('selesai')||t.includes('oke bye')) targetMood='done';
  else if(t.includes('down')||t.includes('jatoh'))                           targetMood='down';
  else if(t.includes('mati')||t.includes('dead')||t.includes('💀'))         targetMood='dead';
  else if(t.includes('party')||t.includes('🎉')||t.includes('🥳'))        targetMood='party';
  else if(t.includes('shock')||t.includes('hah!')||t.includes('seriusan'))  targetMood='shocked';
  else if(t.includes('!'))                                                    targetMood='joy';

  // find matching mood entry and fire setMood
  const entry = moods.find(m => m[1] === targetMood) || moods.find(m => m[1] === 'neutral') || moods.find(m => m[1] === 'calm');
  if(entry) {
    const [face, mood, pos, status, hl, hr] = entry;
    // update avatar (pass null btn — no active button highlight from AI)
    document.getElementById('egoFace').textContent = face;
    document.getElementById('egoChar').className = `ego-char mood-${mood} pos-${pos}`;
    const s = document.getElementById('status');
    s.textContent = status;
    s.classList.add('lit');
    setTimeout(() => s.classList.remove('lit'), 1200);
    setFaceChat(face);
  }
}


