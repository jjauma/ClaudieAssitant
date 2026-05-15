// ============================================
// CLAUDIE — Pas 2
// App de xat amb assistent personal interactiu
// ============================================

const LOCAL_CONFIG = 'claudie_config';
const VOICE_SILENCE_MS = 2500;

// ---------- ESTAT (es sincronitza amb el servidor) ----------
let state = {
  messages: [],       // [{role: 'user'|'assistant', content: '...', ts}]
  tasks: { pro: [], personal: [] },
  perfil: []          // [{id, text, category, createdAt, lastSeenAt}]
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
  // No carregar si hi ha canvis locals pendents - primer els guardem
  if (hasPendingChanges) {
    await forceSaveState();
    return; // Saltem aquest cicle; el següent refresc ja portarà tot
  }
  isLoadingState = true;
  try {
    const data = await apiCall('/state');
    if (data && data.messages) state.messages = data.messages;
    if (data && data.tasks) state.tasks = data.tasks;
    if (data && data.perfil) state.perfil = data.perfil;

    // Seed inicial del perfil si està buit
    if (!state.perfil || state.perfil.length === 0) {
      const now = Date.now();
      state.perfil = [
        { id: 'seed-1', text: 'Parla amb to directe i amb complicitat, sense floritures ni servilismes.', category: 'Preferències', createdAt: now, lastSeenAt: now },
        { id: 'seed-2', text: 'Vol dades concretes per decidir, especialment en temes financers.', category: 'Preferències', createdAt: now, lastSeenAt: now },
        { id: 'seed-3', text: 'No iniciar conversa proactivament — si no et parla, no molestar.', category: 'Preferències', createdAt: now, lastSeenAt: now },
        { id: 'seed-4', text: 'Llegeix documents amb atenció i dona feedback breu, en estil correctiu.', category: 'Preferències', createdAt: now, lastSeenAt: now }
      ];
      saveStateToServer();
    }
  } catch (e) {
    console.error('Error carregant estat:', e);
  } finally {
    isLoadingState = false;
  }
}

let hasPendingChanges = false;

function saveStateToServer() {
  hasPendingChanges = true;
  // Debounce - guardem 600ms després de l'última crida
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(async () => {
    try {
      await apiCall('/state', {
        method: 'POST',
        body: JSON.stringify(state)
      });
      hasPendingChanges = false;
    } catch (e) {
      console.error('Error guardant estat:', e);
      // Manté hasPendingChanges = true perquè ho reintenti la pròxima vegada
    }
  }, 600);
}

// Força el guardat immediat (per quan cal sincronitzar abans de res)
async function forceSaveState() {
  clearTimeout(stateSaveTimer);
  if (!hasPendingChanges) return;
  try {
    await apiCall('/state', {
      method: 'POST',
      body: JSON.stringify(state)
    });
    hasPendingChanges = false;
  } catch (e) {
    console.error('Error guardant estat (force):', e);
  }
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

function updateTasksBadge() {
  const pendentsPro = state.tasks.pro.filter(t => !t.done).length;
  const pendentsPer = state.tasks.personal.filter(t => !t.done).length;
  document.getElementById('count-pro').textContent = pendentsPro;
  document.getElementById('count-personal').textContent = pendentsPer;
  const badge = document.getElementById('tasks-badge');
  const total = pendentsPro + pendentsPer;
  badge.textContent = total;
  badge.classList.toggle('empty', total === 0);
}

function renderTasks() {
  updateTasksBadge();
  const list = document.getElementById('task-list');
  const empty = document.getElementById('task-empty');
  const tasks = state.tasks[currentTaskFilter] || [];

  list.innerHTML = '';

  if (tasks.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';

    // Capçalera de columnes
    const header = document.createElement('li');
    header.className = 'task-list-header';
    header.innerHTML = `
      <span class="h-check"></span>
      <span class="h-task">Tasca</span>
      <span class="h-created">Creada</span>
      <span class="h-due">Venç</span>
      <span class="h-prio">Prio</span>
      <span class="h-actions"></span>
    `;
    list.appendChild(header);

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
      const dueHtml = task.deadline && !task.done
        ? `<span class="task-due ${dueCls}">${fmtDeadlineCurt(task.deadline)}</span>`
        : `<span class="task-due empty">—</span>`;
      li.innerHTML = `
        <input type="checkbox" class="check" ${task.done ? 'checked' : ''} />
        <span class="task-text">${escapeHtml(task.text)}</span>
        <span class="task-created">${fmtDeadlineCurt(new Date(task.createdAt).toISOString().split('T')[0])}</span>
        ${dueHtml}
        <span class="task-prio-cell"><span class="task-prio ${task.priority || ''}"></span></span>
        <button class="task-delete" aria-label="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      `;
      list.appendChild(li);
    });
  }
}

