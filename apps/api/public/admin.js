const $ = (id) => document.getElementById(id);
const MAX_EVENTS = 400;
const FILTERS = {
  all: () => true,
  people: (e) => e.kind === 'join' || e.kind === 'leave',
  chat: (e) => e.kind === 'chat',
  play: (e) => e.kind === 'advancement' || e.kind === 'death',
  alert: (e) => e.kind === 'warn' || e.kind === 'error',
};
const LABEL = {
  join: 'entrou no mundo',
  leave: 'saiu do mundo',
  advancement: '',
  death: '',
  command: 'usou o comando',
  chat: '',
};

let events = [];
let filter = 'all';
let source = null;
let capacity = 0;

function show(id, visible) {
  $(id).hidden = !visible;
}

async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  return res;
}

async function start() {
  const me = await api('/admin/api/me')
    .then((r) => r.json())
    .catch(() => ({ authenticated: false }));
  if (me.authenticated) openPanel();
  else showLogin();
}

function showLogin() {
  if (source) {
    source.close();
    source = null;
  }
  show('panel', false);
  show('login', true);
  $('password').value = '';
  $('password').focus();
}

async function openPanel() {
  show('login', false);
  show('panel', true);
  const res = await api('/admin/api/snapshot');
  if (res.status === 401) return showLogin();
  applySnapshot(await res.json());
  connect();
}

function connect() {
  if (source) source.close();
  source = new EventSource('/admin/api/stream');
  source.addEventListener('open', () => setLink(true));
  source.addEventListener('error', async () => {
    setLink(false);
    const me = await api('/admin/api/me')
      .then((r) => r.json())
      .catch(() => null);
    if (me && !me.authenticated) showLogin();
  });
  source.addEventListener('hello', (e) => applySnapshot(JSON.parse(e.data)));
  source.addEventListener('log', (e) => {
    const { entry, online, state } = JSON.parse(e.data);
    pushEvent(entry);
    renderOnline(online);
    renderState(state, true);
  });
  source.addEventListener('stats', (e) => {
    const { stats, queue } = JSON.parse(e.data);
    renderStats(stats);
    renderSlots(queue);
  });
}

function setLink(live) {
  const el = $('link-state');
  el.textContent = live ? 'ao vivo' : 'reconectando…';
  el.classList.toggle('live', live);
}

function applySnapshot(s) {
  events = s.logs.slice(-MAX_EVENTS);
  renderTimeline();
  renderOnline(s.server.online);
  renderState(s.server.state, s.server.logFound);
  show('log-missing', !s.server.logFound);
  renderStats(s.stats);
  renderSlots(s.queue);
}

function renderState(state, logFound) {
  const el = $('server-state');
  el.className = 'state' + (state === 'ready' ? ' ready' : state === 'stopping' ? ' stopping' : '');
  $('server-state-text').textContent = !logFound
    ? 'Sem log do servidor'
    : state === 'ready'
      ? 'Servidor no ar'
      : state === 'stopping'
        ? 'Servidor parando'
        : 'Estado desconhecido (aguardando o log)';
}

function renderSlots(queue) {
  capacity = queue.capacity;
  const box = $('slots');
  box.replaceChildren();
  for (let i = 0; i < queue.capacity; i += 1) {
    const slot = document.createElement('span');
    slot.className =
      'slot' +
      (i < queue.online ? ' online' : i < queue.online + queue.reserved ? ' reserved' : '');
    box.append(slot);
  }
  box.setAttribute('aria-label', `${queue.online} de ${queue.capacity} vagas ocupadas`);
  $('slots-text').textContent =
    `${queue.online} jogando, ${queue.reserved} reservadas, ${queue.waiting} na fila (limite de ${queue.capacity}).`;
}

