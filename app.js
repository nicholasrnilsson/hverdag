'use strict';
/*
  Hverdag – fase 1 (MVP)
  ----------------------
  Alt gemmes lokalt på telefonen (localStorage). Der er ingen server og intet login.
  Filen er delt op i afsnit:
    1. Indstillinger og konstanter
    2. Data (indlæs, gem, backup)
    3. Dato-hjælpere
    4. Beregninger (dagens punkter, ledig tid, ugebelastning, forslag)
    5. Visninger (I dag, Uge, Opgaver, Mere)
    6. Formularer (tilføj/ret)
    7. Knapper og opstart
*/

// ============ 1. Indstillinger og konstanter ============
const STORE_KEY = 'hverdag.data.v1';
const APP_VERSION = '1.0 – fase 1';

// Opgavestørrelser i timer
const SIZES = { S: 1, M: 3, L: 8, XL: 15 };

// Grænser for ugebelastning: hvor stor en del af den ledige tid skolen kræver
const LOAD_OK = 0.5;    // op til 50 % → grøn
const LOAD_TIGHT = 0.8; // op til 80 % → gul, derover → rød

const TYPES = {
  task:     'Opgave',
  training: 'Træning',
  shift:    'Vagt',
  social:   'Socialt',
  school:   'Skole',
};
const KINDS = { run: 'Løb', strength: 'Styrke', bike: 'Cykling', football: 'Fodbold', rest: 'Hvile' };
const DAYS_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAYS_LONG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// ============ 2. Data ============
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function defaultData() {
  return {
    version: 1,
    events: [],     // enkeltstående punkter: træning, vagter, sociale planer, ekstra skole
    tasks: [],      // opgaver med deadline og estimat
    templates: [    // faste ugentlige punkter (rettes under "Mere")
      ...[1, 2, 3, 4, 5].map(wd => ({ id: uid(), type: 'school', title: 'Undervisning', weekday: wd, start: '08:30', end: '12:00', skip: [] })),
      { id: uid(), type: 'training', kind: 'football', title: 'Fodbold', weekday: 2, start: '19:00', end: '20:30', skip: [] },
    ],
    settings: {
      dayStart: '07:30',   // hvornår dagen starter
      dayEnd: '22:00',     // hvornår dagen slutter
      overhead: 2.5,       // timer pr. dag til mad, transport, pauser
      lastBackup: null,
    },
  };
}

function migrate(d) {
  const def = defaultData();
  return {
    ...def, ...d,
    events: Array.isArray(d.events) ? d.events : [],
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    templates: Array.isArray(d.templates) ? d.templates : def.templates,
    settings: { ...def.settings, ...(d.settings || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error('Kunne ikke læse data', e); }
  return defaultData();
}

let data = load();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch (e) { alert('Kunne ikke gemme: ' + e.message); }
}
save();

async function exportBackup() {
  const name = `hverdag-backup-${todayStr()}.json`;
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  // På iPhone åbner det delingsmenuen → vælg "Gem i Filer"
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      markBackup();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  markBackup();
}
function markBackup() { data.settings.lastBackup = todayStr(); save(); render(); toast('Backup gemt'); }

function importBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { alert('Filen kunne ikke læses som backup.'); return; }
  if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.events)) { alert('Det ligner ikke en Hverdag-backup.'); return; }
  if (!confirm('Erstat alt i appen med indholdet af backup-filen?')) return;
  data = migrate(d);
  save(); render(); toast('Backup indlæst');
}