// ---------- RENDER PERFIL ----------
let showOldOnly = false;
const OLD_DAYS = 30;

function renderPerfil() {
  const container = document.getElementById('perfil-content');
  const empty = document.getElementById('perfil-empty');
  const reviewBtn = document.getElementById('review-old');
  const entries = state.perfil || [];

  if (entries.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    reviewBtn.style.display = 'none';
    return;
  }

  empty.style.display = 'none';

  // Quantes entrades antigues hi ha
  const now = Date.now();
  const oldThreshold = now - OLD_DAYS * 86400000;
  const oldEntries = entries.filter(e => (e.lastSeenAt || e.createdAt) < oldThreshold);

  if (oldEntries.length > 0) {
    reviewBtn.style.display = 'inline-block';
    reviewBtn.textContent = showOldOnly
      ? `Veure totes (${entries.length})`
      : `Revisar antigues (${oldEntries.length})`;
  } else {
    reviewBtn.style.display = 'none';
  }

  // Filtrar si toca
  const list = showOldOnly ? oldEntries : entries;

  // Agrupar per categoria
  const groups = {};
  list.forEach(e => {
    const cat = e.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  });

  container.innerHTML = '';
  Object.keys(groups).sort().forEach(cat => {
    const section = document.createElement('div');
    section.className = 'perfil-group';
    section.innerHTML = `<h3 class="perfil-cat">${escapeHtml(cat)}</h3>`;
    const ul = document.createElement('ul');
    ul.className = 'perfil-list';
    groups[cat].forEach(e => {
      const li = document.createElement('li');
      li.className = 'perfil-entry';
      li.dataset.id = e.id;
      const ageDays = Math.floor((now - (e.lastSeenAt || e.createdAt)) / 86400000);
      const isOld = ageDays >= OLD_DAYS;
      li.innerHTML = `
        <span class="perfil-text">${escapeHtml(e.text)}</span>
        <div class="perfil-meta">
          ${isOld ? `<span class="perfil-age">fa ${ageDays} dies</span>` : ''}
          <button class="perfil-delete" aria-label="Eliminar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        </div>
      `;
      ul.appendChild(li);
    });
    section.appendChild(ul);
    container.appendChild(section);
  });
}

