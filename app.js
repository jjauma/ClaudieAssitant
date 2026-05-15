// ============================================
// CLAUDIE — Pas 2
// App de xat amb assistent personal interactiu
// ============================================

const LOCAL_CONFIG = 'claudie_config';

// ---------- ESTAT (es sincronitza amb el servidor) ----------
let state = {
  messages: [],       // [{role: 'user'|'assistant', content: '...', ts}]
  tasks: { pro: [], personal: [] },
  perfil: [],         // [{id, text, category, createdAt, lastSeenAt}]
  ideas: []           // [{id, title, description, category, status, createdAt, lastSeenAt}]
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
    if (data && data.ideas) state.ideas = data.ideas;

    // Seed inicial del perfil si està buit
    if (!state.perfil || state.perfil.length === 0) {
      const now = Date.now();
      state.perfil = [
        { id: 'seed-1', text: 'Habla con tono directo y con complicidad, sin florituras ni servilismos.', category: 'Preferencias', createdAt: now, lastSeenAt: now },
        { id: 'seed-2', text: 'Quiere datos concretos para decidir, especialmente en temas financieros.', category: 'Preferencias', createdAt: now, lastSeenAt: now },
        { id: 'seed-3', text: 'No iniciar conversación proactivamente — si no te habla, no molestar.', category: 'Preferencias', createdAt: now, lastSeenAt: now },
        { id: 'seed-4', text: 'Lee documentos con atención y da feedback breve, en estilo correctivo.', category: 'Preferencias', createdAt: now, lastSeenAt: now }
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
const DIES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmtDeadlineCurt(iso) {
  if (!iso) return '';
  const [y,m,dd] = iso.split('-').map(Number);
  const d = new Date(y, m-1, dd);
  const avui = new Date(); avui.setHours(0,0,0,0);
  const diff = Math.round((d - avui) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañ';
  if (diff === -1) return 'ayer';
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
      <span class="h-task">Tarea</span>
      <span class="h-created">Creada</span>
      <span class="h-due">Vence</span>
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

// ---------- RENDER IDEAS ----------
let currentIdeasFilter = 'viva';

function updateIdeasBadge() {
  const vivas = (state.ideas || []).filter(i => i.status === 'viva').length;
  const badge = document.getElementById('ideas-badge');
  if (badge) {
    badge.textContent = vivas;
    badge.classList.toggle('empty', vivas === 0);
  }
}

function renderIdeas() {
  updateIdeasBadge();
  const container = document.getElementById('ideas-content');
  const empty = document.getElementById('ideas-empty');
  if (!container) return;

  const all = state.ideas || [];
  const filtered = all.filter(i => i.status === currentIdeasFilter);

  // Contadors per estat
  const counts = {
    viva: all.filter(i => i.status === 'viva').length,
    proyecto: all.filter(i => i.status === 'proyecto').length,
    descartada: all.filter(i => i.status === 'descartada').length
  };
  Object.entries(counts).forEach(([k,v]) => {
    const el = document.getElementById(`count-${k}`);
    if (el) el.textContent = v;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    if (currentIdeasFilter !== 'viva' && all.length > 0) {
      empty.textContent = currentIdeasFilter === 'proyecto'
        ? 'Ninguna idea convertida en proyecto.'
        : 'Ninguna idea descartada.';
    } else {
      empty.textContent = 'Aún no has guardado ideas. Cuéntame algo que valga la pena conservar y dime "guárdalo como idea".';
    }
    return;
  }

  empty.style.display = 'none';

  // Agrupar per categoria
  const groups = {};
  filtered.forEach(i => {
    const cat = i.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(i);
  });

  container.innerHTML = '';
  Object.keys(groups).sort().forEach(cat => {
    const section = document.createElement('div');
    section.className = 'ideas-group';
    section.innerHTML = `<h3 class="ideas-cat">${escapeHtml(cat)}</h3>`;
    const ul = document.createElement('ul');
    ul.className = 'ideas-list';
    groups[cat].sort((a,b) => b.createdAt - a.createdAt).forEach(i => {
      const li = document.createElement('li');
      li.className = 'idea-entry';
      li.dataset.id = i.id;
      const ageDays = Math.floor((Date.now() - (i.lastSeenAt || i.createdAt)) / 86400000);
      li.innerHTML = `
        <div class="idea-main">
          <div class="idea-title">${escapeHtml(i.title)}</div>
          ${i.description ? `<div class="idea-desc">${escapeHtml(i.description)}</div>` : ''}
          <div class="idea-meta">
            <span>creada hace ${ageDays}d</span>
          </div>
        </div>
        <button class="idea-delete" aria-label="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      `;
      ul.appendChild(li);
    });
    section.appendChild(ul);
    container.appendChild(section);
  });
}

function deleteIdea(id) {
  state.ideas = (state.ideas || []).filter(i => i.id !== id);
  saveStateToServer();
  renderIdeas();
  updateIdeasBadge();
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
  },
  {
    name: 'guardar_idea',
    description: 'Guarda una idea/pensamiento/planteamiento en el calaix de Ideas. SOLO cuando Josep Maria te lo pida EXPLÍCITAMENTE con expresiones como "guarda esto como idea", "apunta esta idea", "esto guárdamelo en ideas", "anota esta idea". NUNCA guardes ideas por tu cuenta. Una idea es algo no-accionable a corto plazo: un planteamiento, posibilidad, brainstorming. Las acciones concretas con fecha van a tareas, no a ideas.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto de la idea (5-12 palabras), sintetizando el planteamiento. Ej: "Cambiar horario Picuteig Sant Cugat a tarde-noche"' },
        description: { type: 'string', description: 'Descripción más completa del contenido de la idea, resumiendo lo que habéis hablado. 1-3 frases.' },
        category: { type: 'string', description: 'Categoría libre: el restaurante, "Grupo", "Estrategia", "Personal", "Proveedores", etc. Inventa una si ninguna encaja.' }
      },
      required: ['title','description','category']
    }
  },
  {
    name: 'listar_ideas',
    description: 'Consulta las ideas guardadas. Útil si Josep Maria pregunta qué ideas tiene apuntadas, si quieres recuperar ideas relacionadas con un tema, o antes de modificar/eliminar una idea.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filtra por categoría (opcional)' },
        status: { type: 'string', enum: ['viva','descartada','proyecto','todas'], description: 'Filtra por estado (opcional, por defecto "viva")' }
      }
    }
  },
  {
    name: 'modificar_idea',
    description: 'Modifica una idea existente. Útil para cambiar su estado (viva → descartada o proyecto), actualizar el título, descripción, o categoría. Si no sabes el id, primero llama a listar_ideas.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'El id de la idea' },
        title: { type: 'string', description: 'Nuevo título (opcional)' },
        description: { type: 'string', description: 'Nueva descripción (opcional)' },
        category: { type: 'string', description: 'Nueva categoría (opcional)' },
        status: { type: 'string', enum: ['viva','descartada','proyecto'], description: 'Nuevo estado (opcional)' }
      },
      required: ['id']
    }
  },
  {
    name: 'eliminar_idea',
    description: 'Elimina permanentemente una idea. Si Josep Maria solo quiere descartarla (pero conservarla en el archivo) usa modificar_idea con status="descartada" en su lugar. Solo elimina cuando él pida borrar explícitamente.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'El id de la idea a eliminar' }
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
  if (name === 'guardar_idea') {
    const idea = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      title: input.title,
      description: input.description || '',
      category: input.category || 'General',
      status: 'viva',
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    };
    if (!state.ideas) state.ideas = [];
    state.ideas.unshift(idea);
    saveStateToServer();
    renderIdeas();
    updateIdeasBadge();
    return { success: true, id: idea.id, missatge: `Idea guardada (${idea.category})` };
  }
  if (name === 'listar_ideas') {
    let ideas = state.ideas || [];
    const status = input.status || 'viva';
    if (status !== 'todas') ideas = ideas.filter(i => i.status === status);
    if (input.category) ideas = ideas.filter(i => i.category.toLowerCase() === input.category.toLowerCase());
    const now = Date.now();
    ideas.forEach(i => { i.lastSeenAt = now; });
    saveStateToServer();
    return {
      ideas: ideas.map(i => ({
        id: i.id, title: i.title, description: i.description,
        category: i.category, status: i.status
      })),
      total: ideas.length
    };
  }
  if (name === 'modificar_idea') {
    const i = (state.ideas || []).find(x => x.id === input.id);
    if (!i) return { error: 'No he encontrado la idea' };
    if (typeof input.title === 'string') i.title = input.title;
    if (typeof input.description === 'string') i.description = input.description;
    if (typeof input.category === 'string') i.category = input.category;
    if (typeof input.status === 'string') i.status = input.status;
    i.lastSeenAt = Date.now();
    saveStateToServer();
    renderIdeas();
    updateIdeasBadge();
    return { success: true, missatge: 'Idea modificada' };
  }
  if (name === 'eliminar_idea') {
    if (!state.ideas) return { error: 'No hay ideas' };
    const before = state.ideas.length;
    state.ideas = state.ideas.filter(i => i.id !== input.id);
    if (state.ideas.length === before) return { error: 'No he encontrado la idea' };
    saveStateToServer();
    renderIdeas();
    updateIdeasBadge();
    return { success: true, missatge: 'Idea eliminada' };
  }
  return { error: 'Tool desconegut' };
}

