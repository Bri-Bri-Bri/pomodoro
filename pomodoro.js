// ── Element refs ──────────────────────────────────────────────
const tasksEl       = document.getElementById('tasks');
const focusM        = document.getElementById('focusM');
const shortM        = document.getElementById('shortM');
const longM         = document.getElementById('longM');
const longEvery     = document.getElementById('longEvery');
const musicMode     = document.getElementById('musicMode');
const audioFile     = document.getElementById('audioFile');
const fileRow       = document.getElementById('fileRow');
const musicVol      = document.getElementById('musicVol');
const startBtn      = document.getElementById('startBtn');
const pauseBtn      = document.getElementById('pauseBtn');
const skipBtn       = document.getElementById('skipBtn');
const resetBtn      = document.getElementById('resetBtn');
const exitStudyBtn  = document.getElementById('exitStudyBtn');
const voiceSelect   = document.getElementById('voiceSelect');
const vol           = document.getElementById('vol');
const setupView     = document.getElementById('setupView');
const studyView     = document.getElementById('studyView');
const studyTimer    = document.getElementById('studyTimer');
const studyPhase    = document.getElementById('studyPhase');
const studyTask     = document.getElementById('studyTask');
const studyCycle    = document.getElementById('studyCycle');
const studyMusicBox = document.getElementById('studyMusicBox');
const studyMusicVol = document.getElementById('studyMusicVol');
const sidebar       = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');

// ── Settings persistence ──────────────────────────────────────
const SETTINGS_KEY = 'pomodoro_settings';

function saveSettings() {
  const settings = {
    tasks:      tasksEl.value,
    focusM:     focusM.value,
    shortM:     shortM.value,
    longM:      longM.value,
    longEvery:  longEvery.value,
    musicMode:  musicMode.value,
    musicVol:   musicVol.value,
    vol:        vol.value,
    voiceName:  voices[parseInt(voiceSelect.value || '0')]?.name || '',
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function restoreSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.tasks     !== undefined) tasksEl.value    = s.tasks;
    if (s.focusM)    focusM.value    = s.focusM;
    if (s.shortM)    shortM.value    = s.shortM;
    if (s.longM)     longM.value     = s.longM;
    if (s.longEvery) longEvery.value = s.longEvery;
    if (s.musicMode) {
      musicMode.value = s.musicMode;
      fileRow.style.display = s.musicMode === 'file' ? 'block' : 'none';
    }
    if (s.musicVol !== undefined) setMusicVol(parseFloat(s.musicVol));
    if (s.vol      !== undefined) vol.value = s.vol;
    // Voice is restored by name after voices load (see populateVoices)
    if (s.voiceName) restoreSettings._pendingVoice = s.voiceName;
  } catch (e) { /* ignore corrupt settings */ }
}

// Debounced auto-save on any input change in the setup form
let _saveTimeout;
function scheduleSave() { clearTimeout(_saveTimeout); _saveTimeout = setTimeout(saveSettings, 400); }
[tasksEl, focusM, shortM, longM, longEvery, musicMode, musicVol, vol, voiceSelect]
  .forEach(el => el.addEventListener('input', scheduleSave));

// ── Voice ──────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let voices = [];

function populateVoices() {
  voices = synth.getVoices();
  voiceSelect.innerHTML = '';
  voices.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = v.name + ' (' + v.lang + (v.default ? ' ★' : '') + ')';
    voiceSelect.appendChild(o);
  });
  // Restore saved voice by name once voices are available
  const pending = restoreSettings._pendingVoice;
  if (pending) {
    const idx = voices.findIndex(v => v.name === pending);
    if (idx !== -1) voiceSelect.value = idx;
    restoreSettings._pendingVoice = null;
  }
}
populateVoices();
if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = populateVoices;

function speak(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  const idx = parseInt(voiceSelect.value || '0');
  if (voices[idx]) u.voice = voices[idx];
  u.volume = parseFloat(vol.value || '1');
  synth.cancel();
  synth.speak(u);
}

// ── Music ──────────────────────────────────────────────────────
const audioPlayer = new Audio();
audioPlayer.loop = true;
audioPlayer.volume = 0.5;