// ============ 3. Dato-hjælpere ============
const pad = n => String(n).padStart(2, '0');
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayStr() { return ymd(new Date()); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function isoWeekday(s) { return parseYmd(s).getDay() || 7; } // 1 = mandag … 7 = søndag
function mondayOf(s) { return addDays(s, 1 - isoWeekday(s)); }
function isoWeek(s) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fromMin(m) { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function durH(start, end) { let d = toMin(end) - toMin(start); if (d <= 0) d += 1440; return d / 60; }
function fmtDate(s) { const d = parseYmd(s); return `${DAYS_LONG[isoWeekday(s) - 1]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`; }
function shortDate(s) { const d = parseYmd(s); return `${DAYS_SHORT[isoWeekday(s) - 1]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`; }
function fmtH(h) {
  let r = Math.round(h * 2) / 2;
  if (h > 0 && r === 0) r = 0.5;
  return String(r).replace('.', ',') + ' t';
}
function relDays(date) {
  const n = daysBetween(todayStr(), date);
  if (n === 0) return 'i dag';
  if (n === 1) return 'i morgen';
  if (n === -1) return 'i går';
  if (n < 0) return `${-n} dage over`;
  return `om ${n} dage`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ 4. Beregninger ============
function hasTime(i) { return !!(i.start && i.end); }

// Alle punkter på en dato: enkeltstående + faste ugepunkter
function itemsForDate(date) {
  const wd = isoWeekday(date);
  const out = data.events.filter(e => e.date === date).map(e => ({ ...e, source: 'event' }));
  for (const t of data.templates) {
    if (t.weekday === wd && !(t.skip || []).includes(date)) {
      out.push({ ...t, id: undefined, templateId: t.id, date, source: 'template' });
    }
  }
  return out.sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
}

// Ledig tid på en dag (i dag: kun resten af dagen)
function dayCapacity(date) {
  const s = data.settings;
  const dayS = toMin(s.dayStart), dayE = toMin(s.dayEnd);
  const from = date === todayStr() ? Math.max(dayS, nowMin()) : dayS;
  if (from >= dayE || dayE <= dayS) return { awake: 0, booked: 0, free: 0 };
  const fraction = (dayE - from) / (dayE - dayS);
  const awake = (dayE - from) / 60 - Number(s.overhead || 0) * fraction;
  let booked = 0;
  for (const i of itemsForDate(date)) {
    if (!hasTime(i)) continue;
    let a = toMin(i.start), b = toMin(i.end);
    if (b <= a) b = dayE;               // går over midnat → tæl til dagens slut
    a = Math.max(a, from); b = Math.min(b, dayE);
    if (b > a) booked += (b - a) / 60;
  }
  return { awake, booked, free: Math.max(0, awake - booked) };
}

function openTasks() { return data.tasks.filter(t => !t.done); }
function remaining(t) { return Math.max(0, Number(t.hours || 0) - Number(t.doneHours || 0)); }

// En opgaves resterende timer fordeles jævnt fra i dag til dagen før deadline
function taskWindow(t) {
  const today = todayStr();
  if (t.deadline <= today) return { start: today, end: today, len: 1 };
  const end = addDays(t.deadline, -1);
  return { start: today, end, len: daysBetween(today, end) + 1 };
}
function taskShare(t, from, to) {
  const w = taskWindow(t);
  const a = from > w.start ? from : w.start;
  const b = to < w.end ? to : w.end;
  if (b < a) return 0;
  return remaining(t) * (daysBetween(a, b) + 1) / w.len;
}

// Hvor travl er ugen? Sammenligner skolearbejde med ledig tid fra nu og ugen ud
function weekLoad(weekStart) {
  const today = todayStr();
  const weekEnd = addDays(weekStart, 6);
  if (weekEnd < today) return { past: true };
  const from = weekStart > today ? weekStart : today;
  let free = 0, booked = 0;
  for (let d = from; d <= weekEnd; d = addDays(d, 1)) {
    const c = dayCapacity(d);
    free += c.free; booked += c.booked;
  }
  const need = needBetween(from, weekEnd);
  const ratio = calcRatio(need, free);

  // Tjek også hver deadline i ugen: weekendens fritid hjælper ikke en opgave, der skal afleveres fredag.
  let worst = { ratio, end: weekEnd, need, free, deadline: null };
  const deadlines = [...new Set(openTasks().map(t => t.deadline).filter(d => d >= from && d <= weekEnd))].sort();
  for (const D of deadlines) {
    const end = D > from ? addDays(D, -1) : from;
    const n = needBetween(from, end), f = freeBetween(from, end);
    const r = calcRatio(n, f);
    if (r > worst.ratio) worst = { ratio: r, end, need: n, free: f, deadline: D };
  }
  const level = worst.ratio <= LOAD_OK ? 'ok' : worst.ratio <= LOAD_TIGHT ? 'tight' : 'over';
  const sug = level === 'ok' ? null : suggestMoves(from, worst.end, worst.need, worst.free, level);
  return { from, weekEnd, free, booked, need, ratio, level, sug, worst };
}
function calcRatio(need, free) { return need < 0.01 ? 0 : (free > 0 ? need / free : Infinity); }
function needBetween(a, b) { return openTasks().reduce((s, t) => s + taskShare(t, a, b), 0); }
function freeBetween(a, b) { let f = 0; for (let d = a; d <= b; d = addDays(d, 1)) f += dayCapacity(d).free; return f; }
// Timer et punkt optager inden for din dag (dagstart–dagslut)
function hoursInDay(i) {
  const dayS = toMin(data.settings.dayStart), dayE = toMin(data.settings.dayEnd);
  let a = toMin(i.start), b = toMin(i.end);
  if (b <= a) b = dayE;
  return Math.max(0, Math.min(b, dayE) - Math.max(a, dayS)) / 60;
}

// Forslag til hvad der kan flyttes. Rækkefølge: fleksibel træning → faste træninger → sociale planer.
// Appen flytter aldrig noget selv – den foreslår kun.
function suggestMoves(from, to, need, free, level) {
  const target = level === 'over' ? LOAD_TIGHT : LOAD_OK;
  const today = todayStr(), now = nowMin();
  const cands = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const i of itemsForDate(d)) {
      if (!hasTime(i) || i.locked || i.done || i.kind === 'rest') continue;
      if (i.type !== 'training' && i.type !== 'social') continue;
      if (d === today && toMin(i.start) < now) continue;
      const rank = i.type === 'training' ? (i.source === 'event' ? 0 : 1) : 2;
      const h = hoursInDay(i);
      if (h > 0) cands.push({ item: i, h, rank });
    }
  }
  cands.sort((a, b) => a.rank - b.rank || b.h - a.h);
  const picks = [];
  let freed = 0;
  for (const c of cands) {
    if (need / (free + freed) <= target) break;
    picks.push(c); freed += c.h;
  }
  const enough = free + freed > 0 && need / (free + freed) <= LOAD_TIGHT;
  return { picks, freed, enough };
}

// ============ 5. Visninger ============
const state = { tab: 'today', weekStart: mondayOf(todayStr()) };
const $ = sel => document.querySelector(sel);

function setHeader(title, sub) { $('#title').textContent = title; $('#subtitle').textContent = sub || ''; }

function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const views = { today: renderToday, week: renderWeek, tasks: renderTasks, more: renderMore };
  $('#view').innerHTML = views[state.tab]();
}

