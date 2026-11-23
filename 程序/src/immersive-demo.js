import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DemoGesture } from './immersive-gestures.js';
import { demoScreens } from './immersive-screens.js';
import './immersive-demo.css';

// Imported models may face opposite directions. Read the actual back material
// triangles instead of assuming +Z/-Z means the back for every GLB.
function backDirection(root, side = -.38) {
  const normal = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    if (!position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) ? geometry.groups :
      [{ start: 0, count: geometry.index?.count || position.count, materialIndex: 0 }];
    for (const group of groups) {
      if (!/^back(?:\.\d+)?$/i.test(materials[group.materialIndex]?.name || '')) continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const index = j => geometry.index ? geometry.index.getX(j) : j;
        a.fromBufferAttribute(position, index(i)).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, index(i + 1)).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, index(i + 2)).applyMatrix4(mesh.matrixWorld);
        normal.add(b.sub(a).cross(c.sub(a)));
      }
    }
  });
  normal.y = 0;
  if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
  normal.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
  return normal.addScaledVector(right, side).add(new THREE.Vector3(0, .12, 0));
}

export function createImmersiveDemo({ state, viewport, skuSelect, onSkuChange }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'immersive-demo';
  dialog.setAttribute('aria-label', '沉浸式演示');
  dialog.innerHTML = `
    <div class="demo-tools">
      <span>沉浸式演示</span>
      <select aria-label="演示 SKU"></select>
      <button type="button" class="demo-exit">返回工作台</button>
    </div>
    <div class="demo-phone" data-screen="list" data-tab="model">${demoScreens}</div>`;
  document.body.append(dialog);
  const app = document.querySelector('#app');
  const phone = dialog.querySelector('.demo-phone');
  const host = dialog.querySelector('.demo-model');
  const renderLayer = dialog.querySelector('.demo-renderer');
  const select = dialog.querySelector('select');
  const find = selector => phone.querySelector(selector);
  const list = find('.demo-list');
  const detail = find('.demo-detail');
  const close = find('.demo-collapse');
  const controlsBar = find('.demo-controls');
  const hint = find('.demo-disclaimer');
  const about = find('.demo-about');
  const aboutClose = find('.demo-about-close');
  const photoPanel = find('.demo-photos');
  const xrayPanel = find('.demo-xray');
  const tools = dialog.querySelector('.demo-tools');
  const tabs = [...phone.querySelectorAll('.demo-tabs button')];
  const canvas = state.renderer.domElement;
  const gestures = new DemoGesture();
  const camera = new THREE.PerspectiveCamera(32, 1, .01, 1000);
  let active = false, expanded = false, controls, model, savedFocus;
  let savedControlsEnabled = true, previousSize = new THREE.Vector2();
  let previousAlpha = 1, previousInert = false, fitDistance = 1;
  let transition = null;
  const inlineOffset = .235;
  let frameOffset = inlineOffset;
  let tab = 'model', aboutOpen = false, lastProduct;
  let sampleMaterials, sampleLoading = false;

  function syncView() {
    const onList = phone.dataset.screen === 'list';
    const onModel = tab === 'model';
    list.hidden = !onList;
    detail.inert = onList || expanded;
    host.inert = onList || (expanded && !onModel) || aboutOpen;
    controlsBar.inert = !expanded || aboutOpen;
    hint.inert = !expanded || !onModel || aboutOpen;
    about.inert = !aboutOpen;
    tools.inert = aboutOpen;
    photoPanel.inert = !expanded || tab !== 'photo';
    xrayPanel.inert = !expanded || tab !== 'xray';
    phone.dataset.tab = tab;
    phone.classList.toggle('is-about-open', aboutOpen);
    hint.setAttribute('aria-expanded', String(aboutOpen));
    tabs.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
  }

  function setAbout(value) {
    aboutOpen = value;
    gestures.reset();
    syncView();
    (value ? aboutClose : hint).focus({ preventScroll: true });
  }

  function selectTab(value, focus = false) {
    const fromAbout = aboutOpen;
    aboutOpen = false;
    tab = value;
    gestures.reset();
    syncView();
    if (focus || fromAbout) tabs.find(button => button.dataset.tab === value).focus({ preventScroll: true });
  }

  function showList() {
    phone.dataset.screen = 'list';
    syncView();
    (lastProduct || find('[data-product]')).focus({ preventScroll: true });
  }

  function showDetail(event) {
    lastProduct = event.currentTarget;
    phone.dataset.screen = 'detail';
    syncView();
    host.focus({ preventScroll: true });
  }

  function loadSampleTextures() {
    if (sampleLoading || !usesDemoSample()) return;
    sampleLoading = true;
    const loader = new THREE.TextureLoader();
    const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    void Promise.all(faces.map(async face => {
      const map = await loader.loadAsync(`/immersive/flow/texture/${face}.png`);
      map.flipY = false;
      map.colorSpace = THREE.SRGBColorSpace;
      return [face, new THREE.MeshBasicMaterial({ map, toneMapped: false })];
    })).then(materials => { sampleMaterials = new Map(materials); }).catch(error => {
      sampleLoading = false;
      console.warn('沉浸演示示例贴图加载失败', error);
    });
  }

  function usesDemoSample() {
    return state.modelUrl?.split('?')[0] === '/models/SPU-iPhone17ProMax--1d6c00029252.glb';
  }

  function applySampleTextures() {
    // Only the matching untextured demonstration model uses the bundled sample.
    if (!sampleMaterials || !usesDemoSample() || [...state.materialRecords.values()].some(record => record.material.map)) return [];
    const swaps = [];
    const matchFace = material => {
      const name = material.name.toLowerCase().replace(/\.\d+$/, '');
      return sampleMaterials.get(/^back(?:-camera|detal)$/.test(name) ? 'back' : name) || material;
    };
    state.modelRoot.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      swaps.push([mesh, original]);
      mesh.material = Array.isArray(original) ? original.map(matchFace) : matchFace(original);
    });
    return swaps;
  }

  function syncSku() {
    if (select.innerHTML !== skuSelect.innerHTML) select.innerHTML = skuSelect.innerHTML;
    select.value = skuSelect.value;
    select.disabled = skuSelect.disabled;
  }
  new MutationObserver(syncSku).observe(skuSelect, { subtree: true, childList: true, attributes: true });
  select.addEventListener('change', () => onSkuChange(select.value));

  function fit(apply = true) {
    if (!state.modelRoot) return;
    const box = new THREE.Box3().setFromObject(state.modelRoot);
    if (box.isEmpty()) return;
    const center = apply ? box.getCenter(new THREE.Vector3()) : controls.target.clone();
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, .001);
    const direction = camera.position.clone().sub(controls.target).normalize();
    // Measure against a copy: even preparing an animation must not change the
    // live camera orientation or run OrbitControls with pending gesture state.
    const probe = camera.clone();
    probe.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).sub(center);
        const depth = p.dot(direction);
        distance = Math.max(distance, Math.abs(p.dot(up)) / (tangent * (expanded ? .70 : .334)) + depth,
          Math.abs(p.dot(right)) / (tangent * camera.aspect * .90) + depth);
      }
    }
    if (!apply) return { distance, radius };
    fitDistance = distance;
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = radius / 100;
    camera.far = radius * 100;
    controls.target.copy(center);
    controls.minDistance = radius * .25;
    controls.maxDistance = distance * 3;
    camera.updateProjectionMatrix();
    controls.update();
  }
  function rebuildControls() {
    const target = controls.target.clone();
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const { minDistance, maxDistance } = controls;
    controls.dispose();
    controls = new OrbitControls(camera, host);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = expanded;
    controls.rotateSpeed = .65;
    controls.zoomSpeed = .8;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.target.copy(target);
    camera.position.copy(position);
    controls.update();
    camera.quaternion.copy(quaternion);
  }
  function resize(refit = true) {
    if (!active) return;
    const { width, height } = renderLayer.getBoundingClientRect();
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    // Render across the whole screen in full view. Shift only the projection,
    // so zoomed geometry is not cut off by an invisible inner canvas edge.
    camera.setViewOffset(Math.max(1, width), Math.max(1, height), 0,
      height * frameOffset, Math.max(1, width), Math.max(1, height));
    state.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    if (refit) {
      const zoom = expanded ? camera.position.distanceTo(controls.target) / fitDistance : 1;
      fit();
      if (expanded) camera.position.sub(controls.target).multiplyScalar(zoom).add(controls.target);
    }
  }
  // ResizeObserver fires after the small/full layout change. Explicit mode
  // changes already frame the camera; do not overwrite a restored view then.
  let lastWidth = 0, lastHeight = 0;
  function rememberSize() {
    const r = renderLayer.getBoundingClientRect(); lastWidth = r.width; lastHeight = r.height;
  }
  new ResizeObserver(() => {
    const r = renderLayer.getBoundingClientRect();
    if (active && !transition && (r.width !== lastWidth || r.height !== lastHeight)) { resize(); rememberSize(); }
  }).observe(renderLayer);

  function setExpanded(value) {
    if (!active || value === expanded) return;
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const quaternion = camera.quaternion.clone();
    const direction = fromPosition.clone().sub(fromTarget).normalize();
    const fromDistance = fromPosition.distanceTo(fromTarget);
    const fromOffset = frameOffset;
    controls.enabled = false;
    controls.dispose();
    host.style.touchAction = 'none';
    gestures.reset();
    transition = null;
    expanded = value;
    phone.classList.toggle('is-expanded', value);
    host.setAttribute('aria-expanded', String(value));
    host.setAttribute('aria-label', value ? '全屏手机，拖动旋转，双指或滚轮缩放' : '旋转手机，点击或双指放大进入全屏');
    close.hidden = !value;
    syncView();
    controls.enableZoom = value;
    frameOffset = value ? .032 : inlineOffset;
    resize(false);
    // Keep the current orbit direction when closing. Returning to the saved
    // opposite view along a straight line can drive the camera through the mesh.
    const framing = fit(false);
    fitDistance = framing.distance;
    controls.minDistance = framing.radius * .25;
    controls.maxDistance = Math.max(framing.distance, fromDistance) * 3;
    if (!value) host.focus({ preventScroll: true });
    transition = {
      started: performance.now(), duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 460,
      target: fromTarget, direction, quaternion, fromDistance, toDistance: framing.distance,
      fromOffset, toOffset: frameOffset,
    };
    controls.enabled = false;
    // The render layer stays full-screen throughout. Only camera distance and
    // projection center animate; a shrinking canvas must never crop the mesh.
    animateTransition();
    rememberSize();
  }
  function animateTransition() {
    if (!transition) return;
    const t = transition;
    const progress = t.duration ? Math.min(1, (performance.now() - t.started) / t.duration) : 1;
    const eased = 1 - (1 - progress) ** 3;
    controls.target.copy(t.target);
    camera.position.copy(t.target).addScaledVector(t.direction,
      THREE.MathUtils.lerp(t.fromDistance, t.toDistance, eased));
    camera.quaternion.copy(t.quaternion);
    frameOffset = THREE.MathUtils.lerp(t.fromOffset, t.toOffset, eased);
    resize(false);
    if (progress === 1) {
      transition = null;
      rebuildControls();
    }
    rememberSize();
  }
  // Capture lets expansion happen before OrbitControls handles pinch movement.
  host.addEventListener('pointerdown', e => { if (!transition && e.button === 0) gestures.down(e); }, true);
  host.addEventListener('pointermove', e => { if (!transition && gestures.move(e) && !expanded) setExpanded(true); }, true);
  host.addEventListener('pointerup', e => { if (!transition && gestures.up(e) && !expanded) setExpanded(true); }, true);
  host.addEventListener('pointercancel', e => gestures.up(e, true), true);
  host.addEventListener('lostpointercapture', e => gestures.up(e, true), true);
  host.addEventListener('wheel', e => {
    e.preventDefault();
    if (!transition && !expanded) setExpanded(true);
  }, { passive: false, capture: true });
  host.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); }
  });
  phone.querySelectorAll('[data-product]').forEach(button => button.addEventListener('click', showDetail));
  phone.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => {
    selectTab(button.dataset.openTab);
    setExpanded(true);
    (tab === 'model' ? host : tabs.find(item => item.dataset.tab === tab)).focus({ preventScroll: true });
  }));
  tabs.forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  close.addEventListener('click', collapse);
  hint.addEventListener('click', () => setAbout(true));
  aboutClose.addEventListener('click', () => setAbout(false));
  find('.demo-info-scrim').addEventListener('click', () => setAbout(false));
  find('.demo-about-photo').addEventListener('click', () => selectTab('photo'));
  find('.demo-xray-link').addEventListener('click', () => selectTab('photo', true));
  find('.demo-list-back').addEventListener('click', exit);
  find('.demo-detail-back').addEventListener('click', showList);
  dialog.querySelector('.demo-exit').addEventListener('click', exit);
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    if (aboutOpen) setAbout(false);
    else if (expanded) collapse();
    else if (phone.dataset.screen === 'detail') showList();
    else exit();
  });

  function collapse() {
    setExpanded(false);
    selectTab('model');
    host.focus({ preventScroll: true });
  }

  function open() {
    if (active || !state.modelRoot) return;
    savedFocus = document.activeElement;
    previousSize = state.renderer.getSize(new THREE.Vector2());
    previousAlpha = state.renderer.getClearAlpha();
    savedControlsEnabled = state.controls.enabled;
    previousInert = app.inert;
    app.inert = true;
    state.controls.enabled = false;
    active = true; expanded = false;
    tab = 'model'; aboutOpen = false; lastProduct = null;
    frameOffset = inlineOffset;
    transition = null;
    phone.classList.remove('is-expanded'); close.hidden = true;
    host.setAttribute('aria-expanded', 'false');
    host.setAttribute('aria-label', '旋转手机，点击或双指放大进入全屏');
    gestures.reset(); syncSku();
    phone.dataset.screen = 'list';
    syncView();
    dialog.showModal();
    loadSampleTextures();
    renderLayer.append(canvas);
    controls = new OrbitControls(camera, host);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = .65;
    controls.zoomSpeed = .8;
    controls.target.set(0, 0, 0);
    camera.position.copy(backDirection(state.modelRoot, usesDemoSample() ? .44 : undefined));
    camera.lookAt(controls.target);
    model = state.modelRoot;
    resize(false); fit(); rememberSize();
    showList();
  }
  function exit() {
    if (!active) return;
    transition = null;
    controls.dispose(); gestures.reset();
    canvas.style.touchAction = 'none';
    viewport.append(canvas);
    state.renderer.setSize(Math.max(1, viewport.clientWidth || previousSize.x),
      Math.max(1, viewport.clientHeight || previousSize.y), false);
    state.camera.aspect = Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight);
    state.camera.updateProjectionMatrix();
    state.renderer.setClearAlpha(previousAlpha);
    state.controls.enabled = savedControlsEnabled;
    app.inert = previousInert;
    active = false; expanded = false;
    dialog.close(); savedFocus?.focus({ preventScroll: true });
  }
  function render() {
    if (!active) return;
    animateTransition();
    if (model !== state.modelRoot) { model = state.modelRoot; fit(); }
    if (select.value !== skuSelect.value || select.disabled !== skuSelect.disabled) syncSku();
    if (phone.dataset.screen === 'list') return;
    const swaps = applySampleTextures();
    const background = state.scene.background;
    const helpers = [state.grid, state.axes].filter(Boolean).map(object => [object, object.visible]);
    try {
      state.scene.background = null;
      helpers.forEach(([object]) => { object.visible = false; });
      state.renderer.setClearAlpha(0);
      // enabled=false does not stop OrbitControls.update() from moving a
      // camera. The animation owns the camera exclusively until it finishes.
      if (!transition) controls.update();
      state.renderer.render(state.scene, camera);
    } finally {
      swaps.forEach(([mesh, material]) => { mesh.material = material; });
      state.scene.background = background;
      helpers.forEach(([object, visible]) => { object.visible = visible; });
      state.renderer.setClearAlpha(previousAlpha);
    }
  }
  return { open, render, get active() { return active; } };
}