function renderOnline(names) {
  const list = $('online');
  list.replaceChildren();
  for (const name of names) {
    const bedrock = name.startsWith('.');
    const li = document.createElement('li');
    const face = document.createElement('span');
    face.className = 'face' + (bedrock ? ' bedrock' : '');
    face.textContent = (bedrock ? name.slice(1) : name).charAt(0).toUpperCase() || '?';
    const label = document.createElement('span');
    label.textContent = bedrock ? name.slice(1) : name;
    const edition = document.createElement('span');
    edition.className = 'edition';
    edition.textContent = bedrock ? 'Bedrock' : 'Java';
    li.append(face, label, edition);
    list.append(li);
  }
  show('online-empty', names.length === 0);
}

function bytes(n) {
  const gb = n / 1024 ** 3;
  return gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}

function ring(id, percent, caption) {
  const el = $(id);
  const value = el.querySelector('.value');
  if (percent === null || percent === undefined) {
    el.querySelector('strong').textContent = '--';
    value.setAttribute('stroke-dashoffset', '326.7');
    return;
  }
  el.querySelector('strong').textContent = `${Math.round(percent)}%`;
  value.setAttribute('stroke-dashoffset', String(326.7 * (1 - Math.min(100, percent) / 100)));
  el.classList.toggle('warn', percent >= 70 && percent < 90);
  el.classList.toggle('hot', percent >= 90);
  el.setAttribute('aria-label', `${caption}: ${Math.round(percent)}%`);
}

function duration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function renderStats(s) {
  ring('ring-cpu', s.cpu ? s.cpu.percent : null, 'CPU');
  ring('ring-mem', s.memory ? s.memory.percent : null, 'RAM');
  ring('ring-disk', s.disk ? s.disk.percent : null, 'Disco');
  $('f-mem').textContent = s.memory
    ? `${bytes(s.memory.usedBytes)} de ${bytes(s.memory.totalBytes)}`
    : 'indisponível';
  $('f-disk').textContent = s.disk
    ? `${bytes(s.disk.usedBytes)} de ${bytes(s.disk.totalBytes)}`
    : 'indisponível';
  $('f-load').textContent = s.load ? s.load.map((n) => n.toFixed(2)).join(' / ') : 'indisponível';
  $('f-up').textContent = s.uptimeSeconds === null ? 'indisponível' : duration(s.uptimeSeconds);
  $('f-cores').textContent = s.cpu ? String(s.cpu.cores) : 'indisponível';
  const history = s.cpu ? s.cpu.history : [];
  const step = history.length > 1 ? 240 / (history.length - 1) : 0;
  $('spark')
    .querySelector('polyline')
    .setAttribute(
      'points',
      history
        .map((v, i) => `${(i * step).toFixed(1)},${(48 - (v / 100) * 46).toFixed(1)}`)
        .join(' '),
    );
}

function pushEvent(entry) {
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  renderTimeline();
}

function renderTimeline() {
  const list = $('timeline');
  list.replaceChildren();
  const visible = events.filter(FILTERS[filter]);
  for (const e of visible) {
    const li = document.createElement('li');
    li.className = `ev ${e.kind}`;
    const time = document.createElement('time');
    time.textContent = e.clock;
    const body = document.createElement('div');
    if (e.player) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = e.player.startsWith('.') ? e.player.slice(1) : e.player;
      body.append(who, ' ');
    }
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = e.text;
    body.append(what);
    if (e.detail) {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = e.detail;
      body.append(detail);
    }
    li.append(time, body);
    list.append(li);
  }
  show('timeline-empty', visible.length === 0);
}

$('filters').addEventListener('click', (ev) => {
  const button = ev.target.closest('button[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  for (const b of $('filters').querySelectorAll('button'))
    b.setAttribute('aria-pressed', String(b === button));
  renderTimeline();
});

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const error = $('login-error');
  error.hidden = true;
  const res = await api('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('password').value }),
  }).catch(() => null);
  if (res && res.ok) return openPanel();
  error.hidden = false;
  error.textContent = !res
    ? 'Não consegui falar com o servidor.'
    : res.status === 429
      ? 'Muitas tentativas. Espere alguns minutos e tente de novo.'
      : 'Senha incorreta.';
});

$('logout').addEventListener('click', async () => {
  await api('/admin/api/logout', { method: 'POST' });
  showLogin();
});

start();
