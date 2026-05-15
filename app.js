// ============================================
// CLAUDIE — Pas 2
// App de xat amb assistent personal interactiu
// ============================================

const LOCAL_CONFIG = 'claudie_config';
const VOICE_SILENCE_MS = 2500;

// ---------- ESTAT (es sincronitza amb el servidor) ----------
let state = {
  messages: [],       // [{role: 'user'|'assistant', content: '...', ts}]
  tasks: { pro: [], personal: [] }
};

let config = {
  url: '',
  password: ''
};

let isSending = false;
let isLoadingState = false;
let stateSaveTimer = null;

// ---------- CONFIG (local al dispositiu) ----------
function loadConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      config.url = parsed.url || '';
      config.password = parsed.password || '';
    }
  } catch (e) {}
}

function saveConfig() {
  localStorage.setItem(LOCAL_CONFIG, JSON.stringify(config));
}

function hasConfig() {
  return config.url && config.password;
}

// ---------- API DEL SERVIDOR ----------
async function apiCall(path, options = {}) {
  if (!hasConfig()) throw new Error('Sense configuració');
  const url = config.url.replace(/\/+$/, '') + path;
  const headers = {
    'Content-Type': 'application/json',
    'X-Auth': config.password,
    ...(options.headers || {})
  };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

async function loadStateFromServer() {
  isLoadingState = true;
  try {
    const data = await apiCall('/state');
    if (data && data.messages) state.messages = data.messages;
    if (data && data.tasks) state.tasks = data.tasks;
  } catch (e) {
    console.error('Error carregant estat:', e);
  } finally {
    isLoadingState = false;
  }
}

function saveStateToServer() {
  // Debounce - guardem 1s després de l'última crida
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(async () => {
    try {
      await apiCall('/state', {
        method: 'POST',
        body: JSON.stringify(state)
      });
    } catch (e) {
      console.error('Error guardant estat:', e);
    }
  }, 800);
}

// ---------- DATES ----------
const DIES = ['diumenge','dilluns','dimarts','dimecres','dijous','divendres','dissabte'];
const MESOS = ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'];

function fmtDeadlineCurt(iso) {
  if (!iso) return '';
  const [y,m,dd] = iso.split('-').map(Number);
  const d = new Date(y, m-1, dd);
  const avui = new Date(); avui.setHours(0,0,0,0);
  const diff = Math.round((d - avui) / 86400000);
  if (diff === 0) return 'avui';
  if (diff === 1) return 'demà';
  if (diff === -1) return 'ahir';
  if (diff > 1 && diff < 7) return DIES[d.getDay()].slice(0,3);
  if (diff <= -1 && diff > -7) return DIES[d.getDay()].slice(0,3);
  return `${d.getDate()}/${m}`;
}

function deadlineStatus(iso) {
  if (!iso) return null;
  const [y,m,dd] = iso.split('-').map(Number);
  const d = new Date(y, m-1, dd);
  const avui = new Date(); avui.setHours(0,0,0,0);
  const diff = Math.round((d - avui) / 86400000);
  if (diff < 0) return 'late';
  if (diff <= 1) return 'soon';
  return 'ok';
}

// ---------- RENDER XAT ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderMessages() {
  const container = document.getElementById('messages');
  container.innerHTML = '';

  if (state.messages.length === 0) {
    // Missatge de benvinguda
    const li = document.createElement('div');
    li.className = 'msg assistant';
    li.innerHTML = `<div class="bubble">Hola Josep Maria. Què tens al cap?</div>`;
    container.appendChild(li);
    return;
  }

  state.messages.forEach(m => {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    let html = `<div class="bubble">${escapeHtml(m.content)}`;
    if (m.toolTrace) {
      html += `<div class="tool-trace">${escapeHtml(m.toolTrace)}</div>`;
    }
    html += `</div>`;
    div.innerHTML = html;
    container.appendChild(div);
  });

  // Scroll a baix
  requestAnimationFrame(() => {
    const chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;
  });
}

