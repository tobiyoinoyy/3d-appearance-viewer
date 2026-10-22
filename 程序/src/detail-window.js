import './detail-window.css';

export const isDetailImage = (file) => /^detal/i.test(file.name || '');

export function createDetailWindow(viewport, dock = null) {
  const panel = document.createElement('section');
  panel.className = 'detail-window';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'SKU 细节图片');
  panel.innerHTML = `
    <header class="detail-header" title="拖动移动窗口">
      <span class="detail-title">细节图片</span>
      <span class="detail-count" aria-live="polite"></span>
      <button type="button" class="detail-toggle" aria-label="收起细节窗口" aria-expanded="true">−</button>
    </header>
    <button type="button" class="detail-image-button" aria-label="查看细节图片">
      <img draggable="false" alt="" />
      <span class="detail-message" hidden>图片加载失败，点击尝试下一张</span>
    </button>
    <button type="button" class="detail-resize" aria-label="调整细节窗口大小" title="拖动缩放，也可使用方向键"></button>`;
  viewport.append(panel);
  const header = panel.querySelector('.detail-header');
  const title = panel.querySelector('.detail-title');
  const count = panel.querySelector('.detail-count');
  const toggle = panel.querySelector('.detail-toggle');
  const imageButton = panel.querySelector('.detail-image-button');
  const img = panel.querySelector('img');
  const message = panel.querySelector('.detail-message');
  const resize = panel.querySelector('.detail-resize');
  let group = null, index = 0, objectUrl = null, collapsed = false;
  let x, y = 72, width = 340, height = 330;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  let imageScale = 1, imageX = 0, imageY = 0;
  let imagePan = null, suppressImageClick = false;
  function endImagePan() {
    const pointerId = imagePan?.id;
    imagePan = null;
    imageButton.classList.remove('is-panning');
    if (pointerId !== undefined && imageButton.hasPointerCapture(pointerId)) {
      imageButton.releasePointerCapture(pointerId);
    }
  }
  function updateImageTransform() {
    imageButton.classList.toggle('is-zoomed', imageScale > 1);
    img.style.transform = `translate(${imageX}px, ${imageY}px) scale(${imageScale})`;
  }
  function resetImageZoom() {
    endImagePan();
    imageScale = 1;
    imageX = imageY = 0;
    updateImageTransform();
  }
  // Keep the image point under the cursor stationary in viewport coordinates.
  imageButton.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!img.complete || !img.naturalWidth || img.hidden) return;
    endImagePan();
    const bounds = imageButton.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    const delta = clamp(event.deltaY * unit, -300, 300);
    const nextScale = clamp(imageScale * Math.exp(-delta * 0.002), 1, 8);
    if (nextScale === imageScale) return;
    const ratio = nextScale / imageScale;
    const anchorX = event.clientX - bounds.left;
    const anchorY = event.clientY - bounds.top;
    imageX = anchorX - (anchorX - imageX) * ratio;
    imageY = anchorY - (anchorY - imageY) * ratio;
    imageScale = nextScale;
    if (imageScale === 1) imageX = imageY = 0;
    updateImageTransform();
  }, { passive: false });
  // A resized image area gets a fresh fit; collapsing preserves the zoom.
  let previousImageWidth = 0, previousImageHeight = 0;
  new ResizeObserver(() => {
    const w = imageButton.clientWidth, h = imageButton.clientHeight;
    if (!w || !h) return;
    if (w !== previousImageWidth || h !== previousImageHeight) resetImageZoom();
    previousImageWidth = w;
    previousImageHeight = h;
  }).observe(imageButton);
  function layout() {
    if (collapsed && dock) {
      Object.assign(panel.style, { left: '', top: '', width: '', height: '' });
      return;
    }
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    width = clamp(width, Math.min(180, w), Math.max(1, w - 16));
    height = clamp(height, Math.min(160, h), Math.max(1, h - 16));
    if (x === undefined) x = w - width - 24;
    x = clamp(x, 0, w - width);
    y = clamp(y, 0, h - (collapsed ? 40 : height));
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${collapsed ? 40 : height}px` });
  }
  function release() {
    img.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function render() {
    resetImageZoom();
    release();
    const files = group?.detailFiles || [];
    panel.hidden = !files.length;
    if (dock) dock.hidden = !collapsed || !files.length;
    if (!files.length) return;
    const file = files[index];
    title.textContent = `${file.label || group.label} · 细节`;
    count.textContent = `${index + 1} / ${files.length}`;
    img.alt = `${group.label} 细节图片 ${index + 1}：${file.name}`;
    message.hidden = true;
    img.hidden = false;
    img.src = file.url || (objectUrl = URL.createObjectURL(file));
    imageButton.setAttribute('aria-label', files.length > 1 ? '点击切换下一张细节图片' : '查看细节图片');
    layout();
  }
  img.addEventListener('error', () => { img.hidden = true; message.hidden = false; });
  imageButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressImageClick = false;
    if (imageScale <= 1 || !img.complete || !img.naturalWidth || img.hidden) return;
    imagePan = { id: event.pointerId, px: event.clientX, py: event.clientY, x: imageX, y: imageY, moved: false };
    imageButton.setPointerCapture(event.pointerId);
  });
  imageButton.addEventListener('pointermove', (event) => {
    if (!imagePan || event.pointerId !== imagePan.id) return;
    const dx = event.clientX - imagePan.px, dy = event.clientY - imagePan.py;
    if (!imagePan.moved && Math.hypot(dx, dy) < 4) return;
    imagePan.moved = true;
    suppressImageClick = true;
    event.preventDefault();
    imageButton.classList.add('is-panning');
    imageX = imagePan.x + dx;
    imageY = imagePan.y + dy;
    updateImageTransform();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    imageButton.addEventListener(type, (event) => {
      if (imagePan?.id === event.pointerId) endImagePan();
    });
  });
  imageButton.addEventListener('click', (event) => {
    if (suppressImageClick && event.detail !== 0) {
      suppressImageClick = false;
      event.preventDefault();
      return;
    }
    suppressImageClick = false;
    if (!group?.detailFiles.length || group.detailFiles.length === 1) return;
    index = (index + 1) % group.detailFiles.length;
    render();
  });
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    toggle.textContent = collapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '展开细节窗口' : '收起细节窗口');
    if (dock) {
      (collapsed ? dock : viewport).append(panel);
      dock.hidden = !collapsed || !group?.detailFiles.length;
    }
    header.title = collapsed && dock ? '点击 + 恢复细节浮窗' : '拖动移动窗口';
    layout();
  });
  function pointerGesture(handle, resizing) {
    let gesture = null;
    handle.addEventListener('pointerdown', (event) => {
      if (collapsed && dock) return;
      if (event.button !== 0 || (!resizing && event.target.closest('button'))) return;
      event.preventDefault();
      gesture = { id: event.pointerId, px: event.clientX, py: event.clientY, x, y, width, height };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.px, dy = event.clientY - gesture.py;
      if (resizing) { width = gesture.width + dx; height = gesture.height + dy; }
      else { x = gesture.x + dx; y = gesture.y + dy; }
      layout();
    });
    const end = () => { gesture = null; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }
  pointerGesture(header, false);
  pointerGesture(resize, true);
  resize.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    width += event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0;
    height += event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0;
    layout();
  });
  new ResizeObserver(layout).observe(viewport);
  return { setGroup(next) { if (next === group) return; group = next; index = 0; render(); } };
}