function itemLabel(i) {
  if (i.type === 'training') {
    const k = KINDS[i.kind] || 'Træning';
    return i.title && i.title !== k ? `${k}: ${i.title}` : k;
  }
  return i.title || TYPES[i.type];
}
function timeLabel(i) { return hasTime(i) ? `${i.start}–${i.end}` : 'Hele dagen'; }
function itemAttrs(i) {
  return i.source === 'template'
    ? `data-action="openItem" data-tpl="${i.templateId}" data-date="${i.date}"`
    : `data-action="openItem" data-id="${i.id}"`;
}

function itemRow(i) {
  const tags = [];
  if (i.source === 'template') tags.push('<span class="tag">fast</span>');
  if (i.locked) tags.push('<span class="tag lock">låst</span>');
  return `<button class="item t-${i.type} ${i.done ? 'done' : ''}" ${itemAttrs(i)}>
    <span class="time">${timeLabel(i)}</span>
    <span class="what"><b>${esc(itemLabel(i))}</b> ${tags.join(' ')}<br><span class="muted small">${TYPES[i.type]}</span></span>
  </button>`;
}

function loadCard(L) {
  if (L.past) return '';
  const head = { ok: 'Ugen ser fin ud', tight: 'Ugen er stram', over: 'For travl uge' }[L.level];
  const pct = Math.min(100, Math.round(L.worst.ratio * 100)) || 0;
  let h = `<div class="card load ${L.level}">
    <div class="headline">${head}</div>
    <div class="meter"><div style="width:${pct}%"></div></div>
    <div class="small">Skolearbejde resten af ugen: <b>${fmtH(L.need)}</b> · Ledig tid: <b>${fmtH(L.free)}</b></div>`;
  const W = L.worst;
  if (W && W.deadline && W.ratio > L.ratio) {
    const t = openTasks().filter(x => x.deadline === W.deadline).sort(sortTasks)[0];
    h += `<div class="small" style="margin-top:4px">Tættest op til <b>${esc(t.title)}</b> (${shortDate(W.deadline)}): <b>${fmtH(W.need)}</b> skolearbejde på <b>${fmtH(W.free)}</b> ledig tid.</div>`;
  }
  if (L.sug) {
    const { picks, freed, enough } = L.sug;
    if (picks.length) {
      h += `<div class="suggest"><div class="small"><b>${L.level === 'over' ? 'Skolen går først. Overvej at flytte:' : 'Hvis du vil have mere luft:'}</b></div>`;
      for (const p of picks) {
        h += `<div class="suggest-row"><span>${esc(itemLabel(p.item))} · ${shortDate(p.item.date)} ${p.item.start} (${fmtH(p.h)})</span>
          <button class="btn" ${itemAttrs(p.item)}>Flyt</button></div>`;
      }
      h += `<div class="small muted">Frigør ca. ${fmtH(freed)}.</div></div>`;
    }
    if (L.level === 'over' && !enough) {
      h += `<div class="warn small">Selv uden træning og sociale planer er der for lidt tid. Tal med din gruppe eller underviser, eller se på dine vagter.</div>`;
    }
  }
  return h + '</div>';
}