function setMusicVol(v) {
  audioPlayer.volume = v;
  musicVol.value = v;
  studyMusicVol.value = v;
}
musicVol.addEventListener('input', () => setMusicVol(parseFloat(musicVol.value)));
studyMusicVol.addEventListener('input', () => setMusicVol(parseFloat(studyMusicVol.value)));

musicMode.addEventListener('change', () => {
  fileRow.style.display = musicMode.value === 'file' ? 'block' : 'none';
});

function maybePlayMusic() {
  if (musicMode.value === 'file' && audioFile.files.length > 0) {
    audioPlayer.src = URL.createObjectURL(audioFile.files[0]);
    audioPlayer.loop = true;
    audioPlayer.play().catch(() => {});
    studyMusicBox.style.display = 'block';
  }
}
function stopMusic() {
  audioPlayer.pause();
  audioPlayer.src = '';
  studyMusicBox.style.display = 'none';
}

// ── Timer state ────────────────────────────────────────────────
let timerInterval = null;
let remaining = 0;
let phase = 'idle';
let cycleCount = 0;
let taskIndex = 0;
let taskList = [];

function loadTasks() {
  taskList = tasksEl.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!taskList.length) taskList = ['No tasks defined'];
}
function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ── View switching ─────────────────────────────────────────────
function enterStudyMode() {
  setupView.classList.add('hidden');
  studyView.classList.add('active');
  closeSidebar();
}
function exitStudyMode() {
  studyView.classList.remove('active');
  setupView.classList.remove('hidden');
}

// ── Timer control ──────────────────────────────────────────────
function startTimer() {
  loadTasks();
  phase = 'focus';
  remaining = parseInt(focusM.value, 10) * 60;
  announceStart();
  startInterval();
  pauseBtn.textContent = 'Pause';
  enterStudyMode();
}

function startInterval() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(timerInterval); onPhaseEnd(); }
    refreshUI();
  }, 1000);
  refreshUI();
}

function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval); timerInterval = null;
    pauseBtn.textContent = 'Resume';
    audioPlayer.pause();
  } else {
    startInterval();
    pauseBtn.textContent = 'Pause';
    if (audioPlayer.src && (phase === 'short' || phase === 'long')) audioPlayer.play().catch(() => {});
  }
}

function resetAll() {
  clearInterval(timerInterval); timerInterval = null;
  phase = 'idle'; remaining = 0; cycleCount = 0; taskIndex = 0;
  pauseBtn.textContent = 'Pause';
  audioPlayer.pause(); audioPlayer.src = '';
  studyMusicBox.style.display = 'none';
  exitStudyMode();
  refreshUI();
}

function skipPhase() {
  clearInterval(timerInterval); timerInterval = null;
  onPhaseEnd();
}

function onPhaseEnd() {
  if (phase === 'focus') {
    cycleCount++;
    if (cycleCount % parseInt(longEvery.value || '4') === 0) {
      phase = 'long'; remaining = parseInt(longM.value, 10) * 60;
    } else {
      phase = 'short'; remaining = parseInt(shortM.value, 10) * 60;
    }
    announceBreakStart();
    maybePlayMusic();
  } else if (phase === 'short' || phase === 'long') {
    phase = 'focus'; remaining = parseInt(focusM.value, 10) * 60;
    stopMusic();
    taskIndex = (taskIndex + 1) % (taskList.length || 1);
    announceStart();
  } else {
    phase = 'idle';
  }
  startInterval();
  refreshUI();
}

function announceStart() {
  loadTasks();
  const t = taskList[taskIndex] || 'Next task';
  speak('Start focus: ' + t);
  studyPhase.textContent = 'Focus';
  studyTask.textContent = t;
  studyCycle.textContent = 'Cycle ' + (cycleCount + 1) + ' · task ' + (taskIndex + 1) + ' / ' + taskList.length;
}
function announceBreakStart() {
  const txt = phase === 'short' ? 'Short break' : 'Long break';
  speak(txt + '. Relax for ' + Math.round(remaining / 60) + ' minutes.');
  studyPhase.textContent = txt;
  studyTask.textContent = '☕ Rest';
  studyCycle.textContent = 'Cycle ' + cycleCount + ' — break';
}