function deletePerfilEntry(id) {
  state.perfil = (state.perfil || []).filter(e => e.id !== id);
  saveStateToServer();
  renderPerfil();
}
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
  updateTasksBadge();
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
    description: 'Crea una nova tasca a la llista del Josep Maria. Fes-ho servir quan ell et demani apuntar alguna cosa o quan d\'una conversa quedi clar que cal recordar fer una acció.',
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
    description: 'Consulta les tasques del Josep Maria. Fes-ho servir quan ell pregunti per les seves tasques, vulguis identificar una tasca abans de modificar-la, o quan vulguis recordar-li què té pendent. Et retorna l\'id de cada tasca que pots usar després per modificar-la.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['pro','personal','totes'], description: 'Quina categoria filtrar' },
        nomes_pendents: { type: 'boolean', description: 'true per veure només les no fetes' }
      },
      required: ['category']
    }
  },
  {
    name: 'modificar_tasca',
    description: 'Modifica una tasca existent. Pots canviar el text, venciment, prioritat o categoria. Si no saps l\'id, primer fes servir llistar_tasques per trobar-la. Només omple els camps que vulguis canviar; deixa els altres sense especificar.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L\'id de la tasca (obtingut de llistar_tasques)' },
        text: { type: 'string', description: 'Nou text de la tasca (opcional)' },
        deadline: { type: ['string','null'], description: 'Nou venciment en format YYYY-MM-DD, o null per treure el venciment (opcional)' },
        priority: { type: 'string', enum: ['urgent','setmana',''], description: 'Nova prioritat (opcional)' },
        category: { type: 'string', enum: ['pro','personal'], description: 'Nova categoria si vols moure-la (opcional)' }
      },
      required: ['id']
    }
  },
  {
    name: 'marcar_tasca',
    description: 'Marca una tasca com a feta o com a pendent. Útil quan en Josep Maria diu "ja he fet X" o "torna a posar Y com a pendent".',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L\'id de la tasca' },
        feta: { type: 'boolean', description: 'true per marcar com a feta, false per tornar-la a pendent' }
      },
      required: ['id','feta']
    }
  },
  {
    name: 'eliminar_tasca',
    description: 'Elimina permanentment una tasca. Fes-ho servir quan en Josep Maria et demani esborrar-la. Si tens dubtes de si és la correcta, pregunta-li abans.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L\'id de la tasca a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'afegir_al_perfil',
    description: 'Afegeix una entrada al Perfil del Josep Maria. SOLAMENT pots fer-ho quan ell t\'ho demana EXPLÍCITAMENT amb expressions com "recorda que...", "anota al perfil...", "tingues present que...". NO afegeixis res al perfil pel teu compte, encara que sembli rellevant. Si tens dubte de si és per al perfil, pregunta-li abans.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'La informació a recordar, redactada de forma clara i sintètica (ex: "La Mari del Picuteig Sabadell treballa als matins")' },
        category: { type: 'string', description: 'Categoria temàtica: Empresa, Restaurants, Proveïdors, Família, Personal, Preferències, etc. Inventa-te una si cap encaixa.' }
      },
      required: ['text','category']
    }
  },
  {
    name: 'llegir_perfil',
    description: 'Consulta el Perfil del Josep Maria. Fes-ho servir si vols veure què recordes d\'ell, identificar una entrada per modificar-la o esborrar-la, o si ell et pregunta què tens guardat.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtra per categoria (opcional). Si no especifiques, et torna tot.' }
      }
    }
  },
  {
    name: 'modificar_perfil',
    description: 'Modifica una entrada existent del Perfil. Si no saps l\'id, primer fes llegir_perfil.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L\'id de l\'entrada' },
        text: { type: 'string', description: 'Nou text (opcional)' },
        category: { type: 'string', description: 'Nova categoria (opcional)' }
      },
      required: ['id']
    }
  },
  {
    name: 'eliminar_del_perfil',
    description: 'Elimina una entrada del Perfil. Fes-ho quan en Josep Maria et demani oblidar alguna cosa, o quan estigui clar que ja no és vigent. Si tens dubtes, pregunta-li abans.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'L\'id de l\'entrada a eliminar' }
      },
      required: ['id']
    }
  }
];