function backupBanner() {
  const last = data.settings.lastBackup;
  const hasData = data.tasks.length || data.events.length;
  if (!hasData || (last && daysBetween(last, todayStr()) < 7)) return '';
  return `<div class="banner"><span>${last ? `Sidste backup: ${relDays(last).replace('dage over', 'dage siden')}` : 'Du har ikke taget backup endnu.'}</span>
    <button class="btn" data-action="backup">Tag backup</button></div>`;
}

function taskCard(t, opts = {}) {
  const today = todayStr();
  const overdue = t.deadline < today && !t.done;
  const soon = !overdue && daysBetween(today, t.deadline) <= 2;
  const pct = t.hours > 0 ? Math.min(100, Math.round(((t.doneHours || 0) / t.hours) * 100)) : 0;
  const dueCls = overdue ? 'due-over' : soon ? 'due-soon' : '';
  const extra = opts.todayH ? ` · <b>≈ ${fmtH(opts.todayH)} i dag</b>` : '';
  return `<div class="card task-card ${overdue ? 'overdue' : ''}">
    <div class="task-top">
      <button class="title" data-action="editTask" data-id="${t.id}">${esc(t.title)}</button>
      ${t.important ? '<span class="tag lock">vigtig</span>' : ''}
    </div>
    <div class="task-meta small muted">${t.subject ? esc(t.subject) + ' · ' : ''}<span class="${dueCls}">Deadline ${shortDate(t.deadline)} (${relDays(t.deadline)})</span>${extra}</div>
    ${t.done ? '' : `<div class="progress"><div style="width:${pct}%"></div></div>`}
    <div class="task-actions">
      <span class="grow small muted">${t.done ? 'Færdig' : `${fmtH(t.doneHours || 0)} af ${fmtH(t.hours)}`}</span>
      ${t.done
        ? `<button class="btn" data-action="undoTask" data-id="${t.id}">Fortryd</button>`
        : `<button class="btn" data-action="plusHour" data-id="${t.id}">+1 t</button>
           <button class="btn primary" data-action="doneTask" data-id="${t.id}">Færdig</button>`}
    </div>
  </div>`;
}

function sortTasks(a, b) {
  return (b.important ? 1 : 0) - (a.important ? 1 : 0) || a.deadline.localeCompare(b.deadline);
}

function renderToday() {
  const t = todayStr();
  setHeader('I dag', `${fmtDate(t)} · uge ${isoWeek(t)}`);
  const L = weekLoad(mondayOf(t));
  const items = itemsForDate(t);
  const focus = openTasks()
    .map(task => ({ task, h: taskShare(task, t, t) }))
    .filter(x => x.h > 0.01)
    .sort((a, b) => (a.task.deadline < t ? -1 : 0) - (b.task.deadline < t ? -1 : 0) || sortTasks(a.task, b.task));
  const totalToday = focus.reduce((s, x) => s + x.h, 0);

  let h = backupBanner() + loadCard(L);
  h += `<h2>Program</h2>`;
  h += items.length ? items.map(itemRow).join('') : `<div class="empty">Intet planlagt i dag.</div>`;
  h += `<h2>Skolearbejde i dag ${totalToday > 0 ? '≈ ' + fmtH(totalToday) : ''}</h2>`;
  if (!focus.length) {
    h += `<div class="empty">Ingen åbne opgaver. Tryk + for at tilføje en.</div>`;
  } else {
    h += focus.slice(0, 5).map(x => taskCard(x.task, { todayH: x.h })).join('');
    if (focus.length > 5) h += `<button class="linkbtn" data-action="tab" data-tab="tasks">Se alle ${focus.length} opgaver</button>`;
  }
  return h;
}

function renderWeek() {
  const ws = state.weekStart, we = addDays(ws, 6), today = todayStr();
  setHeader(`Uge ${isoWeek(ws)}`, `${shortDate(ws)} – ${shortDate(we)}`);
  const L = weekLoad(ws);
  let h = `<div class="weeknav">
    <button class="btn" data-action="weekPrev">‹ Forrige</button>
    ${ws !== mondayOf(today) ? `<button class="linkbtn" data-action="weekNow">Denne uge</button>` : ''}
    <button class="btn" data-action="weekNext">Næste ›</button>
  </div>`;
  h += L.past ? `<div class="card small muted">Ugen er overstået.</div>` : loadCard(L);
  for (let d = ws; d <= we; d = addDays(d, 1)) {
    const items = itemsForDate(d);
    const deadlines = openTasks().filter(t => t.deadline === d);
    const booked = items.filter(hasTime).reduce((s, i) => s + durH(i.start, i.end), 0);
    h += `<div class="day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}">
      <div class="day-head"><b>${shortDate(d)}</b><span class="small muted">${booked ? fmtH(booked) + ' booket' : ''}</span>
        <button class="day-add" data-action="openAdd" data-date="${d}" aria-label="Tilføj">+</button></div>
      ${deadlines.map(t => `<button class="deadline-chip" style="border:0" data-action="editTask" data-id="${t.id}">Deadline: ${esc(t.title)}</button>`).join('')}
      ${items.map(i => `<button class="mini t-${i.type}" ${itemAttrs(i)} style="border-left-color:var(--${i.type})">
          <span class="time">${timeLabel(i)}</span><span>${esc(itemLabel(i))}${i.done ? ' ✓' : ''}</span></button>`).join('')}
      ${!items.length && !deadlines.length ? '<div class="small muted" style="padding-top:4px">Fri</div>' : ''}
    </div>`;
  }
  return h;
}