function refreshUI() {
  studyTimer.textContent = formatTime(remaining || 0);
  if (phase === 'idle') {
    studyPhase.textContent = 'Idle';
    studyTask.textContent = '';
    studyCycle.textContent = '';
  }
}

// ── Sidebar ────────────────────────────────────────────────────
function openSidebar() {
  sidebar.classList.remove('hidden');
  sidebarToggle.classList.add('active');
  document.body.classList.add('sidebar-open');
}
function closeSidebar() {
  sidebar.classList.add('hidden');
  sidebarToggle.classList.remove('active');
  document.body.classList.remove('sidebar-open');
}
function toggleSidebar() {
  sidebar.classList.contains('hidden') ? openSidebar() : closeSidebar();
}

sidebarToggle.addEventListener('click', toggleSidebar);

// Close sidebar when clicking the dim overlay on mobile
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('sidebar-open') &&
      !sidebar.contains(e.target) &&
      e.target !== sidebarToggle) {
    closeSidebar();
  }
});

// ── Buttons ────────────────────────────────────────────────────
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
skipBtn.addEventListener('click', skipPhase);
resetBtn.addEventListener('click', resetAll);
exitStudyBtn.addEventListener('click', resetAll);
resetAll();
restoreSettings();

// ── Keyboard shortcuts (disabled when a text input is focused) ─
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    studyView.classList.contains('active') ? pauseBtn.click() : startBtn.click();
  }
  if (e.code === 'KeyS' && e.ctrlKey) skipBtn.click();
});

// ── Task Lists — localStorage ──────────────────────────────────
const STORAGE_KEY = 'pomodoro_lists';
const getLists = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
const saveLists = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

function renderLists() {
  const data = getLists();
  const container = document.getElementById('savedLists');
  container.innerHTML = '';
  const names = Object.keys(data);
  if (!names.length) {
    container.innerHTML = '<div class="empty-msg">No saved lists yet.</div>';
    return;
  }
  for (const name of names) {
    const tasks = data[name];
    const item = document.createElement('div');
    item.className = 'list-item';

    const header = document.createElement('div');
    header.className = 'list-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'list-name';
    nameSpan.textContent = name;

    const countSpan = document.createElement('span');
    countSpan.className = 'list-count';
    countSpan.textContent = tasks.length + ' tasks';

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete list';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete "' + name + '"?')) {
        const d = getLists(); delete d[name]; saveLists(d); renderLists();
      }
    });

    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(delBtn);

    const pane = document.createElement('div');
    pane.className = 'list-tasks';
    tasks.forEach((t) => {
      const lbl = document.createElement('label');
      lbl.className = 'task-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.task = t;
      lbl.appendChild(cb);
      lbl.append(t);
      pane.appendChild(lbl);
    });

    header.addEventListener('click', () => pane.classList.toggle('open'));
    item.appendChild(header);
    item.appendChild(pane);
    container.appendChild(item);
  }
}

document.getElementById('saveListBtn').addEventListener('click', () => {
  const name = document.getElementById('listNameInput').value.trim();
  if (!name) { alert('Enter a list name first.'); return; }
  const tasks = tasksEl.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!tasks.length) { alert('No tasks in the session to save.'); return; }
  const d = getLists();
  if (d[name] && !confirm('"' + name + '" already exists. Overwrite?')) return;
  d[name] = tasks;
  saveLists(d);
  document.getElementById('listNameInput').value = '';
  renderLists();
});

document.getElementById('loadSelectedBtn').addEventListener('click', () => {
  const checked = document.querySelectorAll('#savedLists input[type=checkbox]:checked');
  if (!checked.length) { alert('Check some tasks first.'); return; }
  tasksEl.value = [...checked].map(cb => cb.dataset.task).join('\n');
  closeSidebar();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(getLists(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pomodoro-lists.json';
  a.click();
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      saveLists({ ...getLists(), ...d });
      renderLists();
      alert('Imported ' + Object.keys(d).length + ' list(s).');
    } catch (err) { alert('Invalid JSON file.'); }
  };
  reader.readAsText(f);
  e.target.value = '';
});

renderLists();
