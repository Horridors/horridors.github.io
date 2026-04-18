// Shared per-level checklist panel.
// Each level registers a list of tasks (id + label) and a "check" function that
// returns which ids are currently done. The panel re-renders on refreshChecklist().
(function () {
  const state = {
    level: null,                // 'l1' | 'l2' | 'l3' | 'l4'
    tasks: [],                  // [{id, label}]
    check: () => new Set(),     // returns Set<string> of done ids
    prevScene: null,
  };

  const overlay = () => document.getElementById('overlay-tasks');
  const listEl  = () => document.getElementById('tasks-list');
  const titleEl = () => document.getElementById('tasks-title');
  const btn     = () => document.getElementById('btn-tasks');

  function setLevel(level, title, tasks, checkFn) {
    state.level = level;
    state.tasks = tasks || [];
    state.check = typeof checkFn === 'function' ? checkFn : () => new Set();
    const t = titleEl(); if (t) t.textContent = title || 'Tasks';
    render();
  }

  function render() {
    const ul = listEl(); if (!ul) return;
    const doneIds = state.check() || new Set();
    const rows = state.tasks.map(task => {
      const done = doneIds.has(task.id);
      const check = done ? '✓' : '';
      return `<li class="${done ? 'done' : ''}"><span class="task-box">${check}</span><span>${escapeHtml(task.label)}</span></li>`;
    }).join('');
    ul.innerHTML = rows || '<li><span class="task-box"></span><span>No tasks yet.</span></li>';
    // Update button badge: "Tasks (T) 2/5"
    const b = btn();
    if (b && state.tasks.length) {
      const done = Array.from(doneIds).filter(id => state.tasks.some(t => t.id === id)).length;
      b.textContent = `✅ Tasks (T) ${done}/${state.tasks.length}`;
    }
  }

  function open() {
    const o = overlay(); if (!o) return;
    o.classList.remove('hidden');
  }
  function close() {
    const o = overlay(); if (!o) return;
    o.classList.add('hidden');
  }
  function toggle() {
    const o = overlay(); if (!o) return;
    if (o.classList.contains('hidden')) { render(); open(); }
    else close();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  // Global T key + button + Esc close. Only one listener, shared across levels.
  function onKey(e) {
    const k = (e.key || '').toLowerCase();
    const o = overlay(); if (!o) return;
    const isOpen = !o.classList.contains('hidden');
    // Don't hijack T when typing into inputs
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (k === 't') {
      // Don't open the tasks panel during cutscenes / title / etc. — only when
      // a level has registered tasks. Always allow closing it.
      if (!state.level && !isOpen) return;
      toggle();
      e.preventDefault();
      return;
    }
    if (isOpen && (k === 'escape' || k === 'e' || k === ' ' || k === 'enter')) {
      close();
      e.preventDefault();
    }
  }

  function wire() {
    const b = btn();
    if (b) b.addEventListener('click', toggle);
    const c = document.getElementById('btn-tasks-close');
    if (c) c.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.HorridorsTasks = {
    setLevel,
    refresh: render,
    open, close, toggle,
  };
  // Convenience: global refreshChecklist() callable from any level
  window.refreshChecklist = render;
})();