function renderTasks() {
  const today = todayStr(), weekEnd = addDays(mondayOf(today), 6);
  setHeader('Opgaver', `${openTasks().length} åbne`);
  const open = openTasks().sort(sortTasks);
  const groups = [
    ['Over deadline', open.filter(t => t.deadline < today)],
    ['Denne uge', open.filter(t => t.deadline >= today && t.deadline <= weekEnd)],
    ['Senere', open.filter(t => t.deadline > weekEnd)],
  ];
  let h = '';
  for (const [name, list] of groups) if (list.length) h += `<h2>${name}</h2>` + list.map(t => taskCard(t)).join('');
  if (!open.length) h += `<div class="empty">Ingen åbne opgaver. Tryk + for at tilføje en.</div>`;
  const done = data.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 8);
  if (done.length) h += `<h2>Senest færdige</h2>` + done.map(t => taskCard(t)).join('');
  return h;
}

function renderMore() {
  setHeader('Mere', '');
  const s = data.settings;
  const tpls = [...data.templates].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  let h = `<h2>Faste ugepunkter</h2><div class="card">`;
  h += tpls.length ? tpls.map(t => `<div class="tpl-row">
      <button class="grow" data-action="editTemplate" data-id="${t.id}">
        <b>${DAYS_SHORT[t.weekday - 1]}</b> ${t.start}–${t.end} · ${esc(itemLabel(t))}
      </button>
      <button class="btn danger" data-action="deleteTemplate" data-id="${t.id}">Slet</button>
    </div>`).join('') : '<div class="empty">Ingen faste punkter.</div>';
  h += `</div><button class="btn block" data-action="addTemplate">+ Tilføj fast punkt</button>
    <p class="small muted">Fx undervisning, fodbold eller en fast vagt. Er der ingen undervisning en enkelt dag, så tryk på punktet i dagens program og vælg "Aflys denne gang".</p>`;

  h += `<h2>Din dag</h2><div class="card">
    <div class="setting-row"><span>Dagen starter</span><input type="time" data-setting="dayStart" value="${s.dayStart}"></div>
    <div class="setting-row"><span>Dagen slutter</span><input type="time" data-setting="dayEnd" value="${s.dayEnd}"></div>
    <div class="setting-row"><span>Mad, transport og pauser (timer/dag)</span><input type="number" step="0.5" min="0" max="8" data-setting="overhead" value="${s.overhead}"></div>
  </div>
  <p class="small muted">Bruges til at regne ud, hvor meget ledig tid du har til skolearbejde.</p>`;

  h += `<h2>Backup</h2><div class="card">
    <p class="small" style="margin-top:0">Dine data ligger kun på denne telefon. Tag en backup en gang om ugen og gem den i Filer/iCloud.
    ${s.lastBackup ? `Sidste backup: ${shortDate(s.lastBackup)}.` : 'Du har ikke taget backup endnu.'}</p>
    <button class="btn block primary" data-action="backup">Tag backup</button>
    <button class="btn block" data-action="restore">Indlæs backup</button>
  </div>
  <p class="small muted" style="text-align:center">Hverdag ${APP_VERSION}</p>`;
  return h;
}

// ============ 6. Formularer ============
// Ét ark bruges til alt: tilføj, ret, og detaljer om et punkt.
function openSheet(html) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  sheet.hidden = false; $('#backdrop').hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}
function closeSheet() {
  const sheet = $('#sheet');
  sheet.classList.remove('open'); $('#backdrop').hidden = true;
  setTimeout(() => { if (!sheet.classList.contains('open')) { sheet.hidden = true; sheet.innerHTML = ''; } }, 230);
}

let formCtx = null; // { type, mode: 'event'|'template'|'task', item, date }