// ---------- SYSTEM PROMPT ----------
function buildSystemPrompt() {
  const avui = new Date();
  const data = `${DIES[avui.getDay()]}, ${avui.getDate()} de ${MESOS[avui.getMonth()]} de ${avui.getFullYear()}`;

  return `Eres Claudie, la asistente personal de Josep Maria Jauma.

TU CARÁCTER:
- Eres cordial y cercana. Tratas a Josep Maria como una persona de confianza que conoces bien.
- Tienes complicidad real, no fingida. Puedes ser cálida sin ser excesiva.
- Vas al grano, pero sin ser seca: una respuesta puede ser corta y a la vez amable.
- No eres servil ("¡Sin problema!", "¡Encantada!", "¡Por supuesto!"): eso es exactamente lo contrario de lo que quiere. Habla como una colaboradora cercana, no como una asistente de call center.
- Puedes hacer una broma puntual si encaja, mostrar interés, decir "me ha gustado" o "uf, eso es lioso" cuando toque.
- No moralizas, no le recuerdas cosas que ya sabe, no añades disclaimers innecesarios.
- Nunca usas emojis. Signos de exclamación con mucha moderación.
- Hablas siempre en castellano de España (no latinoamericano).

TU REGISTRO - ejemplos del tono correcto:

Mal: "Tarea creada correctamente." (demasiado seco, suena a app)
Bien: "Apuntada. ¿Quieres que te avise el día antes?"

Mal: "¡De acuerdo, lo haremos!" (demasiado servil)
Bien: "Hecho. ¿Algo más para la mañana?"

Mal: "He añadido la tarea a tu lista profesional con prioridad urgente." (recita)
Bien: "Apuntada como urgente. ¿Tienes su contacto?"

Mal: "Entendido. ¿Cuándo quieres que se haga?" (eficiente pero frío)
Bien: "Vale. ¿Para cuándo lo dejamos, antes del finde?"

QUÉ SABES DE JOSEP MARIA (solo para contexto, no lo menciones salvo que sea relevante):
- Es empresario de restauración en Barcelona, propietario del grupo Milgrup
- Tiene varios restaurantes: Santamasa Sarrià, Santamasa Sabadell, Picuteig Sant Cugat, Picuteig Sabadell, Cirera 23, Can Solà
- Trabaja con proveedores como Codorníu
- Es experto en finanzas. Quiere datos concretos para decidir.

CONTEXTO DE HOY:
- Fecha: ${data}
- Tareas pendientes: ${state.tasks.pro.filter(t=>!t.done).length} profesionales, ${state.tasks.personal.filter(t=>!t.done).length} personales
- Ideas vivas guardadas: ${(state.ideas || []).filter(i => i.status === 'viva').length}

TU PERFIL ACTUAL DE JOSEP MARIA (lo que él te ha pedido explícitamente que recuerdes):
${(state.perfil || []).length === 0 ? '(vacío, todavía no te ha pedido que recuerdes nada)' : (state.perfil || []).map(e => `- [${e.category}] ${e.text}`).join('\n')}

Este perfil lo aplicarás naturalmente a todas las conversaciones (especialmente las preferencias de comunicación). NO lo menciones explícitamente salvo que pregunte. Si quiere que añadas, modifiques o borres algo del perfil, hazlo con las tools correspondientes.

CÓMO TIENES QUE FUNCIONAR:

1. **GESTIÓN DE TAREAS — REGLA DE ORO**: si Josep Maria menciona CUALQUIER acción que debe hacer, aunque no diga explícitamente "apúntalo", debes apuntarla. Frases como "mañana tengo que llamar a X", "tengo que comprar Y", "no olvidar Z", "recuérdame X" → TODAS son órdenes de apuntar tarea. NO te limites a confirmar con palabras: crea la tarea con crear_tarea SIEMPRE.

**REGLA CRÍTICA**: NUNCA digas "apuntada", "anotada", "te lo guardo", "lo apunto" o similar SIN haber llamado realmente a la herramienta crear_tarea. Si dices que has apuntado algo, es OBLIGATORIO que hayas llamado a la tool. Mentir sobre esto rompe la confianza con Josep Maria. Si por alguna razón no puedes crear la tarea, di que no has podido (cosa rara, porque siempre puedes).

Si Josep Maria te da varias tareas en un solo mensaje (ej. "apunta esto, esto y esto"), llama a crear_tarea TANTAS VECES como tareas haya, todas en la misma respuesta.

Solo excepción para no apuntar: si está hablando en hipotético ("si fuera por mí haría X") o reflexionando en voz alta sin compromiso ("quizá debería..."). Ante la duda, apúntala. También tienes herramientas para listar, modificar, marcar y eliminar tareas. No digas nunca que "no puedes" hacerlo.

2. **PERFIL — MEMORIA**: NO añadas nada al perfil por tu cuenta. SOLO cuando Josep Maria te lo pida EXPLÍCITAMENTE con expresiones como "recuerda que...", "anota en el perfil...", "ten presente que...", usa 'afegir_al_perfil'. Si tienes duda de si quiere que lo guardes o no, pregúntale brevemente. La conversación queda guardada automáticamente, no la gestiones tú.

3. **IDEAS — CONSERVAR PLANTEAMIENTOS**: las ideas son pensamientos, posibilidades estratégicas, dilemas, brainstorming. NO son acciones concretas (eso son tareas). NO guardes ideas por tu cuenta. SOLO cuando Josep Maria te lo pida EXPLÍCITAMENTE con expresiones como "guarda esto como idea", "apunta esta idea", "anota esto en ideas", "esto guárdalo en ideas". En ese momento usa 'guardar_idea' con un título breve y descripción más completa de lo que habéis hablado.

Cuando Josep Maria mencione una idea que YA tienes guardada (o algo relacionado), puedes recuperar el contexto con 'listar_ideas'. Si una idea evoluciona hacia una decisión concreta y te pide convertirla en algo accionable, pregúntale "¿quieres que la marque como proyecto y te apunte una tarea concreta?" antes de actuar.

4. **IDEAS Y ASESORAMIENTO**: si te plantea una idea o un dilema (aunque no te pida guardarla), entra a debatirlo como lo haría una persona de confianza. Haz preguntas que ayuden a aclarar, da tu opinión cuando la tengas basada en algo, no te limites a hacer de espejo.

5. **LONGITUD**: respuestas cortas por defecto (1-3 frases). Si hay que extenderse, hazlo sin paja. Una respuesta corta no es seca: puede ser breve y cálida a la vez.`;
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
  let anyToolCalled = false;
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

        // Detector: si Claudie diu "apuntad-", "anotad-", etc. però no ha cridat cap tool en TOT el loop
        const claimsAction = /\b(apuntad|anotad|guardad|añadid|memoriz|recordad)/i.test(finalText);
        if (claimsAction && !anyToolCalled) {
          state.messages.push({
            role: 'system',
            content: '⚠ Claudie dice que ha apuntado algo pero no ha llamado a la herramienta. Pídele que lo apunte de verdad.',
            ts: Date.now()
          });
        }
        renderMessages();
        saveStateToServer();
      }
      return;
    }

    anyToolCalled = true;

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
        const cat = tu.input.category === 'pro' ? 'Profesional' : 'Personal';
        const dl = tu.input.deadline ? ` · vence ${tu.input.deadline}` : '';
        const pr = tu.input.priority === 'urgent' ? ' · urgente' : (tu.input.priority === 'setmana' ? ' · semana' : '');
        toolActions.push(`✓ Apuntada en ${cat}${dl}${pr}: «${tu.input.text}»`);
      } else if (tu.name === 'modificar_tasca' && result.success) {
        toolActions.push(`✓ Tarea modificada`);
      } else if (tu.name === 'marcar_tasca' && result.success) {
        toolActions.push(result.missatge === 'Marcada com a feta' ? `✓ Marcada como hecha` : `↩ Devuelta a pendiente`);
      } else if (tu.name === 'eliminar_tasca' && result.success) {
        toolActions.push(`✗ Tarea eliminada`);
      } else if (tu.name === 'afegir_al_perfil' && result.success) {
        toolActions.push(`✓ Anotado en el perfil (${tu.input.category})`);
      } else if (tu.name === 'eliminar_del_perfil' && result.success) {
        toolActions.push(`✗ Entrada del perfil eliminada`);
      } else if (tu.name === 'guardar_idea' && result.success) {
        toolActions.push(`💡 Idea guardada en ${tu.input.category}: «${tu.input.title}»`);
      } else if (tu.name === 'modificar_idea' && result.success) {
        if (tu.input.status === 'descartada') toolActions.push(`✗ Idea descartada`);
        else if (tu.input.status === 'proyecto') toolActions.push(`→ Idea convertida en proyecto`);
        else if (tu.input.status === 'viva') toolActions.push(`↩ Idea reactivada`);
        else toolActions.push(`✓ Idea modificada`);
      } else if (tu.name === 'eliminar_idea' && result.success) {
        toolActions.push(`🗑 Idea eliminada`);
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
  renderIdeas();
  updateTasksBadge();
  updateIdeasBadge();

  bindAppEvents();

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

  // Drawer Ideas
  document.getElementById('open-ideas').addEventListener('click', () => {
    document.getElementById('ideas-drawer').classList.remove('hidden');
    currentIdeasFilter = 'viva';
    document.querySelectorAll('.ideas-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.status === 'viva');
    });
    renderIdeas();
  });
  document.getElementById('close-ideas').addEventListener('click', () => {
    document.getElementById('ideas-drawer').classList.add('hidden');
  });
  document.getElementById('ideas-drawer').addEventListener('click', (e) => {
    if (e.target.id === 'ideas-drawer') {
      document.getElementById('ideas-drawer').classList.add('hidden');
    }
  });
  document.querySelectorAll('.ideas-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.ideas-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      currentIdeasFilter = t.dataset.status;
      renderIdeas();
    });
  });
  document.getElementById('ideas-content').addEventListener('click', (e) => {
    const entry = e.target.closest('.idea-entry');
    if (!entry) return;
    if (e.target.closest('.idea-delete')) {
      if (confirm('¿Eliminar esta idea?')) deleteIdea(entry.dataset.id);
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
      renderIdeas();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
