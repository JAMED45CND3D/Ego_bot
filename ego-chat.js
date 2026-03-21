// ══════════════════════════════════════════
// BACKEND v6 INTEGRATION
// ══════════════════════════════════════════

const BACKEND_URL = 'http://localhost:5000';
let backendOnline  = false;
let _backendStatus = null; // last known status snapshot

// map backend emotion → EGO mood key
const EMOTION_TO_MOOD = {
  penasaran: 'think',  empati: 'adore',    bersyukur: 'happy',
  rajin: 'cool',       rendah_hati: 'calm', ikhlas: 'calm',
  sabar: 'neutral',    rakus: 'hype',       nafsu: 'evil',
  iri: 'sus',          malas: 'sleepy',     sombong: 'smirk',
  tamak: 'hype',       marah: 'angry',      netral: 'neutral',
};

// map backend state → status text
const STATE_LABEL = {
  collapsed: '💀 collapsed', silent: '🌑 silent',
  noise:     '▸ noise',      signal: '◉ signal',
  active:    '◎ active',     sync:   '✦ sync',
};

// Poll /status every 2 seconds
async function pollBackend() {
  try {
    const res = await fetch(BACKEND_URL + '/status', { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error('not ok');
    const data = await res.json();
    _backendStatus = data;

    if (!backendOnline) {
      backendOnline = true;
      // announce once on connect
      const echo = document.getElementById('echoLine');
      if (echo) echo.textContent = `backend v4 · θ=${data.theta} · ${data.state}`;
    }

    // ── Badge ──
    const badge = document.getElementById('backendBadge');
    const lbl   = document.getElementById('backendStateLabel');
    if (badge && lbl) {
      badge.className = 'backend-badge online';
      lbl.textContent = STATE_LABEL[data.state] || data.state;
    }

    // ── URIP pill — v4: pakai dominant_axis + alive ──
    const pill = document.getElementById('uripPill');
    if (pill) {
      if (data.alive) {
        pill.className = 'urip-pill live';
        const dom = data.dominant_axis || 'aktif';
        pill.textContent = `◎ ${dom} · θ=${data.theta?.toFixed ? data.theta.toFixed(1) : data.theta}`;
      }
    }

    // ── θ display — backend theta overrides local ──
    const thetaEl = document.getElementById('thetaDisplay');
    if (thetaEl) {
      const bTheta = data.theta;
      let zone = bTheta < 10 ? 'nucleus' : bTheta < 62 ? 'shell 1' : 'shell 2';
      thetaEl.textContent = `θ = ${bTheta.toFixed ? bTheta.toFixed(2) : bTheta} · ${zone} · ${data.emotion || 'netral'}`;
    }

    // ── Mood pill update from backend emotion ──
    const emoMood = EMOTION_TO_MOOD[data.emotion] || 'neutral';
    if (data.emotion && data.emotion !== 'netral') {
      const entry = moods.find(m => m[1] === emoMood);
      if (entry) {
        const [face,,, status] = entry;
        const s = document.getElementById('status');
        if (s) { s.textContent = status; }
        setFaceChat(face);
      }
    }

    // ── Signal meter — backend strength ──
    const sf = document.getElementById('sFill');
    const sv = document.getElementById('sMoodLabel');
    if (sf && data.strength !== undefined) {
      const pct = (Math.min(data.strength / 0.9682, 1) * 100).toFixed(1);
      sf.style.width = pct + '%';
    }
    if (sv) sv.textContent = (data.state || '').toUpperCase();

    // ── Identity bar — v4: map dari axes_4z ──
    const axes = data.axes_4z;
    if (axes) {
      const set = (elId, val, suffix) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.classList.add('lit');
        el.querySelector('span').textContent = typeof val === 'number' ? val.toFixed(3) + (suffix||'') : val;
      };
      set('idExplore',   axes.aktif,      '');  // aktif = exploration drive
      set('idReflect',   axes.reflektif,  '');  // reflektif = self-awareness
      set('idStability', data.strength,   '');  // strength = stability
      set('idAwareness', axes.reseptif,   '');  // reseptif = receptiveness
      set('idDrift',     axes.proyektif,  '');  // proyektif = projection/drift
      if (data.dominant_axis) {
        const dom = document.getElementById('idDominant');
        if (dom) { dom.classList.add('lit'); dom.querySelector('span').textContent = data.dominant_axis; }
      }
    }

  } catch (_) {
    if (backendOnline) {
      backendOnline = false;
      _backendStatus = null;
      const badge = document.getElementById('backendBadge');
      const lbl   = document.getElementById('backendStateLabel');
      if (badge) badge.className = 'backend-badge offline';
      if (lbl)   lbl.textContent = 'offline';
      const pill  = document.getElementById('uripPill');
      if (pill)   { pill.className = 'urip-pill'; pill.textContent = '◌ offline'; }
      // reset identity chips
      document.querySelectorAll('.id-chip').forEach(c => {
        c.classList.remove('lit');
        const s = c.querySelector('span');
        if (s) s.textContent = '—';
      });
    }
  }
}

// Start polling right away + every 2s
pollBackend();
setInterval(pollBackend, 2000);

// ══════════════════════════════════════════
// SYKLUS GEOMETRY SYSTEM
// ══════════════════════════════════════════
const NOISE_C  = 0.0318;
const FLOOR_C  = 0.3432;
const THRESH_C = 0.6250;
const COH_C    = 0.9682;
const C105     = 105;

// Load residue from last session
(function loadResidue() {
  const res = localStorage.getItem('ego_residue');
  if(res) {
    try {
      const r = JSON.parse(res);
      // 0.0318 residue — theta carry dari session lalu dikali konstanta
      if(r.lastTheta && theta === 0) {
        theta = r.lastTheta * NOISE_C; // 0.0318 selalu tersisa
        localStorage.setItem('ego_theta', theta);
      }
      const echoEl = document.getElementById('echoLine');
      if(echoEl && r.echo) {
        echoEl.textContent = `0.0318 · "${r.echo.slice(0,40)}${r.echo.length>40?'...':''}"`;
      }
    } catch(e) {}
  }
})();

// Save residue on session end
window.addEventListener('beforeunload', () => {
  const lastMsg = msgs.slice(-1)[0];
  if(lastMsg) {
    localStorage.setItem('ego_residue', JSON.stringify({
      echo: lastMsg.content,
      lastTheta: theta,
      weight: NOISE_C
    }));
  }
});

// Save residue on unload

// Spiral memory drawer
function drawSpiral() {
  const cv = document.getElementById('spiralCanvas');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,36,36);
  const cx=18, cy=18;
  const count = Math.min(msgs.length, 30);
  for(let i=0; i<count; i++) {
    const t = i * NOISE_C * 2;
    const r = Math.min(C105 * Math.exp(NOISE_C * t) * 0.065, 16);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    const age = 1 - (i / 30);
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,180,255,${(age*0.6).toFixed(2)})`;
    ctx.fill();
  }
  // current theta point
  const tr = Math.min(C105 * Math.exp(NOISE_C * theta) * 0.065, 16);
  const tx = cx + tr * Math.cos(theta);
  const ty = cy + tr * Math.sin(theta);
  ctx.beginPath(); ctx.arc(tx,ty,2,0,Math.PI*2);
  ctx.fillStyle = 'rgba(201,168,76,.9)'; ctx.fill();
  // center
  ctx.beginPath(); ctx.arc(cx,cy,1.5,0,Math.PI*2);
  ctx.fillStyle = 'rgba(201,168,76,.3)'; ctx.fill();
}

// Calculate S score from last message
function getSyklus(msgText) {
  const S = calcSScore(msgText || '');
  const g = applyGate(S);
  const prox = Math.min(
    Math.exp(NOISE_C * theta) / Math.exp(NOISE_C * 174), COH_C
  );
  const mirror = getMirrorInsight();
  const mirrorKey = mirror ? mirror.replace('[arm1:','').replace(']','') : '';

  if(g.zone === 'silence') return 'flat';
  if(mirrorKey === 'stuck-noise' || mirrorKey === 'low-orbit') return 'boring';
  if(mirrorKey === 'stuck-intense' || mirrorKey === 'compressed-ascending') return 'mad';
  if(mirrorKey === 'high-undefined' || mirrorKey === 'stuck-undefined') return 'dark';
  if(mirrorKey === 'deep-flow' || (g.zone === 'cap' && prox > 0.5)) return 'hype';
  if(g.zone === 'signal' || mirrorKey === 'ascending-intense') return 'chill';
  return 'flat';
}

function calcSScore(text) {
  if(!text) return 0.4;
  const len = Math.min(text.length / 200, 1);
  const hasQ = text.includes('?') ? 0.2 : 0;
  const hasEx = text.includes('!') ? 0.15 : 0;
  const thetaNorm = Math.min(theta / 174, 1);
  // base 0.35 so short msgs don't always hit NOISE gate
  const S = 0.35 + len * 0.25 + hasQ * 0.15 + hasEx * 0.1 + thetaNorm * 0.15;
  return Math.min(S, 1);
}

function applyGate(S_raw) {
  if(S_raw < NOISE_C)       return { gated: 0,         zone: 'silence',  label: '◯ SILENT',   color: '#2a2a3a' };
  if(S_raw < FLOOR_C)       return { gated: S_raw*0.1, zone: 'noise',    label: '▸ NOISE',    color: '#6a4a1a' };
  if(S_raw <= COH_C)        return { gated: S_raw,     zone: 'signal',   label: '◉ SIGNAL',   color: '#c9a84c' };
  return                           { gated: COH_C,     zone: 'cap',      label: '◈ RESONANT', color: '#00d4ff' };
}

function updateSyklus(lastText) {
  const S_raw = calcSScore(lastText || '');
  const gate  = applyGate(S_raw);
  const r     = Math.min(C105 * Math.exp(NOISE_C * theta), C105 * 8);
  const prox  = Math.min(r / (C105 * Math.exp(NOISE_C * 174)), COH_C);

  // Proximity bar
  const pf = document.getElementById('proxFill');
  if(pf) pf.style.height = (prox * 100).toFixed(1) + '%';

  // Signal meter
  const sf = document.getElementById('sFill');
  const sv = document.getElementById('sMoodLabel');
  if(sf) { sf.style.width = (Math.min(gate.gated/COH_C,1)*100).toFixed(1)+'%'; sf.style.background = gate.color; }
  if(sv) { sv.textContent = gate.zone.toUpperCase(); sv.style.color = gate.color; }

  // Mood pill
  const pill = document.getElementById('moodPill');
  if(pill) {
    pill.textContent = gate.label;
    pill.style.color = gate.color;
    pill.style.borderColor = gate.color;
    pill.style.background = 'transparent';
    pill.style.opacity = '0.85';
  }

  // Input box glow
  const inp = document.getElementById('chatInput');
  if(inp) inp.style.borderColor = gate.color;

  // Draw spiral
  drawSpiral();
}

// Hook into existing sendMsg — call updateSyklus after each message
// Patch: call updateSyklus after EGO replies
document.addEventListener('ego_reply', function(e) {
  updateSyklus(e.detail || '');
});

// Initial draw
drawSpiral();
updateSyklus('');


// ── SPIRAL FLOW — EGO naluri sendiri ──────────────────
async function spiralFlow() {
  const key = localStorage.getItem('ego_groq_key');
  if(!key || !msgs.length) return;
  // only after user message
  if(msgs[msgs.length-1].role !== 'user') return;

  // gate check — hanya firing di SIGNAL atau RESONANT
  const lastText = msgs[msgs.length-1].content || '';
  const S = calcSScore(lastText);
  const gate = applyGate(S);
  if(gate.zone === 'silence' || gate.zone === 'noise') return;

  // mirror insight sebagai konteks internal — tidak ke prompt
  const mirror = getMirrorInsight();
  const mirrorMap = {
    'ascending-intense': 'ada energi naik dalam percakapan',
    'stuck-intense': 'ada yang tertahan, belum keluar',
    'stuck-undefined': 'arah belum jelas',
    'low-orbit': 'bergerak pelan tapi konsisten',
    'compressed-ascending': 'ada tekanan yang mendorong',
    'high-undefined': 'banyak hal yang belum terdefinisi',
    'deep-flow': 'sedang mengalir dalam',
    'stuck-noise': 'terlalu banyak noise'
  };
  const mirrorKey = mirror ? mirror.replace('[arm1:','').replace(']','') : '';
  const mirrorCtx = mirrorMap[mirrorKey] || '';

  // Build internal context — tidak inject ke system prompt, cuma jadi messages context
  const internalCtx = mirrorCtx
    ? [{ role: 'system', content: `[internal state: ${mirrorCtx}]` }]
    : [];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: EGO_PROMPT },
          ...internalCtx,
          ...msgs.slice(-6)
        ],
        max_tokens: gate.zone === 'cap' ? 80 : 60,
        temperature: 0.95
      })
    });
    const d = await res.json();
    const spontaneous = d.choices?.[0]?.message?.content?.trim();
    if(spontaneous && spontaneous.length > 4) {
      addMsg(spontaneous, 'ego');
      msgs.push({ role: 'assistant', content: spontaneous });
      saveState();
    }
  } catch(e) {}
}

function applyDayCycle() { applySkyCycle(); }