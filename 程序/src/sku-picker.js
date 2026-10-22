const HEIGHT_KEY = 'appearance-viewer.sku-picker-height';
const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 360;

export function initSkuPicker(onSelect) {
  const picker = document.querySelector('#sku-picker');
  const list = document.querySelector('#sku-buttons');
  const handle = document.querySelector('#sku-resize-handle');
  let preferredHeight = DEFAULT_HEIGHT;
  let drag = null;
  let busy = false;
  try {
    const stored = Number(localStorage.getItem(HEIGHT_KEY));
    if (Number.isFinite(stored) && stored >= MIN_HEIGHT) preferredHeight = Math.min(MAX_HEIGHT, stored);
  } catch { /* Storage can be unavailable in a private browser session. */ }

  function limits() { return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor(innerHeight * .45))); }
  function setHeight(value, persist = false) {
    const height = Math.round(Math.max(MIN_HEIGHT, Math.min(limits(), value)));
    picker.style.height = `${height}px`;
    handle.setAttribute('aria-valuemin', String(MIN_HEIGHT));
    handle.setAttribute('aria-valuemax', String(limits()));
    handle.setAttribute('aria-valuenow', String(height));
    handle.setAttribute('aria-valuetext', `${height} 像素`);
    if (persist) {
      preferredHeight = height;
      try { localStorage.setItem(HEIGHT_KEY, String(height)); } catch {}
    }
  }
  setHeight(preferredHeight);
  window.addEventListener('resize', () => setHeight(preferredHeight));
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { id: event.pointerId, y: event.clientY, height: picker.getBoundingClientRect().height };
    handle.setPointerCapture(event.pointerId);
    picker.classList.add('is-resizing');
  });
  handle.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) setHeight(drag.height + event.clientY - drag.y);
  });
  function finish(event) {
    if (drag?.id !== event.pointerId) return;
    setHeight(Number.parseFloat(picker.style.height), true);
    drag = null;
    picker.classList.remove('is-resizing');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('dblclick', () => setHeight(DEFAULT_HEIGHT, true));
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(picker.style.height);
    setHeight(event.key === 'Home' ? MIN_HEIGHT : event.key === 'End' ? limits() : current + (event.key === 'ArrowDown' ? 24 : -24), true);
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-sku-id]');
    if (button && !busy) onSelect(button.dataset.skuId);
  });

  return {
    render(groups, selectedId, loading) {
      busy = loading;
      list.setAttribute('aria-busy', String(loading));
      const existing = [...list.children];
      if (existing.length !== groups.length || existing.some((button, index) => button.dataset.skuId !== groups[index].id || button.textContent !== groups[index].label)) {
        list.replaceChildren(...groups.map(group => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'sku-chip';
          button.dataset.skuId = group.id;
          button.textContent = group.label;
          return button;
        }));
        list.scrollTop = 0;
      }
      for (const button of list.children) {
        button.setAttribute('aria-pressed', String(button.dataset.skuId === selectedId));
        button.setAttribute('aria-disabled', String(loading));
      }
    },
  };
}