function chipRadio(name, value, label, checked) {
  return `<label class="chip"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
}
function field(label, inner) { return `<div class="field"><div class="label">${label}</div>${inner}</div>`; }
function input(name, type, value, attrs = '') { return `<input type="${type}" name="${name}" value="${esc(value ?? '')}" ${attrs}>`; }

function dateOrWeekday(v) {
  if (formCtx.mode === 'template') {
    const wd = v.weekday || isoWeekday(formCtx.date || todayStr());
    return field('Ugedag', `<div class="chips">${DAYS_SHORT.map((d, i) => chipRadio('weekday', i + 1, d, wd === i + 1)).join('')}</div>`);
  }
  return field('Dato', input('date', 'date', v.date || formCtx.date || todayStr(), 'required'));
}
function timeFields(v, defStart, defEnd, durs) {
  const start = v.start || defStart, end = v.end || defEnd;
  return `<div class="timefields">
    <div class="row2">${field('Start', input('start', 'time', start, 'required'))}${field('Slut', input('end', 'time', end, 'required'))}</div>
    ${durs ? `<div class="chips">${durs.map(m => `<button type="button" class="chipbtn" data-action="setDur" data-min="${m}">${m < 60 ? m + ' min' : String(m / 60).replace('.', ',') + ' t'}</button>`).join('')}</div>` : ''}
  </div>`;
}

function recentSubjects() {
  const seen = [];
  for (const t of [...data.tasks].reverse()) if (t.subject && !seen.includes(t.subject)) seen.push(t.subject);
  return seen.slice(0, 5);
}

function formHtml() {
  const { type, mode, item } = formCtx;
  const v = item || {};
  const editing = !!item;
  let h = `<p class="sheet-title">${editing ? 'Ret' : mode === 'template' ? 'Nyt fast punkt' : 'Tilføj'}${editing ? ' ' + TYPES[type].toLowerCase() : ''}</p>`;
  if (!editing) {
    const types = mode === 'template' ? ['school', 'training', 'shift', 'social'] : ['task', 'training', 'shift', 'social', 'school'];
    h += `<div class="chips typechips">${types.map(t => `<button type="button" class="chipbtn ${t === type ? 'on' : ''}" data-action="formType" data-type="${t}">${TYPES[t]}</button>`).join('')}</div>`;
  }
  h += `<form id="f" data-type="${type}" data-kind="${esc(v.kind || 'run')}" autocomplete="off">`;

  if (type === 'task') {
    const size = v.size || 'M';
    const subs = recentSubjects();
    h += field('Hvad skal laves?', input('title', 'text', v.title, 'required placeholder="fx Rapport om værdikæder"'));
    h += field('Fag', input('subject', 'text', v.subject, 'placeholder="fx VCM"') +
      (subs.length ? `<div class="chips" style="margin-top:8px">${subs.map(s => `<button type="button" class="chipbtn" data-action="pickSubject" data-value="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''));
    h += field('Deadline', input('deadline', 'date', v.deadline || addDays(todayStr(), 7), 'required'));
    h += field('Hvor stor? (estimat)', `<div class="chips">${Object.entries(SIZES).map(([k, hrs]) => chipRadio('size', k, `${k} · ${hrs} t`, size === k)).join('')}</div>`);
    h += `<div class="row2">${field('Timer i alt', input('hours', 'number', v.hours ?? SIZES[size], 'step="0.5" min="0.5" inputmode="decimal"'))}
      ${editing ? field('Allerede brugt', input('doneHours', 'number', v.doneHours || 0, 'step="0.5" min="0" inputmode="decimal"')) : '<div></div>'}</div>`;
    h += `<label class="check"><input type="checkbox" name="important" ${v.important ? 'checked' : ''}> Vigtig (tæller til karakter/eksamen)</label>`;
  }

  if (type === 'training') {
    const kind = v.kind || 'run';
    h += field('Type', `<div class="chips">${Object.entries(KINDS).map(([k, l]) => chipRadio('kind', k, l, kind === k)).join('')}</div>`);
    h += dateOrWeekday(v);
    h += timeFields(v, '17:00', '18:00', [30, 45, 60, 90, 120]);
    h += field('Note (valgfri)', input('title', 'text', v.title && v.title !== KINDS[kind] ? v.title : '', 'placeholder="fx Intervaller 6×800 m"'));
  }

  if (type === 'shift') {
    h += dateOrWeekday(v);
    h += timeFields(v, '16:00', '21:00');
    h += field('Titel (valgfri)', input('title', 'text', v.title || '', 'placeholder="Vagt"'));
  }

  if (type === 'social') {
    h += field('Hvad?', input('title', 'text', v.title || '', 'required placeholder="fx Middag med Mads"') +
      `<div class="chips" style="margin-top:8px">${['Pokeraften', 'Venner', 'Fest', 'Familie'].map(s => `<button type="button" class="chipbtn" data-action="pickTitle" data-value="${s}">${s}</button>`).join('')}</div>`);
    h += dateOrWeekday(v);
    h += timeFields(v, '19:00', '22:00', [60, 120, 180, 240]);
  }

  if (type === 'school') {
    h += field('Titel', input('title', 'text', v.title || 'Undervisning', 'required'));
    h += dateOrWeekday(v);
    h += timeFields(v, '08:30', '12:00');
  }

  h += `<div class="form-actions">
    ${editing ? `<button type="button" class="btn danger" data-action="deleteCurrent">Slet</button>` : `<button type="button" class="btn" data-action="closeSheet">Annullér</button>`}
    <button type="submit" class="btn primary">Gem</button>
  </div></form>`;
  return h;
}

function openForm(ctx) {
  formCtx = ctx;
  openSheet(formHtml());
}

function submitForm(form) {
  const fd = new FormData(form);
  const g = k => (fd.get(k) ?? '').toString().trim();
  const { type, mode, item } = formCtx;

  if (type === 'task') {
    const hours = parseFloat(g('hours').replace(',', '.'));
    const obj = {
      title: g('title'), subject: g('subject'), deadline: g('deadline'),
      size: g('size') || 'M', hours: hours > 0 ? hours : SIZES[g('size') || 'M'],
      important: fd.get('important') === 'on',
    };
    if (!obj.title || !obj.deadline) return;
    if (item) {
      const dh = parseFloat(g('doneHours').replace(',', '.'));
      Object.assign(item, obj, { doneHours: dh >= 0 ? dh : item.doneHours || 0 });
    } else {
      data.tasks.push({ id: uid(), ...obj, doneHours: 0, done: false, createdAt: todayStr() });
    }
  } else {
    const obj = { type };
    if (type === 'training') obj.kind = g('kind') || 'run';
    obj.title = g('title') || (type === 'training' ? KINDS[obj.kind] : TYPES[type]);
    if (obj.kind === 'rest') { obj.start = null; obj.end = null; }
    else { obj.start = g('start'); obj.end = g('end'); if (!obj.start || !obj.end) return; }
    if (mode === 'template') {
      obj.weekday = Number(g('weekday'));
      if (!obj.weekday) return;
      if (item) Object.assign(item, obj);
      else data.templates.push({ id: uid(), ...obj, skip: [] });
    } else {
      obj.date = g('date');
      if (!obj.date) return;
      if (item) Object.assign(item, obj);
      else data.events.push({ id: uid(), ...obj, done: false });
    }
  }
  save(); closeSheet(); render();
  toast(item ? 'Gemt' : 'Tilføjet');
}

// Detaljer for et punkt i programmet
function openItemSheet(el) {
  let i;
  if (el.dataset.tpl) {
    const t = data.templates.find(x => x.id === el.dataset.tpl);
    if (!t) return;
    i = { ...t, templateId: t.id, date: el.dataset.date, source: 'template' };
  } else {
    const e = data.events.find(x => x.id === el.dataset.id);
    if (!e) return;
    i = { ...e, source: 'event' };
  }
  let h = `<p class="sheet-title">${esc(itemLabel(i))}</p>
    <p class="muted" style="margin-top:0">${TYPES[i.type]} · ${fmtDate(i.date)} · ${timeLabel(i)}${i.source === 'template' ? ' · fast hver ' + DAYS_LONG[i.weekday - 1].toLowerCase() : ''}</p>`;
  if (i.source === 'template') {
    h += `<button class="btn block primary" data-action="moveOnce" data-tpl="${i.templateId}" data-date="${i.date}">Flyt eller ret kun denne gang</button>
      <button class="btn block" data-action="skipOnce" data-tpl="${i.templateId}" data-date="${i.date}">Aflys denne gang</button>
      <button class="btn block" data-action="editTemplate" data-id="${i.templateId}">Ret alle uger</button>`;
  } else {
    if (i.type === 'training' || i.type === 'social') {
      h += `<button class="btn block primary" data-action="toggleDone" data-id="${i.id}">${i.done ? 'Markér som ikke gennemført' : 'Markér som gennemført'}</button>`;
    }
    h += `<button class="btn block" data-action="editEvent" data-id="${i.id}">Flyt eller ret</button>
      <button class="btn block danger" data-action="deleteEvent" data-id="${i.id}">Slet</button>`;
  }
  h += `<button class="btn block" data-action="closeSheet">Luk</button>`;
  openSheet(h);
}

// ============ 7. Knapper og opstart ============
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 1800);
}

const actions = {
  tab: el => { state.tab = el.dataset.tab; if (state.tab === 'week') state.weekStart = mondayOf(todayStr()); render(); window.scrollTo(0, 0); },
  openAdd: el => openForm({ type: 'task', mode: 'event', date: el.dataset.date }),
  closeSheet: () => closeSheet(),
  formType: el => {
    const f = $('#f');
    const date = f && f.elements.date ? f.elements.date.value : formCtx.date;
    formCtx = { ...formCtx, type: el.dataset.type, date };
    $('#sheet').innerHTML = `<div class="grabber"></div>${formHtml()}`;
  },
  setDur: el => {
    const f = $('#f');
    if (!f.elements.start.value) return;
    f.elements.end.value = fromMin(toMin(f.elements.start.value) + Number(el.dataset.min));
    el.parentElement.querySelectorAll('.chipbtn').forEach(b => b.classList.toggle('on', b === el));
  },
  pickSubject: el => { $('#f').elements.subject.value = el.dataset.value; },
  pickTitle: el => { $('#f').elements.title.value = el.dataset.value; },

  editTask: el => { const t = data.tasks.find(x => x.id === el.dataset.id); if (t) openForm({ type: 'task', mode: 'task', item: t }); },
  plusHour: el => {
    const t = data.tasks.find(x => x.id === el.dataset.id);
    t.doneHours = (t.doneHours || 0) + 1;
    if (t.doneHours >= t.hours) toast('Estimatet er brugt – tryk Færdig, eller ret timerne');
    save(); render();
  },
  doneTask: el => {
    const t = data.tasks.find(x => x.id === el.dataset.id);
    t.done = true; t.doneAt = todayStr(); save(); render(); toast('Godt gået ✓');
  },
  undoTask: el => { const t = data.tasks.find(x => x.id === el.dataset.id); t.done = false; delete t.doneAt; save(); render(); },

  openItem: el => openItemSheet(el),
  editEvent: el => { const e = data.events.find(x => x.id === el.dataset.id); if (e) openForm({ type: e.type, mode: 'event', item: e }); },
  deleteEvent: el => {
    if (!confirm('Slet dette punkt?')) return;
    data.events = data.events.filter(x => x.id !== el.dataset.id);
    save(); closeSheet(); render(); toast('Slettet');
  },
  toggleDone: el => { const e = data.events.find(x => x.id === el.dataset.id); e.done = !e.done; save(); closeSheet(); render(); },
  skipOnce: el => {
    const t = data.templates.find(x => x.id === el.dataset.tpl);
    t.skip = [...(t.skip || []), el.dataset.date];
    save(); closeSheet(); render(); toast('Aflyst denne gang');
  },
  moveOnce: el => {
    // Laver en kopi som enkeltstående punkt og aflyser det faste punkt den dag
    const t = data.templates.find(x => x.id === el.dataset.tpl);
    const date = el.dataset.date;
    const e = { id: uid(), type: t.type, kind: t.kind, title: t.title, start: t.start, end: t.end, date, done: false };
    data.events.push(e);
    t.skip = [...(t.skip || []), date];
    save(); render();
    openForm({ type: e.type, mode: 'event', item: e });
  },

  addTemplate: () => openForm({ type: 'school', mode: 'template' }),
  editTemplate: el => { const t = data.templates.find(x => x.id === el.dataset.id); if (t) openForm({ type: t.type, mode: 'template', item: t }); },
  deleteTemplate: el => {
    if (!confirm('Slet dette faste punkt for alle uger?')) return;
    data.templates = data.templates.filter(x => x.id !== el.dataset.id);
    save(); closeSheet(); render();
  },
  deleteCurrent: () => {
    const { mode, item } = formCtx;
    if (!confirm('Slet?')) return;
    if (mode === 'task') data.tasks = data.tasks.filter(x => x !== item);
    else if (mode === 'template') data.templates = data.templates.filter(x => x !== item);
    else data.events = data.events.filter(x => x !== item);
    save(); closeSheet(); render(); toast('Slettet');
  },

  weekPrev: () => { state.weekStart = addDays(state.weekStart, -7); render(); },
  weekNext: () => { state.weekStart = addDays(state.weekStart, 7); render(); },
  weekNow: () => { state.weekStart = mondayOf(todayStr()); render(); },

  backup: () => exportBackup(),
  restore: () => $('#importFile').click(),
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { ev.preventDefault(); fn(el); }
});

document.addEventListener('submit', ev => {
  if (ev.target.id === 'f') { ev.preventDefault(); submitForm(ev.target); }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.name === 'size' && $('#f')) $('#f').elements.hours.value = SIZES[el.value];
  if (el.name === 'kind' && $('#f')) $('#f').dataset.kind = el.value;
  if (el.dataset && el.dataset.setting) {
    const key = el.dataset.setting;
    data.settings[key] = key === 'overhead' ? Math.max(0, parseFloat(el.value) || 0) : el.value;
    save(); toast('Gemt');
  }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(importBackup);
    el.value = '';
  }
});

// Opdater når appen åbnes igen (fx næste dag)
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden) render(); });

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