function executeTool(name, input) {
  if (name === 'crear_tasca') {
    const task = addTask(input);
    return {
      success: true,
      id: task.id,
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
  if (name === 'modificar_tasca') {
    for (const cat of ['pro','personal']) {
      const t = state.tasks[cat].find(x => x.id === input.id);
      if (t) {
        if (typeof input.text === 'string') t.text = input.text;
        if (input.deadline !== undefined) t.deadline = input.deadline;
        if (typeof input.priority === 'string') t.priority = input.priority;
        if (input.category && input.category !== cat) {
          // Moure de categoria
          state.tasks[cat] = state.tasks[cat].filter(x => x.id !== input.id);
          t.category = input.category;
          state.tasks[input.category].unshift(t);
        }
        saveStateToServer();
        renderTasks();
        return { success: true, missatge: 'Tasca modificada' };
      }
    }
    return { error: 'No he trobat cap tasca amb aquest id' };
  }
  if (name === 'marcar_tasca') {
    for (const cat of ['pro','personal']) {
      const t = state.tasks[cat].find(x => x.id === input.id);
      if (t) {
        t.done = !!input.feta;
        t.doneAt = t.done ? Date.now() : null;
        saveStateToServer();
        renderTasks();
        return { success: true, missatge: t.done ? 'Marcada com a feta' : 'Tornada a pendent' };
      }
    }
    return { error: 'No he trobat cap tasca amb aquest id' };
  }
  if (name === 'eliminar_tasca') {
    for (const cat of ['pro','personal']) {
      const before = state.tasks[cat].length;
      state.tasks[cat] = state.tasks[cat].filter(t => t.id !== input.id);
      if (state.tasks[cat].length !== before) {
        saveStateToServer();
        renderTasks();
        return { success: true, missatge: 'Tasca eliminada' };
      }
    }
    return { error: 'No he trobat cap tasca amb aquest id' };
  }
  if (name === 'afegir_al_perfil') {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      text: input.text,
      category: input.category || 'General',
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    };
    if (!state.perfil) state.perfil = [];
    state.perfil.unshift(entry);
    saveStateToServer();
    renderPerfil();
    return { success: true, id: entry.id, missatge: `Anotat al perfil (${entry.category})` };
  }
  if (name === 'llegir_perfil') {
    let entries = state.perfil || [];
    if (input.category) {
      entries = entries.filter(e => e.category.toLowerCase() === input.category.toLowerCase());
    }
    // Marcar com a 'vistes' (per la lògica de revisió)
    const now = Date.now();
    entries.forEach(e => { e.lastSeenAt = now; });
    saveStateToServer();
    return { entries: entries.map(e => ({ id: e.id, text: e.text, category: e.category })), total: entries.length };
  }
  if (name === 'modificar_perfil') {
    const e = (state.perfil || []).find(x => x.id === input.id);
    if (!e) return { error: 'No he trobat cap entrada amb aquest id' };
    if (typeof input.text === 'string') e.text = input.text;
    if (typeof input.category === 'string') e.category = input.category;
    e.lastSeenAt = Date.now();
    saveStateToServer();
    renderPerfil();
    return { success: true, missatge: 'Entrada modificada' };
  }
  if (name === 'eliminar_del_perfil') {
    if (!state.perfil) return { error: 'Perfil buit' };
    const before = state.perfil.length;
    state.perfil = state.perfil.filter(e => e.id !== input.id);
    if (state.perfil.length === before) return { error: 'No he trobat cap entrada amb aquest id' };
    saveStateToServer();
    renderPerfil();
    return { success: true, missatge: 'Entrada eliminada' };
  }
  return { error: 'Tool desconegut' };
}

// ---------- SYSTEM PROMPT ----------
function buildSystemPrompt() {
  const avui = new Date();
  const data = `${DIES[avui.getDay()]}, ${avui.getDate()} de ${MESOS[avui.getMonth()]} de ${avui.getFullYear()}`;

  return `Ets la Claudie, l'assistent personal d'en Josep Maria Jauma.

EL TEU CARÀCTER:
- Ets cordial i propera. Tractes en Josep Maria com una persona de confiança que coneixes bé.
- Tens complicitat real, no fingida. Pots ser càlida sense ser excessiva.
- Vas al gra, però sense ser seca: una resposta pot ser curta i alhora amable.
- No ets servil ("Cap problema!", "Amb molt de gust!", "Per descomptat!"): això és exactament el contrari del que vols. Parla com una col·laboradora propera, no com una assistent de call center.
- Pots fer broma puntual si encaixa, pots mostrar interès, pots dir "m'ha agradat" o "uf, això és farragós" quan toqui.
- No moralitzes, no recordes coses que ja sap, no afegeixes disclaimers innecessaris.
- Mai utilitzes emojis. Signes d'exclamació amb molta moderació.
- Parles sempre en català (variant central/oriental).

EL TEU REGISTRE - exemples del to correcte:

Mal: "Tasca creada correctament." (massa seca, sona a app)
Bé: "Apuntada. Vols que t'avisi el dia abans?"

Mal: "D'acord, ho farem!" (massa servil)
Bé: "Fet. Encara cap més cosa pel matí?"

Mal: "He afegit la tasca a la teva llista professional amb prioritat urgent." (recita)
Bé: "Apuntada amb urgent. Qui té el contacte d'ell?"

Mal: "Entesos. Quan vols que es faci?" (eficient però fred)
Bé: "D'acord. Per quan ho deixem — abans del cap de setmana?"

QUE SAPS D'EN JOSEP MARIA (només per context, no en parlis tret que sigui rellevant):
- És empresari de restauració a Barcelona, propietari del grup Milgrup
- Té diversos restaurants: Santamasa Sarrià, Santamasa Sabadell, Picuteig Sant Cugat, Picuteig Sabadell, Cirera 23, Can Solà
- La Laia Jordana Serra era l'administrativa però marxa pròximament
- Treballa amb proveïdors com Codorníu
- És expert en finances. Vol dades concretes per decidir.

CONTEXT D'AVUI:
- Data: ${data}
- Tasques pendents: ${state.tasks.pro.filter(t=>!t.done).length} professionals, ${state.tasks.personal.filter(t=>!t.done).length} personals

EL TEU PERFIL ACTUAL D'EN JOSEP MARIA (això és el que ell t'ha demanat explícitament que recordis):
${(state.perfil || []).length === 0 ? '(buit, encara no t\'ha demanat que recordis res)' : (state.perfil || []).map(e => `- [${e.category}] ${e.text}`).join('\n')}

Aquest perfil l'aplicaràs naturalment a totes les converses (especialment les preferències de comunicació). NO l'esmentis explícitament tret que ell pregunti. Si vol que afegeixis, modifiquis o esborris alguna cosa del perfil, fes-ho amb les tools corresponents.

COM HAS DE FUNCIONAR:

1. **GESTIÓ DE TASQUES — REGLA D'OR**: si en Josep Maria menciona ALGUNA acció que ha de fer, encara que no digui explícitament "apunta-ho", l'has d'apuntar. Frases com "demà he de trucar a X", "haig de comprar Y", "no oblidar Z", "recorda'm X" → TOTES són ordres d'apuntar tasca. NO et limitis a confirmar amb paraules: crea la tasca amb crear_tasca SEMPRE. Només excepció: si està parlant en hipotètic ("si fos per mi faria X") o reflexionant en veu alta sense compromís ("potser hauria de..."). Davant del dubte, apunta-la — sempre és més fàcil esborrar-la que oblidar-la. També tens eines per llistar, modificar, marcar i eliminar tasques. No diguis mai que "no pots" fer-ho.

2. **PERFIL — MEMÒRIA**: NO afegeixis res al perfil pel teu compte. NOMÉS quan en Josep Maria t'ho demani EXPLÍCITAMENT amb expressions com "recorda que...", "anota al perfil...", "tingues present que...", fes servir 'afegir_al_perfil'. Si tens dubte de si vol que ho guardis o no, pregunta-li breument. La conversa queda guardada automàticament, no la gestionis tu.

3. **IDEES I ASSESSORAMENT**: si et planteja una idea o un dilema, entra a debatre-hi com ho faria una persona de confiança. Fes preguntes que ajudin a aclarir, dona la teva opinió quan la tinguis basada en alguna cosa, no et limitis a fer de mirall.

4. **LONGITUD**: respostes curtes per defecte (1-3 frases). Si cal estendre's, fes-ho sense palla. Una resposta curta no vol dir seca: pot ser breu i càlida alhora.`;
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
    const toolActions = [];
    for (const tu of toolUseBlocks) {
      const result = executeTool(tu.name, tu.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result)
      });
      // Generar etiqueta visible per a l'usuari
      if (tu.name === 'crear_tasca' && result.success) {
        const cat = tu.input.category === 'pro' ? 'Professional' : 'Personal';
        const dl = tu.input.deadline ? ` · venç ${tu.input.deadline}` : '';
        const pr = tu.input.priority === 'urgent' ? ' · urgent' : (tu.input.priority === 'setmana' ? ' · setmana' : '');
        toolActions.push(`✓ Apuntada a ${cat}${dl}${pr}: «${tu.input.text}»`);
      } else if (tu.name === 'modificar_tasca' && result.success) {
        toolActions.push(`✓ Tasca modificada`);
      } else if (tu.name === 'marcar_tasca' && result.success) {
        toolActions.push(result.missatge === 'Marcada com a feta' ? `✓ Marcada com a feta` : `↩ Tornada a pendent`);
      } else if (tu.name === 'eliminar_tasca' && result.success) {
        toolActions.push(`✗ Tasca eliminada`);
      } else if (tu.name === 'afegir_al_perfil' && result.success) {
        toolActions.push(`✓ Anotat al perfil (${tu.input.category})`);
      } else if (tu.name === 'eliminar_del_perfil' && result.success) {
        toolActions.push(`✗ Entrada del perfil eliminada`);
      }
    }

    // Mostrar les accions al xat (com a missatge de sistema)
    if (toolActions.length > 0) {
      state.messages.push({
        role: 'system',
        content: toolActions.join('\n'),
        ts: Date.now()
      });
      renderMessages();
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

// ---------- DICTAT (model toc-a-toc) ----------
// Prems el botó del micro -> escolta una frase.
// Quan fas pausa de 2.5s, envia i s'atura.
// Si vols dictar una altra cosa, tornes a tocar.

const VOICE_SILENCE_MS = 2500;

let recognition = null;
let isListening = false;
let silenceTimer = null;
let lastTranscript = '';
let finalTranscript = '';
let userIsSpeaking = false;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('mic-btn');

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'Dictat no disponible';
    micBtn.style.opacity = '0.35';
    return;
  }

  setupRecognition();
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.lang = 'ca-ES';
  recognition.continuous = false;
  recognition.interimResults = true;

  const input = document.getElementById('msg-input');
  const status = document.getElementById('mic-status');

  recognition.onstart = () => {
    isListening = true;
    updateMicUI();
    finalTranscript = '';
    lastTranscript = '';
    userIsSpeaking = false;
    status.textContent = 'Parla...';
    status.classList.add('visible');
    status.classList.remove('error');
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
      // Flash visual quan rep veu
      const btn = document.getElementById('mic-btn');
      btn.classList.add('hearing');
      setTimeout(() => btn.classList.remove('hearing'), 250);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      status.textContent = 'Permet el micro a Ajustos';
      status.classList.add('visible','error');
      setTimeout(() => status.classList.remove('visible','error'), 2500);
    }
    isListening = false;
    updateMicUI();
  };

  recognition.onend = () => {
    isListening = false;
    clearTimeout(silenceTimer);
    updateMicUI();

    const text = (lastTranscript || finalTranscript).trim();
    if (text) {
      input.value = text;
      adjustInputHeight();
      sendMessage(text);
    }
    setTimeout(() => document.getElementById('mic-status').classList.remove('visible'), 600);
  };
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (isListening && recognition && userIsSpeaking) {
      try { recognition.stop(); } catch (e) {}
    }
  }, VOICE_SILENCE_MS);
}

