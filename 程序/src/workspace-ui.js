export function initWorkspaceUI() {
  const app = document.querySelector('#app');
  const focus = document.querySelector('#focus-button');
  const backdrop = document.querySelector('#drawer-backdrop');
  const libraryButton = document.querySelector('#toggle-library');
  const settingsButton = document.querySelector('#toggle-settings');
  const stage = document.querySelector('.viewport-panel');
  let drawer = null, returnFocus = null;
  function closeDrawer(restore = true) {
    app.removeAttribute('data-drawer'); drawer = null; backdrop.hidden = true; stage.inert = false;
    libraryButton.setAttribute('aria-expanded', 'false'); settingsButton.setAttribute('aria-expanded', 'false');
    if (restore && returnFocus?.isConnected) returnFocus.focus();
  }
  function openDrawer(name, trigger) {
    if (drawer === name) { closeDrawer(); return; }
    drawer = name; returnFocus = trigger; app.dataset.drawer = name; backdrop.hidden = false; stage.inert = true;
    libraryButton.setAttribute('aria-expanded', String(name === 'library'));
    settingsButton.setAttribute('aria-expanded', String(name === 'settings'));
    document.querySelector(`#${name === 'library' ? 'library-panel' : 'settings-panel'} .drawer-close`).focus();
  }
  libraryButton.addEventListener('click', () => openDrawer('library', libraryButton));
  settingsButton.addEventListener('click', () => openDrawer('settings', settingsButton));
  backdrop.addEventListener('click', () => closeDrawer());
  document.querySelectorAll('[data-close-drawer]').forEach(button => button.addEventListener('click', () => closeDrawer()));
  function setFocus(value) {
    closeDrawer(false); app.classList.toggle('is-focused', value);
    focus.setAttribute('aria-pressed', String(value));
    const label = value ? '退出专注' : '专注查看'; focus.querySelector('span').textContent = label;
    focus.setAttribute('aria-label', label); focus.title = `${label}（F）`;
  }
  focus.addEventListener('click', () => setFocus(!app.classList.contains('is-focused')));
  document.querySelector('#manage-library').addEventListener('click', event => {
    const panel = document.querySelector('#library-panel');
    const managing = panel.classList.toggle('is-managing');
    event.currentTarget.setAttribute('aria-pressed', String(managing));
    event.currentTarget.textContent = managing ? '完成' : '管理';
  });
  function settingsTab(id, moveFocus = false) {
    for (const button of document.querySelectorAll('.settings-tab')) {
      const selected = button.id === id;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
      if (selected && moveFocus) button.focus();
    }
  }
  document.querySelector('.settings-tabs').addEventListener('click', event => {
    const button = event.target.closest('.settings-tab'); if (button) settingsTab(button.id);
  });
  document.querySelector('.settings-tabs').addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const id = event.key === 'Home' ? 'tab-textures' : event.key === 'End' ? 'tab-lighting' :
      document.querySelector('#tab-textures').getAttribute('aria-selected') === 'true' ? 'tab-lighting' : 'tab-textures';
    settingsTab(id, true);
  });
  document.querySelector('#spu-options').addEventListener('click', event => {
    if (event.target.closest('.spu-option') && drawer === 'library') queueMicrotask(() => closeDrawer());
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('#library-dialog').open || app.inert) return;
    if (event.key === 'Escape') {
      if (drawer) { event.preventDefault(); closeDrawer(); }
      else if (app.classList.contains('is-focused')) { event.preventDefault(); setFocus(false); focus.focus(); }
      return;
    }
    if (drawer && event.key === 'Tab') {
      const panel = document.getElementById(drawer === 'library' ? 'library-panel' : 'settings-panel');
      const items = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); setFocus(!app.classList.contains('is-focused')); }
    if (event.key.toLowerCase() === 'r' && !drawer) { event.preventDefault(); document.querySelector('#reset-view-button').click(); }
  });
  window.addEventListener('resize', () => {
    if ((drawer === 'library' && innerWidth > 760) || (drawer === 'settings' && innerWidth > 1120)) closeDrawer(false);
  });
  return { closeDrawer };
}