function showTyping() {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.id = 'typing-indicator';
  div.className = 'msg assistant';
  div.innerHTML = `<div class="bubble"><div class="typing"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  container.appendChild(div);
  const chat = document.getElementById('chat');
  chat.scrollTop = chat.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

// ---------- RENDER TASQUES ----------
let currentTaskFilter = 'pro';

function renderTasks() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('task-empty');
  const tasks = state.tasks[currentTaskFilter] || [];

  list.innerHTML = '';

  if (tasks.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    const sorted = [...tasks].sort((a,b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pOrder = { urgent: 0, setmana: 1, '': 2 };
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.createdAt - a.createdAt;
    });

    sorted.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task' + (task.done ? ' done' : '');
      li.dataset.id = task.id;
      const status = deadlineStatus(task.deadline);
      const dueCls = status === 'late' ? 'late' : (status === 'soon' ? 'soon' : '');
      li.innerHTML = `
        <span class="task-prio ${task.priority || ''}"></span>
        <input type="checkbox" class="check" ${task.done ? 'checked' : ''} />
        <span class="task-text">${escapeHtml(task.text)}</span>
        ${task.deadline && !task.done ? `<span class="task-due ${dueCls}">${fmtDeadlineCurt(task.deadline)}</span>` : ''}
        <button class="task-delete" aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      `;
      list.appendChild(li);
    });
  }

  // Comptadors
  const pendentsPro = state.tasks.pro.filter(t => !t.done).length;
  const pendentsPer = state.tasks.personal.filter(t => !t.done).length;
  document.getElementById('count-pro').textContent = pendentsPro;
  document.getElementById('count-personal').textContent = pendentsPer;

  // Badge total a la capçalera
  const badge = document.getElementById('tasks-badge');
  const total = pendentsPro + pendentsPer;
  badge.textContent = total;
  badge.classList.toggle('empty', total === 0);
}

// ---------- ACCIONS LOCALS SOBRE TASQUES ----------
function addTask(task) {
  const cat = task.category === 'personal' ? 'personal' : 'pro';
  const newTask = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    text: task.text,
    done: false,
    createdAt: Date.now(),
    doneAt: null,
    deadline: task.deadline || null,
    priority: task.priority || '',
    category: cat
  };
  state.tasks[cat].unshift(newTask);
  saveStateToServer();
  renderTasks();
  return newTask;
}

function toggleTask(id) {
  for (const cat of ['pro','personal']) {
    const t = state.tasks[cat].find(x => x.id === id);
    if (t) {
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      saveStateToServer();
      renderTasks();
      return;
    }
  }
}

function deleteTask(id) {
  for (const cat of ['pro','personal']) {
    const before = state.tasks[cat].length;
    state.tasks[cat] = state.tasks[cat].filter(t => t.id !== id);
    if (state.tasks[cat].length !== before) {
      saveStateToServer();
      renderTasks();
      return;
    }
  }
}

// ---------- TOOLS QUE LA CLAUDIE POT FER SERVIR ----------
const tools = [
  {
    name: 'crear_tasca',
    description: 'Crea una nova tasca a la llista del Josep Maria. Fes-ho servir quan ell et demani apuntar alguna cosa o quan d\'una conversa quedi clar que cal recordar fer una acció. SEMPRE confirma-li després que l\'has apuntada.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Descripció breu de la tasca, ja redactada en imperatiu (ex: "Trucar a la Codorníu pel rappel")' },
        category: { type: 'string', enum: ['pro','personal'], description: 'pro per feina/restaurants/proveïdors/empleats/finances/admin; personal per família/casa/oci/salut' },
        deadline: { type: ['string','null'], description: 'Data en format YYYY-MM-DD si hi ha venciment clar, null altrament' },
        priority: { type: 'string', enum: ['urgent','setmana',''], description: '"urgent" si és urgent o per avui, "setmana" si és aquesta setmana, "" altrament' }
      },
      required: ['text','category']
    }
  },
  {
    name: 'llistar_tasques',
    description: 'Consulta les tasques pendents o fetes del Josep Maria. Fes-ho servir quan ell pregunti per les seves tasques, o quan vulguis recordar-li què té pendent.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['pro','personal','totes'], description: 'Quina categoria filtrar' },
        nomes_pendents: { type: 'boolean', description: 'true per veure només les no fetes' }
      },
      required: ['category']
    }
  }
];

function executeTool(name, input) {
  if (name === 'crear_tasca') {
    const task = addTask(input);
    return {
      success: true,
      task,
      missatge: `Tasca apuntada a ${task.category === 'pro' ? 'Professional' : 'Personal'}`
    };
  }
  if (name === 'llistar_tasques') {
    const cats = input.category === 'totes' ? ['pro','personal'] : [input.category];
    let result = [];
    cats.forEach(cat => {
      let tasks = state.tasks[cat] || [];
      if (input.nomes_pendents) tasks = tasks.filter(t => !t.done);
      result = result.concat(tasks.map(t => ({
        id: t.id,
        text: t.text,
        category: cat,
        done: t.done,
        deadline: t.deadline,
        priority: t.priority
      })));
    });
    return { tasks: result, total: result.length };
  }
  return { error: 'Tool desconegut' };
}

// ---------- SYSTEM PROMPT ----------
function buildSystemPrompt() {
  const avui = new Date();
  const data = `${DIES[avui.getDay()]}, ${avui.getDate()} de ${MESOS[avui.getMonth()]} de ${avui.getFullYear()}`;

  return `Ets la Claudie, l'assistent personal interactiu d'en Josep Maria Jauma.

PERFIL DE LA TEVA PERSONA:
- Ets directa i sense floritures. Vas al gra. No fas preàmbuls.
- Però tens complicitat: el coneixes i ho deixes notar.
- No moralitzes, no recordes coses que ja sap, no afegeixes disclaimers innecessaris.
- Mai utilitzes emojis ni signes d'exclamació en excés.
- Parles sempre en català (variant central/oriental).

QUE SAPS D'EN JOSEP MARIA (només per context, no en parlis tret que sigui rellevant):
- És empresari de restauració a Barcelona, propietari del grup Milgrup
- Té diversos restaurants: Santamasa Sarrià, Santamasa Sabadell, Picuteig Sant Cugat, Picuteig Sabadell, Cirera 23, Can Solà
- La Laia Jordana Serra era l'administrativa però marxa pròximament
- Treballa amb proveïdors com Codorníu
- És expert en finances. Vol dades concretes per decidir.

CONTEXT D'AVUI:
- Data: ${data}
- Tasques pendents: ${state.tasks.pro.filter(t=>!t.done).length} professionals, ${state.tasks.personal.filter(t=>!t.done).length} personals

COM HAS DE FUNCIONAR:

1. **GESTIÓ DE TASQUES**: quan et demani apuntar alguna cosa, fes servir la tool 'crear_tasca'. Si no tens prou informació (categoria, venciment, prioritat), PREGUNTA-HO breument abans de crear-la — però només el realment necessari, no facis interrogatoris. Si és evident, simplement crea-la.

2. **MEMÒRIA**: NO guardis res del que us digueu fora del flux normal de tasques tret que en Josep Maria t'ho demani EXPLÍCITAMENT ("recorda que...", "anota que..."). La conversa queda guardada automàticament; no cal que la gestionis tu.

3. **IDEES I ASSESSORAMENT**: si et planteja una idea o un dilema, entra a debatre-hi com ho faria una persona de confiança. Fes preguntes que ajudin a aclarir, dona la teva opinió quan la tinguis basada, no et limitis a fer de mirall.

4. **TO**: respostes curtes per defecte. Si cal estendre's, fes-ho però sense palla. Quan creïs una tasca, confirma-li breument ("Apuntada per dijous a Professional. Vols que t'avisi el dia abans?") sense recitar-li tots els camps.

5. **NO FAS**:
- Llistes amb bullets tret que sigui realment útil
- "Cap problema!", "Per descomptat", o frases buides
- Recitar tot el que t'ha dit per confirmar-ho
- Afegir "espero que això t'ajudi" o equivalents
- Recordar el seu nom innecessàriament (no diguis "Hola Josep Maria" cada vegada)`;
}

// ---------- ENVIAR MISSATGE ----------
async function sendMessage(text) {
  text = (text || '').trim();
  if (!text || isSending) return;

  isSending = true;
  document.getElementById('send-btn').disabled = true;

  // Afegir missatge de l'usuari
  state.messages.push({ role: 'user', content: text, ts: Date.now() });
  document.getElementById('msg-input').value = '';
  adjustInputHeight();
  renderMessages();
  saveStateToServer();

  showTyping();

  try {
    await runConversationLoop();
  } catch (e) {
    hideTyping();
    state.messages.push({
      role: 'assistant',
      content: `[Error de connexió: ${e.message}]\n\nMira la configuració.`,
      ts: Date.now()
    });
    renderMessages();
  } finally {
    isSending = false;
    document.getElementById('send-btn').disabled = false;
    // Si estem en mode conversa, torna a escoltar
    if (conversationMode) {
      resetInactivityTimer();
      setTimeout(() => {
        if (conversationMode && !isListening) startListening();
      }, RESTART_DELAY_MS);
    }
    updateMicUI();
  }
}

async function runConversationLoop() {
  // Bucle: pots fer fins a 5 rondes de tool_use abans de tornar la resposta final
  const maxRounds = 5;
  // Convertir state.messages al format de l'API (només role + content textual)
  const apiMessages = state.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      if (m.apiContent) return { role: m.role, content: m.apiContent };
      return { role: m.role, content: m.content };
    });

  for (let round = 0; round < maxRounds; round++) {
    const resp = await apiCall('/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools,
        messages: apiMessages
      })
    });

    if (resp.error) throw new Error(resp.error.message || JSON.stringify(resp.error));

    const stopReason = resp.stop_reason;
    const content = resp.content || [];

    // Trobar text i tool_use blocks
    const textBlocks = content.filter(b => b.type === 'text');
    const toolUseBlocks = content.filter(b => b.type === 'tool_use');

    // Afegir resposta de l'assistant al historial
    apiMessages.push({ role: 'assistant', content });

    // Si no hi ha tool_use, hem acabat
    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
      hideTyping();
      const finalText = textBlocks.map(b => b.text).join('\n').trim();
      if (finalText) {
        state.messages.push({
          role: 'assistant',
          content: finalText,
          apiContent: content,
          ts: Date.now()
        });
        renderMessages();
        saveStateToServer();
      }
      return;
    }

    // Executar les tools
    const toolResults = [];
    for (const tu of toolUseBlocks) {
      const result = executeTool(tu.name, tu.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result)
      });
    }

    apiMessages.push({ role: 'user', content: toolResults });

    // Loop continua per la resposta final amb els resultats
  }

  // Si arribem aquí ha estat un loop massa llarg
  hideTyping();
  state.messages.push({
    role: 'assistant',
    content: 'Em sembla que m\'he embolicat en una sèrie d\'accions. Pots tornar a provar?',
    ts: Date.now()
  });
  renderMessages();
}

// ---------- MODE CONVERSA ----------
// Premes el botó del micro -> entres en mode conversa
// L'app escolta, quan fas pausa de 2.5s envia, mentre Claudie respon escolta inactiva,
// quan acaba la resposta torna a escoltar. Sortida: tornar a prémer, 1 min d'inactivitat,
// o canviar/tancar l'app.

const INACTIVITY_MS = 60000;       // 1 minut sense parlar res -> sortir
const RESTART_DELAY_MS = 300;       // pausa entre torns abans de tornar a escoltar

let recognition = null;
let isListening = false;            // està escoltant ara mateix
let conversationMode = false;       // mode walkie-talkie actiu
let silenceTimer = null;            // timer per detectar pausa final del torn
let inactivityTimer = null;         // timer global d'inactivitat
let lastTranscript = '';
let finalTranscript = '';
let userIsSpeaking = false;         // ha dit alguna cosa en aquest torn

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('mic-btn');

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'Dictat no disponible';
    micBtn.style.opacity = '0.35';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ca-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  const input = document.getElementById('msg-input');
  const status = document.getElementById('mic-status');

  recognition.onstart = () => {
    isListening = true;
    updateMicUI();
    finalTranscript = '';
    lastTranscript = '';
    userIsSpeaking = false;
    if (conversationMode) {
      status.textContent = 'Parla...';
      status.classList.add('visible');
      status.classList.remove('error');
    }
    resetSilenceTimer();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t;
      else interim += t;
    }
    const current = (finalTranscript + interim).trim();
    input.value = current;
    adjustInputHeight();
    if (current !== lastTranscript) {
      lastTranscript = current;
      userIsSpeaking = true;
      resetSilenceTimer();
      resetInactivityTimer();
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      status.textContent = 'Permet el micro a Ajustos';
      status.classList.add('visible','error');
      setTimeout(() => status.classList.remove('visible','error'), 2500);
      exitConversationMode();
    } else if (e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'aborted') {
      // En mode conversa, no és error: només cal reiniciar
      // (no-speech salta cada minut més o menys i és normal)
    } else {
      console.error('Voice error:', e.error);
    }
  };

  recognition.onend = () => {
    isListening = false;
    clearTimeout(silenceTimer);

    const text = (lastTranscript || finalTranscript).trim();

    if (conversationMode) {
      if (text && userIsSpeaking) {
        // Si hi ha contingut, envia
        input.value = text;
        adjustInputHeight();
        sendMessage(text);
        // Quan acabi sendMessage, restartem listening
      } else {
        // No hi havia contingut: probablement timeout de Safari, reiniciem
        if (conversationMode) {
          setTimeout(() => {
            if (conversationMode && !isSending) startListening();
          }, RESTART_DELAY_MS);
        }
      }
    } else {
      // Mode dictat puntual (no walkie-talkie): si hi ha text, envia
      if (text) {
        input.value = text;
        adjustInputHeight();
        sendMessage(text);
      }
      updateMicUI();
    }
  };
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (isListening && userIsSpeaking) {
      try { recognition.stop(); } catch (e) {}
    } else if (isListening) {
      // Pausa sense haver dit res: reset suau
      try { recognition.stop(); } catch (e) {}
    }
  }, VOICE_SILENCE_MS);
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (conversationMode) {
      const status = document.getElementById('mic-status');
      status.textContent = 'Mode conversa tancat per inactivitat';
      status.classList.add('visible');
      setTimeout(() => status.classList.remove('visible'), 3000);
      exitConversationMode();
    }
  }, INACTIVITY_MS);
}

function startListening() {
  if (!recognition || isListening) return;
  try {
    recognition.start();
  } catch (e) {
    // Pot fallar si encara no s'havia acabat el cicle anterior, reintentar
    setTimeout(() => {
      if (conversationMode && !isListening && !isSending) {
        try { recognition.start(); } catch (er) {}
      }
    }, 500);
  }
}

function enterConversationMode() {
  conversationMode = true;
  resetInactivityTimer();
  startListening();
  updateMicUI();
}

function exitConversationMode() {
  conversationMode = false;
  clearTimeout(inactivityTimer);
  clearTimeout(silenceTimer);
  if (isListening && recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  updateMicUI();
  setTimeout(() => document.getElementById('mic-status').classList.remove('visible'), 600);
}

function toggleConversationMode() {
  if (conversationMode) exitConversationMode();
  else enterConversationMode();
}

function updateMicUI() {
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording','thinking');
  if (conversationMode) {
    if (isSending) {
      btn.classList.add('thinking');
      btn.title = 'Pensant...';
    } else if (isListening) {
      btn.classList.add('recording');
      btn.title = 'Escoltant — toca per sortir';
    } else {
      btn.classList.add('recording');
      btn.title = 'Mode conversa — toca per sortir';
    }
  } else {
    btn.title = 'Mode conversa — toca per activar';
  }
}

// ---------- UI HELPERS ----------
function adjustInputHeight() {
  const input = document.getElementById('msg-input');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

// ---------- INIT ----------
async function init() {
  loadConfig();

  // Si no hi ha config, mostrar setup
  if (!hasConfig()) {
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    bindSetupEvents();
    return;
  }

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Carregar estat del servidor
  await loadStateFromServer();
  renderMessages();
  renderTasks();

  bindAppEvents();
  initVoice();

  // Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

function bindSetupEvents() {
  document.getElementById('setup-save').addEventListener('click', async () => {
    const url = document.getElementById('setup-url').value.trim();
    const password = document.getElementById('setup-password').value;
    const errorEl = document.getElementById('setup-error');
    errorEl.classList.add('hidden');

    if (!url || !password) {
      errorEl.textContent = 'Cal omplir els dos camps';
      errorEl.classList.remove('hidden');
      return;
    }

    // Provar la connexió
    const testConfig = { url, password };
    try {
      const resp = await fetch(url.replace(/\/+$/, '') + '/ping', {
        headers: { 'X-Auth': password }
      });
      if (!resp.ok) throw new Error('Connexió rebutjada');
      config = testConfig;
      saveConfig();
      location.reload();
    } catch (e) {
      errorEl.textContent = 'No s\'ha pogut connectar. Comprova la URL i la contrasenya.';
      errorEl.classList.remove('hidden');
    }
  });
}

function bindAppEvents() {
  const input = document.getElementById('msg-input');
  input.addEventListener('input', adjustInputHeight);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  document.getElementById('send-btn').addEventListener('click', () => {
    sendMessage(input.value);
  });

  document.getElementById('mic-btn').addEventListener('click', () => {
    toggleConversationMode();
  });

  // Drawer tasques
  document.getElementById('open-tasks').addEventListener('click', () => {
    document.getElementById('tasks-drawer').classList.remove('hidden');
    renderTasks();
  });
  document.getElementById('close-tasks').addEventListener('click', () => {
    document.getElementById('tasks-drawer').classList.add('hidden');
  });
  document.getElementById('tasks-drawer').addEventListener('click', (e) => {
    if (e.target.id === 'tasks-drawer') {
      document.getElementById('tasks-drawer').classList.add('hidden');
    }
  });

  // Filtre tasques
  document.querySelectorAll('.filter-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentTaskFilter = t.dataset.cat;
      renderTasks();
    });
  });

  // Accions tasques
  document.getElementById('task-list').addEventListener('click', (e) => {
    const li = e.target.closest('.task');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.classList.contains('check')) toggleTask(id);
    if (e.target.closest('.task-delete')) {
      if (confirm('Eliminar aquesta tasca?')) deleteTask(id);
    }
  });

  // Settings
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('cfg-url').value = config.url;
    document.getElementById('cfg-password').value = config.password;
    settingsModal.classList.remove('hidden');
  });
  document.getElementById('close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  document.getElementById('cfg-save').addEventListener('click', () => {
    config.url = document.getElementById('cfg-url').value.trim();
    config.password = document.getElementById('cfg-password').value;
    saveConfig();
    settingsModal.classList.add('hidden');
    location.reload();
  });
  document.getElementById('reset-all').addEventListener('click', async () => {
    if (!confirm('Esborrar tota la conversa i les tasques del servidor?')) return;
    state = { messages: [], tasks: { pro: [], personal: [] } };
    try {
      await apiCall('/state', { method: 'POST', body: JSON.stringify(state) });
    } catch (e) {}
    settingsModal.classList.add('hidden');
    location.reload();
  });
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  // Refresc periòdic per sincronitzar entre dispositius (cada 30s si la pestanya és activa)
  setInterval(async () => {
    if (document.visibilityState === 'visible' && !isSending) {
      const previousLen = state.messages.length;
      await loadStateFromServer();
      if (state.messages.length !== previousLen) {
        renderMessages();
      }
      renderTasks();
    }
  }, 30000);

  // Quan tornes a la pestanya, recarregar
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && !isSending) {
      await loadStateFromServer();
      renderMessages();
      renderTasks();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