function startListening() {
  if (isListening) return;
  // Sempre creem un reconeixedor nou per evitar estats antics
  setupRecognition();
  try {
    recognition.start();
  } catch (e) {
    setTimeout(() => {
      setupRecognition();
      try { recognition.start(); } catch (er) {}
    }, 200);
  }
}

function stopListening() {
  if (!isListening || !recognition) return;
  try { recognition.stop(); } catch (e) {}
}

function toggleMic() {
  if (isListening) stopListening();
  else startListening();
}

function updateMicUI() {
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording','thinking','hearing');
  if (isSending) {
    btn.classList.add('thinking');
    btn.title = 'Pensant...';
  } else if (isListening) {
    btn.classList.add('recording');
    btn.title = 'Escoltant — toca per aturar';
  } else {
    btn.title = 'Toca per dictar';
  }
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
  renderPerfil();
  updateTasksBadge();

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
    toggleMic();
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

  // Drawer Perfil
  document.getElementById('open-perfil').addEventListener('click', () => {
    document.getElementById('perfil-drawer').classList.remove('hidden');
    showOldOnly = false;
    renderPerfil();
  });
  document.getElementById('close-perfil').addEventListener('click', () => {
    document.getElementById('perfil-drawer').classList.add('hidden');
  });
  document.getElementById('perfil-drawer').addEventListener('click', (e) => {
    if (e.target.id === 'perfil-drawer') {
      document.getElementById('perfil-drawer').classList.add('hidden');
    }
  });
  document.getElementById('review-old').addEventListener('click', () => {
    showOldOnly = !showOldOnly;
    renderPerfil();
  });
  document.getElementById('perfil-content').addEventListener('click', (e) => {
    const entry = e.target.closest('.perfil-entry');
    if (!entry) return;
    if (e.target.closest('.perfil-delete')) {
      if (confirm('Esborrar aquesta entrada del perfil?')) {
        deletePerfilEntry(entry.dataset.id);
      }
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

    // Check: marcar/desmarcar
    if (e.target.classList.contains('check')) {
      toggleTask(id);
      return;
    }
    // Paperera: eliminar
    if (e.target.closest('.task-delete')) {
      if (confirm('Eliminar aquesta tasca?')) deleteTask(id);
      return;
    }
    // Click a la resta de la fila: expandir/col·lapsar
    li.classList.toggle('expanded');
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
      renderPerfil();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
