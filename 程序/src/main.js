import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import './styles.css';
import { initWorkspaceUI } from './workspace-ui.js';
import { createImmersiveDemo } from './immersive-demo.js';
import { createDetailWindow, isDetailImage } from './detail-window.js';
import { createLaptopLidController } from './laptop-lid.js';
import { createModelLibrary } from './model-library.js';
let spus = [];
let library;
const detailWindow = createDetailWindow(document.querySelector('.viewport-panel'), document.querySelector('#detail-dock'));
let immersiveDemo;

const DEFAULT_MODEL_URL = null;
const MATERIAL_FACE_ORDER = ['front', 'back', 'left', 'right', 'top', 'bottom', 'tex01', 'tex02', 'tex03', 'tex04', 'tex05', 'tex06', 'tex07', 'tex08'];
const FACE_ALIASES = {
  front: ['front', '正面', '前面'],
  back: ['back', '背面', '后面', '反面'],
  left: ['left', '左面', '左侧'],
  right: ['right', '右面', '右侧'],
  top: ['top', '顶部', '顶面', '上面'],
  bottom: ['bottom', '底部', '底面', '下面'],
};
const SINGLE_CHAR_FACE_ALIASES = { front: '前', back: '后', left: '左', right: '右', top: '上', bottom: '下' };
const SLOT_ALIASES = {
  map: ['basecolor', 'base', 'albedo', 'diffuse', 'color', '颜色', '底色'],
  normalMap: ['normalmap', 'normal', '法线'],
  roughnessMap: ['roughnessmap', 'roughness', 'rough', '粗糙度', '粗糙'],
  metalnessMap: ['metalnessmap', 'metalness', 'metallic', 'metal', '金属度', '金属'],
  aoMap: ['ambientocclusion', 'occlusion', 'aomap', 'ao', '环境光遮蔽', '遮蔽'],
  emissiveMap: ['emissivemap', 'emissive', 'emission', 'glow', '自发光', '发光'],
};
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
const BATCH_DEFAULT_HINT = '可选择单组或含多个 SKU 子目录的贴图文件夹；按面向名自动匹配';
const BATCH_FALLBACK_HINT = '当前浏览器不支持文件夹选择，可改为多选贴图文件';
// A folder import can contain many SKU folders.  Keep the source File
// objects around (they are cheap references to the user's files), but only
// decode textures for the selected SKU.  Loaded textures are kept in a small
// LRU cache and disposed when an inactive entry exceeds either limit.  This
// prevents a large product library from allocating all image/GPU memory at
// once while still making the last few SKU switches instant.
const SKU_CACHE_MAX_ENTRIES = 3;
const SKU_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const SKU_DEFAULT_GROUP = 'sku-1';
const HELPER_LIGHT_DEFAULTS = Object.freeze({
  brightness: 1,
  azimuth: 0,
  environmentIntensity: 1.35,
  hemisphereIntensity: 1.8,
  keyIntensity: 2.4,
  fillIntensity: 0.9,
});
const HELPER_KEY_POSITION = new THREE.Vector3(4, 7, 5);
const HELPER_FILL_POSITION = new THREE.Vector3(-5, 2, -4);
const HELPER_Y_AXIS = new THREE.Vector3(0, 1, 0);
const TEXTURE_SLOTS = [
  { key: 'map', label: 'Base Color', short: 'BASE' },
  { key: 'normalMap', label: 'Normal', short: 'NORM' },
  { key: 'roughnessMap', label: 'Roughness', short: 'ROUGH' },
  { key: 'metalnessMap', label: 'Metalness', short: 'METAL' },
  { key: 'aoMap', label: 'Ambient Occlusion', short: 'AO' },
  { key: 'emissiveMap', label: 'Emissive', short: 'EMISS' },
];
const TEXTURE_SLOT_LABELS = Object.fromEntries(TEXTURE_SLOTS.map(({ key, label }) => [key, label]));
const SLOT_LABELS = Object.fromEntries(TEXTURE_SLOTS.map(({ key, label }) => [key, label]));

const dom = {
  categoryTabs: document.querySelector('#category-tabs'),
  spuOptions: document.querySelector('#spu-options'),
  viewport: document.querySelector('#viewport'),
  fileInput: document.querySelector('#file-input'),
  openFileButton: document.querySelector('#open-file-button'),
  dropZone: document.querySelector('#drop-zone'),
  reloadButton: document.querySelector('#reload-button'),
  sourceName: document.querySelector('#source-name'),
  sourceType: document.querySelector('#source-type'),
  modelBadge: document.querySelector('#model-badge'),
  loadState: document.querySelector('#load-state'),
  loadStateText: document.querySelector('#load-state-text'),
  sceneLabel: document.querySelector('#scene-label'),
  sceneTree: document.querySelector('#scene-tree'),
  expandTreeButton: document.querySelector('#expand-tree-button'),
  materialCountLabel: document.querySelector('#material-count-label'),
  resetMaterialsButton: document.querySelector('#reset-materials-button'),
  batchFolderButton: document.querySelector('#batch-folder-button'),
  batchFolderInput: document.querySelector('#batch-folder-input'),
  batchHint: document.querySelector('#batch-hint'),
  batchSummary: document.querySelector('#batch-summary'),
  batchSummaryTitle: document.querySelector('#batch-summary-title'),
  batchSummaryCounts: document.querySelector('#batch-summary-counts'),
  batchProgress: document.querySelector('#batch-progress'),
  batchProgressBar: document.querySelector('#batch-progress span'),
  batchResults: document.querySelector('#batch-results'),
  skuPanel: document.querySelector('#sku-panel'),
  skuSelect: document.querySelector('#sku-select'),
  skuPanelTitle: document.querySelector('#sku-panel-title'),
  skuCacheLabel: document.querySelector('#sku-cache-label'),
  skuList: document.querySelector('#sku-list'),
  skuHint: document.querySelector('#sku-hint'),
  resetViewButton: document.querySelector('#reset-view-button'),
  frameViewButton: document.querySelector('#frame-view-button'),
  gridButton: document.querySelector('#grid-button'),
  axesButton: document.querySelector('#axes-button'),
  lightsButton: document.querySelector('#lights-button'),
  environmentButton: document.querySelector('#environment-button'),
  recordButton: document.querySelector('#record-button'),
  lidButton: document.querySelector('#lid-toggle-button'),
  lightingSection: document.querySelector('#lighting-section'),
  environmentBrightnessInput: document.querySelector('#environment-brightness-input'),
  environmentBrightnessValue: document.querySelector('#environment-brightness-value'),
  environmentAngleInput: document.querySelector('#environment-angle-input'),
  environmentAngleValue: document.querySelector('#environment-angle-value'),
  resetLightingButton: document.querySelector('#reset-lighting-button'),
  renderMode: document.querySelector('#render-mode'),
  errorBanner: document.querySelector('#error-banner'),
  errorMessage: document.querySelector('#error-message'),
  dismissError: document.querySelector('#dismiss-error'),
  footerStatus: document.querySelector('#footer-status'),
  footerFps: document.querySelector('#footer-fps'),
  footerSize: document.querySelector('#footer-size'),
  statNodes: document.querySelector('#stat-nodes'),
  statMeshes: document.querySelector('#stat-meshes'),
  statTriangles: document.querySelector('#stat-triangles'),
  statMaterials: document.querySelector('#stat-materials'),
  statTextures: document.querySelector('#stat-textures'),
  statLights: document.querySelector('#stat-lights'),
  metaScene: document.querySelector('#meta-scene'),
  metaCameras: document.querySelector('#meta-cameras'),
  metaPunctual: document.querySelector('#meta-punctual'),
  metaEnvironment: document.querySelector('#meta-environment'),
};

const state = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  modelRoot: null,
  modelAsset: null,
  laptopLid: null,
  modelDetailGroup: null,
  modelLoadToken: 0,
  modelUrl: DEFAULT_MODEL_URL,
  modelObjectUrl: null,
  sourceLabel: 'SPU-iPhone17Pro.glb',
  sourceSize: 4.3 * 1024 * 1024,
  sceneLights: [],
  helperLights: [],
  helperLightRig: { hemisphere: null, key: null, fill: null },
  pmremGenerator: null,
  viewerEnvironment: null,
  grid: null,
  axes: null,
  materials: [],
  materialRecords: new Map(),
  originalTextures: new Map(),
  selectedMaterial: null,
  expandedTree: true,
  environmentEnabled: true,
  environmentBrightness: HELPER_LIGHT_DEFAULTS.brightness,
  environmentAzimuth: HELPER_LIGHT_DEFAULTS.azimuth,
  modelLightsEnabled: true,
  gridEnabled: false,
  axesEnabled: false,
  lastFrameTime: null,
  fpsSampleStart: null,
  fpsFrameCount: 0,
  batchToken: 0,
  batchBusy: false,
  batchResults: [],
  skuSets: [],
  skuSetById: new Map(),
  activeSkuId: null,
  skuCache: new Map(),
  skuCacheClock: 0,
  skuCacheBytes: 0,
  // SKU image decodes are serialized. Browsers do not provide a reliable
  // abort for TextureLoader once an image decode has started, so a queue is
  // the safest way to prevent rapid SKU clicks from decoding many large
  // images in parallel.
  textureDecodeTail: Promise.resolve(),
  fitBox: new THREE.Box3(),
  fitSphere: new THREE.Sphere(),
  initialCamera: {
    position: new THREE.Vector3(5, 3.4, 6.5),
    target: new THREE.Vector3(0, 0, 0),
  },
  recorder: null,
  recordChunks: [],
  recordStream: null,
};

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const dracoLoader = new DRACOLoader();
// Keep the decoder local so compressed GLBs also work on an offline workstation.
// It is fetched lazily only when a Draco-compressed primitive is encountered.
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

function setLoadState(text, type = 'idle') {
  dom.loadState.dataset.state = type;
  dom.loadStateText.textContent = text;
}

function setFooterStatus(text, type = 'ready') {
  dom.footerStatus.textContent = text;
  dom.sourceType.classList.remove('is-ready', 'is-busy', 'is-error');
  dom.sourceType.classList.add(type === 'error' ? 'is-error' : type === 'busy' ? 'is-busy' : 'is-ready');
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  dom.errorMessage.textContent = message;
  dom.errorBanner.hidden = false;
  setLoadState('加载失败', 'error');
  setFooterStatus('加载失败', 'error');
}

function hideError() {
  dom.errorBanner.hidden = true;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function basename(path) {
  return String(path || '').split(/[\\/]/).pop() || path;
}

function batchFilePath(file) {
  return String(file?.webkitRelativePath || file?.name || '未命名图片');
}

function batchFolderName(files) {
  const roots = new Set();
  files.forEach((file) => {
    const path = batchFilePath(file);
    const segments = path.split(/[\\/]/).filter(Boolean);
    if (segments.length > 1) roots.add(segments[0]);
  });
  return roots.size === 1 ? [...roots][0] : '';
}

function batchPathSegments(file) {
  return batchFilePath(file).split(/[\\/]/).filter(Boolean);
}

function segmentLooksLikeTextureDimension(segment) {
  return findFaceMatches(segment).length > 0 || findSlotMatches(segment).length > 0;
}

/**
 * Return the folder which represents one SKU in a directory selection.
 *
 * Chromium exposes paths such as `12pro/1/front.png` when the user chooses
 * the `12pro` directory, and `1/front.png` when the user chooses one SKU
 * directory directly.  A two-segment path is therefore a file directly in
 * the selected root, not a nested SKU.  For deeper paths the first child is
 * treated as the SKU unless it is clearly a face/slot folder (`front/`,
 * `normal/`, etc.).
 */
function batchGroupInfo(file) {
  const segments = batchPathSegments(file);
  if (segments.length <= 1) {
    return { key: SKU_DEFAULT_GROUP, folder: '', root: '' };
  }
  const root = segments[0];
  if (segments.length <= 2) {
    return { key: root.toLocaleLowerCase(), folder: root, root };
  }
  const child = segments[1];
  if (!child || segmentLooksLikeTextureDimension(child)) {
    return { key: root.toLocaleLowerCase(), folder: root, root };
  }
  return {
    key: `${root}/${child}`.toLocaleLowerCase(),
    folder: child,
    root,
  };
}

function estimateTextureBytes(texture) {
  const image = texture?.image || texture?.source?.data;
  const width = Number(image?.width || image?.videoWidth || 0);
  const height = Number(image?.height || image?.videoHeight || 0);
  // TextureLoader normally retains a decoded RGBA image on the CPU while the
  // renderer also owns an RGBA texture plus mip levels on the GPU. Roughly
  // 10 bytes/pixel is deliberately conservative and keeps the cache budget
  // meaningful on memory-constrained Macs.
  if (!width || !height) return 1;
  return Math.max(1, width * height * 10);
}

function supportsDirectoryPicker() {
  const input = dom.batchFolderInput;
  if (!input) return false;
  // `webkitdirectory` is the de-facto directory picker flag used by
  // Chromium, Safari and current Firefox builds. Keep `directory` as a
  // fallback for older WebKit variants that expose only that property.
  return 'webkitdirectory' in input || 'directory' in input;
}

function setBatchPickerHint(text = null) {
  if (!dom.batchHint) return;
  const directoryPicker = supportsDirectoryPicker();
  dom.batchHint.textContent = text || (directoryPicker ? BATCH_DEFAULT_HINT : BATCH_FALLBACK_HINT);
  if (dom.batchFolderButton) {
    dom.batchFolderButton.title = directoryPicker ? '选择贴图文件夹' : '当前浏览器将打开多选图片';
  }
}

function setBatchBusy(busy) {
  state.batchBusy = Boolean(busy);
  if (!dom.batchFolderButton) return;
  dom.batchFolderButton.disabled = state.batchBusy || state.materialRecords.size === 0;
  dom.batchFolderButton.classList.toggle('is-busy', state.batchBusy);
  dom.batchFolderButton.setAttribute('aria-busy', String(state.batchBusy));
  const label = dom.batchFolderButton.querySelector('.button-label');
  if (label) label.textContent = state.batchBusy ? '正在处理文件夹…' : '导入贴图文件夹';
}

function materialDisplayName(material, index) {
  const raw = String(material?.name || '').trim();
  return raw || `材质槽位 ${index + 1}`;
}

function normalizeFaceText(value) {
  return String(value || '').toLowerCase().replace(/[\s._\-()[\]{}（）【】「」《》]/g, '');
}

function nameTokens(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(Boolean);
}

function aliasMatches(value, alias, tokens = nameTokens(value)) {
  const normalizedAlias = normalizeFaceText(alias);
  if (!normalizedAlias) return false;
  // English aliases are whole filename tokens. This prevents names such as
  // `backdrop.png` or `leftover.png` from being silently assigned to a face.
  if (/^[a-z0-9]+$/i.test(normalizedAlias)) return tokens.includes(normalizedAlias);
  // Chinese names are often written without separators (e.g. `正面法线`).
  return normalizeFaceText(value).includes(normalizedAlias);
}

function findFaceMatches(value) {
  const normalized = normalizeFaceText(value);
  if (!normalized) return [];
  const laptopSlot = String(value).match(/^(?:image[ _-]*|tex)0?([1-8])(?:$|[ _.-])/i);
  if (laptopSlot) return [`tex0${laptopSlot[1]}`];
  const tokens = nameTokens(value);
  const matches = [];
  MATERIAL_FACE_ORDER.forEach((face) => {
    const aliases = FACE_ALIASES[face] || [face];
    if (aliases.some((alias) => aliasMatches(value, alias, tokens))) matches.push(face);
  });
  // Single-character Chinese names are useful for files such as `前.png`,
  // but are intentionally checked only as a fallback so ordinary words do
  // not accidentally match a face.
  if (!matches.length) {
    const raw = String(value || '').toLowerCase();
    Object.entries(SINGLE_CHAR_FACE_ALIASES).forEach(([face, alias]) => {
      if (tokens.includes(alias) || raw.trim() === alias) matches.push(face);
    });
  }
  return matches;
}

function normalizeFaceName(name) {
  const matches = findFaceMatches(name);
  // These lens-side materials use the same back.png as the back plate.
  // Match complete material tokens (including Blender's .001 duplicates),
  // without broadening texture filename matching to words like `backdrop`.
  const tokens = nameTokens(name);
  if (tokens.some((token) => token === 'backdetal' || token === 'backdetail')) {
    if (!matches.includes('back')) matches.push('back');
  }
  return matches.length === 1 ? matches[0] : 'other';
}

function faceFromFileName(fileName) {
  const stem = basename(fileName).replace(/\.[^.]+$/, '');
  const matches = findFaceMatches(stem);
  return matches.length === 1 ? matches[0] : matches.length > 1 ? 'ambiguous' : 'other';
}

function findSlotMatches(value) {
  const normalized = normalizeFaceText(value);
  if (!normalized) return [];
  const tokens = nameTokens(value);
  const matches = new Set();
  Object.entries(SLOT_ALIASES).forEach(([slot, aliases]) => {
    if (aliases.some((alias) => aliasMatches(value, alias, tokens))) matches.add(slot);
  });
  return [...matches];
}

function parseTextureFile(file) {
  const stem = basename(file?.name || '').replace(/\.[^.]+$/, '');
  let faceMatches = findFaceMatches(stem);
  const parentSegments = file?.webkitRelativePath
    ? String(file.webkitRelativePath).split(/[\\/]/).slice(0, -1)
    : [];
  // If the file name itself has no face token, allow an exact-ish parent
  // folder name (for example `front/texture.png`) as a convenience.
  if (!faceMatches.length && parentSegments.length) {
    const parentMatches = new Set();
    parentSegments.forEach((segment) => findFaceMatches(segment).forEach((face) => parentMatches.add(face)));
    faceMatches = [...parentMatches];
  }
  let slotMatches = findSlotMatches(stem);
  // Folder layouts such as `front/normal/texture.png` are common in design
  // hand-offs. If the filename has no explicit slot suffix, inspect its
  // parent folders as a fallback while preserving filename precedence.
  if (!slotMatches.length && parentSegments.length) {
    const parentSlotMatches = new Set();
    parentSegments.forEach((segment) => findSlotMatches(segment).forEach((slot) => parentSlotMatches.add(slot)));
    slotMatches = [...parentSlotMatches];
  }
  return {
    face: faceMatches.length === 1 ? faceMatches[0] : faceMatches.length > 1 ? 'ambiguous' : 'other',
    slot: slotMatches.length === 1 ? slotMatches[0] : slotMatches.length > 1 ? 'ambiguous' : 'map',
    faceMatches,
    slotMatches,
  };
}

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || '').toLowerCase().startsWith('image/')) return true;
  const extension = basename(file.name).split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
}

function getTextureLabel(texture) {
  if (!texture) return '空';
  const source = texture.source?.data;
  const name = source?.name || texture.name || '';
  return name ? basename(name) : '内嵌纹理';
}

function getMaterialKey(material, index) {
  if (!material) return `material-${index}`;
  if (!material.userData.__viewerMaterialKey) {
    material.userData.__viewerMaterialKey = `material-${index}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return material.userData.__viewerMaterialKey;
}

function collectModelData(root) {
  const materials = [];
  const materialSeen = new Map();
  const sceneLights = [];
  let nodeCount = 0;
  let meshCount = 0;
  let triangleCount = 0;
  let textureCount = 0;
  const texturesSeen = new Set();
  let cameraCount = 0;

  root.traverse((object) => {
    nodeCount += 1;
    if (object.isMesh || object.isSkinnedMesh) {
      meshCount += 1;
      const geometry = object.geometry;
      if (geometry) {
        const position = geometry.getAttribute('position');
        if (position) {
          triangleCount += geometry.index ? geometry.index.count / 3 : position.count / 3;
        }
      }
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.filter(Boolean).forEach((material) => {
        if (!materialSeen.has(material)) {
          const index = materials.length;
          materialSeen.set(material, index);
          materials.push(material);
          TEXTURE_SLOTS.forEach(({ key }) => {
            if (material[key] && !texturesSeen.has(material[key])) {
              texturesSeen.add(material[key]);
              textureCount += 1;
            }
          });
        }
      });
    }
    if (object.isLight) {
      sceneLights.push(object);
    }
    if (object.isCamera) cameraCount += 1;
  });

  return {
    materials,
    sceneLights,
    nodeCount,
    meshCount,
    triangleCount: Math.round(triangleCount),
    textureCount,
    cameraCount,
  };
}

function inspectExtensions(gltf) {
  const parserJson = gltf.parser?.json || {};
  const extensionsUsed = parserJson.extensionsUsed || [];
  const hasPunctual = extensionsUsed.includes('KHR_lights_punctual') || state.sceneLights.length > 0;
  // A GLB can contain an environment texture only through an extension or an app-specific userData field.
  const hasEnvironment = extensionsUsed.some((name) => /environment|ibl|lightprobe/i.test(name))
    || Boolean(gltf.userData?.environment || state.scene?.userData?.environment);
  return { extensionsUsed, hasPunctual, hasEnvironment };
}

function rememberOriginalMaterials(materials) {
  state.materials = materials;
  state.materialRecords.clear();
  state.originalTextures.clear();
  materials.forEach((material, index) => {
    const key = getMaterialKey(material, index);
    const originals = {};
    TEXTURE_SLOTS.forEach(({ key: slotKey }) => {
      originals[slotKey] = material[slotKey] || null;
      if (material[slotKey]) state.originalTextures.set(`${key}:${slotKey}`, material[slotKey]);
    });
    state.materialRecords.set(key, {
      key,
      material,
      index,
      name: materialDisplayName(material, index),
      face: normalizeFaceName(material.name),
      originals,
      replacements: {},
      activeSkuSlots: new Set(),
      nodes: [],
    });
  });
}

function collectMaterialNodes(root) {
  root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => {
      const record = [...state.materialRecords.values()].find((item) => item.material === material);
      if (record && !record.nodes.includes(object)) record.nodes.push(object);
    });
  });
}

function updateStats(data, extensions) {
  dom.statNodes.textContent = formatNumber(data.nodeCount);
  dom.statMeshes.textContent = formatNumber(data.meshCount);
  dom.statTriangles.textContent = formatNumber(data.triangleCount);
  dom.statMaterials.textContent = formatNumber(data.materials.length);
  dom.statTextures.textContent = formatNumber(data.textureCount);
  dom.statLights.textContent = formatNumber(data.sceneLights.length);
  dom.sceneLabel.textContent = state.modelAsset?.scene?.name || 'Scene';
  dom.metaScene.textContent = state.modelAsset?.scene?.name || 'Scene';
  dom.metaCameras.textContent = formatNumber(data.cameraCount);
  dom.metaPunctual.textContent = extensions.hasPunctual ? '已包含' : '未发现';
  dom.metaEnvironment.textContent = extensions.hasEnvironment ? '已包含' : '查看器辅助';
  const hasModelLights = data.sceneLights.length > 0;
  document.querySelector('#model-light-note').textContent = hasModelLights ? `${data.sceneLights.length} 盏模型灯光` : '当前模型没有自带灯光';
  dom.lightsButton.disabled = !hasModelLights;
  dom.lightsButton.title = hasModelLights
    ? '显示 / 隐藏模型自带灯光'
    : '模型文件未包含灯光（0）；请使用辅助环境光';
  dom.lightsButton.setAttribute('aria-label', hasModelLights ? '模型灯光' : '模型灯光（未包含）');
}

function makeMaterialCard(record) {
  const material = record.material;
  const card = document.createElement('article');
  card.className = 'material-card';
  card.dataset.materialKey = record.key;
  card.tabIndex = 0;

  const head = document.createElement('div');
  head.className = 'material-card-head';
  const swatch = document.createElement('div');
  swatch.className = 'material-swatch';
  swatch.title = '当前 Base Color';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'material-title-wrap';
  const title = document.createElement('span');
  title.className = 'material-name';
  title.textContent = record.name;
  const subtitle = document.createElement('span');
  subtitle.className = 'material-subtitle';
  subtitle.textContent = record.face === 'other' ? '未分类面向' : `${record.face.toUpperCase()} 面`;
  titleWrap.append(title, subtitle);
  const badge = document.createElement('span');
  badge.className = 'slot-badge';
  badge.textContent = `#${String(record.index + 1).padStart(2, '0')}`;
  head.append(swatch, titleWrap, badge);

  const props = document.createElement('div');
  props.className = 'material-properties';
  const colorRow = document.createElement('div');
  colorRow.className = 'property-row';
  colorRow.innerHTML = '<span>颜色</span><strong>—</strong>';
  const opacityRow = document.createElement('div');
  opacityRow.className = 'property-row';
  opacityRow.innerHTML = '<span>透明度</span><strong>—</strong>';
  props.append(colorRow, opacityRow);
  const colorValue = colorRow.querySelector('strong');
  const opacityValue = opacityRow.querySelector('strong');
  if (material.color) {
    const color = `#${material.color.getHexString().toUpperCase()}`;
    colorValue.textContent = color;
    swatch.style.backgroundColor = color;
    swatch.style.backgroundImage = 'none';
  }
  opacityValue.textContent = Number.isFinite(material.opacity) ? material.opacity.toFixed(2) : '1.00';

  const statusGrid = document.createElement('div');
  statusGrid.className = 'texture-status-grid';
  const statusElements = new Map();
  TEXTURE_SLOTS.forEach(({ key, short }) => {
    const element = document.createElement('span');
    element.className = `texture-status${material[key] ? ' is-present' : ''}`;
    element.innerHTML = `<i></i>${short}`;
    element.title = material[key] ? `${short}: ${getTextureLabel(material[key])}` : `${short}: 空槽位`;
    statusGrid.append(element);
    statusElements.set(key, element);
  });

  const replaceRow = document.createElement('div');
  replaceRow.className = 'texture-replace-row';
  const select = document.createElement('select');
  select.className = 'texture-slot-select';
  select.setAttribute('aria-label', `${record.name} 贴图槽位`);
  TEXTURE_SLOTS.forEach(({ key, label }) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    select.append(option);
  });
  const label = document.createElement('label');
  label.className = 'replace-label';
  label.textContent = '替换';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/avif';
  label.append(input);
  replaceRow.append(select, label);

  const drop = document.createElement('div');
  drop.className = 'drop-texture';
  drop.textContent = '也可将图片拖到此处替换所选槽位';
  drop.setAttribute('aria-label', `${record.name} 图片拖放区`);

  card.append(head, props, statusGrid, replaceRow, drop);

  const selectRecord = () => selectMaterial(record.key);
  card.addEventListener('click', (event) => {
    if (!event.target.closest('select, label, input, .drop-texture')) selectRecord();
  });
  card.addEventListener('focus', selectRecord);
  select.addEventListener('change', selectRecord);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) replaceTexture(record, select.value, file, card, statusElements);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((eventName) => card.addEventListener(eventName, (event) => {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    drop.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => card.addEventListener(eventName, (event) => {
    if (eventName === 'drop' && isImageDrag(event)) {
      event.preventDefault();
      const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/'));
      if (file) replaceTexture(record, select.value, file, card, statusElements);
    }
    drop.classList.remove('is-dragging');
  }));

  record.ui = { card, swatch, statusElements, select, drop };
  return card;
}

function isImageDrag(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function refreshMaterialCard(record) {
  if (state.modelRoot) dom.statTextures.textContent = formatNumber(collectModelData(state.modelRoot).textureCount);
  updateTextureSourceUI();
  if (!record.ui) return;
  const { material } = record;
  const { swatch, statusElements } = record.ui;
  const map = material.map;
  if (map) {
    const color = material.color ? `#${material.color.getHexString().toUpperCase()}` : '#777777';
    swatch.style.backgroundColor = color;
    swatch.style.backgroundImage = 'none';
  } else if (material.color) {
    swatch.style.backgroundColor = `#${material.color.getHexString().toUpperCase()}`;
    swatch.style.backgroundImage = 'none';
  }
  TEXTURE_SLOTS.forEach(({ key, short }) => {
    const element = statusElements.get(key);
    const replaced = Boolean(record.replacements[key]);
    const original = Boolean(record.originals[key]);
    element.classList.toggle('is-present', original && !replaced);
    element.classList.toggle('is-replaced', replaced);
    element.title = material[key]
      ? `${short}: ${replaced ? getTextureLabel(material[key]) : getTextureLabel(material[key])}`
      : `${short}: 空槽位`;
  });
}

function renderMaterialPanel() {
  const count = state.materialRecords.size;
  dom.materialCountLabel.textContent = `${count} 个槽位`;
  updateTextureSourceUI();
  setBatchBusy(state.batchBusy);
}

function selectMaterial(key) {
  state.selectedMaterial = key;
  state.materialRecords.forEach((record) => {
    record.ui?.card.classList.toggle('is-selected', record.key === key);
  });
}

function prepareTexture(texture, fileName, slotKey = 'map', template = null) {
  texture.name = fileName || texture.name || '';
  // glTF textures use a bottom-left origin in their UV convention.
  texture.flipY = false;
  if (template?.isTexture) {
    // Preserve the UV set and transforms configured by the GLB material.
    // This matters for AO maps and models using KHR_texture_transform.
    texture.channel = template.channel;
    texture.mapping = template.mapping;
    texture.wrapS = template.wrapS;
    texture.wrapT = template.wrapT;
    texture.magFilter = template.magFilter;
    texture.minFilter = template.minFilter;
    texture.anisotropy = template.anisotropy;
    texture.repeat.copy(template.repeat);
    texture.offset.copy(template.offset);
    texture.center.copy(template.center);
    texture.rotation = template.rotation;
    texture.matrixAutoUpdate = template.matrixAutoUpdate;
    if (!template.matrixAutoUpdate) texture.matrix.copy(template.matrix);
  }
  if (slotKey === 'map' || slotKey === 'emissiveMap') texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadTextureFromFile(file, slotKey = 'map', template = null) {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('不是受支持的图片文件'));
      return;
    }
    let objectUrl;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(`无法读取 ${file.name}`));
      return;
    }
    let settled = false;
    const cleanup = () => {
      if (!objectUrl) return;
      try { URL.revokeObjectURL(objectUrl); } catch { /* already revoked */ }
      objectUrl = null;
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      const message = error?.message || `无法读取 ${file.name}`;
      reject(error instanceof Error ? error : new Error(message));
    };
    const loaded = (texture) => {
      if (settled) {
        // A synchronous loader failure can still leave a late callback in a
        // few WebKit versions. Do not retain that texture.
        texture?.dispose?.();
        return;
      }
      settled = true;
      cleanup();
      try {
        resolve(prepareTexture(texture, file.name, slotKey, template));
      } catch (error) {
        texture?.dispose?.();
        reject(error instanceof Error ? error : new Error(`无法处理 ${file.name}`));
      }
    };
    try {
      textureLoader.load(objectUrl, loaded, undefined, fail);
    } catch (error) {
      fail(error);
    }
  });
}

function loadTextureFromSource(file, slotKey = 'map', template = null) {
  if (!file?.url) return loadTextureFromFile(file, slotKey, template);
  return new Promise((resolve, reject) => {
    textureLoader.load(
      file.url,
      (texture) => {
        try {
          resolve(prepareTexture(texture, file.name, slotKey, template));
        } catch (error) {
          texture?.dispose?.();
          reject(error instanceof Error ? error : new Error(`无法处理 ${file.name}`));
        }
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(`无法读取 ${file.name}`)),
    );
  });
}

function enqueueTextureDecode(task) {
  const queued = state.textureDecodeTail.catch(() => {}).then(task);
  // Keep the tail fulfilled even when an individual decode is cancelled or
  // fails, otherwise one bad image would block every later SKU.
  state.textureDecodeTail = queued.catch(() => {});
  return queued;
}

function assignTexture(record, slotKey, texture, label = '', { cached = false } = {}) {
  const old = record.material[slotKey];
  const original = record.originals[slotKey] || null;
  // SKU textures live in the LRU cache and may be shared by several material
  // records.  Never dispose one merely because another SKU became active;
  // eviction is the single owner of cached texture disposal.
  if (old && old !== original && old !== texture && !isSkuCachedTexture(old)) old.dispose?.();
  record.material[slotKey] = texture;
  record.replacements[slotKey] = texture;
  if (!cached) record.activeSkuSlots?.delete(slotKey);
  record.material.needsUpdate = true;
  refreshMaterialCard(record);
  if (record.ui && label) record.ui.drop.textContent = `已替换 ${slotKey} · ${label}`;
}

async function replaceTexture(record, slotKey, file, card) {
  if (!isImageFile(file)) return;
  card.classList.add('is-loading');
  record.ui.drop.textContent = `正在载入 ${file.name}…`;
  try {
    const template = record.material[slotKey] || record.originals[slotKey] || null;
    const modelToken = state.modelLoadToken;
    const texture = await loadTextureFromFile(file, slotKey, template);
    if (modelToken !== state.modelLoadToken || !state.materialRecords.has(record.key)) { texture.dispose(); return; }
    assignTexture(record, slotKey, texture, file.name);
    selectMaterial(record.key);
  } catch (error) {
    record.ui.drop.textContent = `载入失败：${error?.message || file.name}`;
  } finally {
    card.classList.remove('is-loading');
  }
}

function clearBatchSummary() {
  state.batchToken += 1;
  state.batchResults = [];
  setBatchBusy(false);
  dom.batchSummary.hidden = true;
  dom.batchProgress.hidden = true;
  setBatchProgress(0);
  dom.batchResults.replaceChildren();
  setBatchPickerHint();
}

function setBatchProgress(percent) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (dom.batchProgressBar) dom.batchProgressBar.style.width = `${value}%`;
  if (dom.batchProgress) dom.batchProgress.setAttribute('aria-valuenow', String(value));
}

function batchResultLabel(result) {
  if (result.status === 'matched') return '已匹配';
  if (result.status === 'pending') return '待处理';
  if (result.status === 'duplicate') return '重复';
  if (result.status === 'ambiguous') return '歧义';
  return '未匹配';
}

function renderBatchResults(results, running = false) {
  const matched = results.filter((result) => result.status === 'matched').length;
  const duplicate = results.filter((result) => result.status === 'duplicate').length;
  const pending = results.filter((result) => result.status === 'pending').length;
  const unresolved = results.filter((result) => ['unmatched', 'ambiguous'].includes(result.status)).length;
  dom.batchSummary.hidden = results.length === 0;
  dom.batchSummary.open = running || unresolved > 0 || duplicate > 0;
  dom.batchSummaryTitle.textContent = running ? '正在处理文件夹…' : '批量替换结果';
  dom.batchSummaryCounts.textContent = running
    ? `${matched} 已替换 · ${pending} 待处理 · ${unresolved} 未处理 · ${duplicate} 重复`
    : `${matched} 已替换 · ${pending} 待载入 · ${unresolved} 未处理 · ${duplicate} 重复`;
  dom.batchResults.replaceChildren();
  results.forEach((result) => {
    const row = document.createElement('div');
    row.className = `batch-result is-${result.status}`;
    const status = document.createElement('span');
    status.className = 'batch-result-status';
    status.textContent = batchResultLabel(result);
    const name = document.createElement('span');
    name.className = 'batch-result-name';
    name.textContent = batchFilePath(result.file);
    name.title = batchFilePath(result.file);
    const detail = document.createElement('span');
    detail.className = 'batch-result-detail';
    detail.textContent = result.slot && result.slot !== 'ambiguous'
      ? `${TEXTURE_SLOT_LABELS[result.slot] || result.slot} · ${result.detail}`
      : result.detail;
    row.append(status, name, detail);
    dom.batchResults.append(row);
  });
}

function getBatchTargetRecords(face) {
  return [...state.materialRecords.values()].filter((record) => record.face === face);
}

function getSkuTargetKey(face, slot) {
  return `${face}:${slot}`;
}

function makeSkuGroups(files) {
  const groupsByKey = new Map();
  files.forEach((file) => {
    const info = batchGroupInfo(file);
    let group = groupsByKey.get(info.key);
    if (!group) {
      group = {
        id: '',
        key: info.key,
        folder: info.folder,
        root: info.root,
        files: [],
        detailFiles: [],
        items: [],
        slotItems: new Map(),
        results: [],
        validCount: 0,
      };
      groupsByKey.set(info.key, group);
    }
    if (isDetailImage(file)) {
      group.detailFiles.push(file);
      return;
    }
    const parsed = parseTextureFile(file);
    group.files.push(file);
    group.items.push({ file, ...parsed });
  });

  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  const groups = [...groupsByKey.values()].sort((a, b) => {
    const aNumber = String(a.folder || '').match(/(?:sku[ _-]*)?(\d+)$/i)?.[1];
    const bNumber = String(b.folder || '').match(/(?:sku[ _-]*)?(\d+)$/i)?.[1];
    if (aNumber && bNumber && Number(aNumber) !== Number(bNumber)) return Number(aNumber) - Number(bNumber);
    if (aNumber && !bNumber) return -1;
    if (!aNumber && bNumber) return 1;
    return collator.compare(a.folder || a.key, b.folder || b.key);
  });

  const labels = new Set();
  groups.forEach((group, index) => {
    group.detailFiles.sort((a, b) => collator.compare(a.name, b.name));
    group.id = `sku-${index + 1}`;
    // SKU labels always reflect import order, independent of the source
    // folder name. Thus selecting `12pro/2` alone still creates SKU1, while
    // selecting `12pro` creates SKU1, SKU2, ... after natural folder sorting.
    group.label = `SKU${index + 1}`;
    labels.add(group.label);

    const duplicateTargets = new Map();
    group.items.forEach((item) => {
      if (item.face === 'ambiguous' || item.face === 'other' || item.slot === 'ambiguous') return;
      const key = getSkuTargetKey(item.face, item.slot);
      if (!duplicateTargets.has(key)) duplicateTargets.set(key, []);
      duplicateTargets.get(key).push(item);
    });
    duplicateTargets.forEach((items, key) => {
      if (items.length === 1) {
        group.slotItems.set(key, items[0]);
        group.validCount += 1;
      }
    });
  });
  return groups;
}

function classifySkuGroup(group, targetsByFace) {
  const duplicateTargets = new Map();
  group.items.forEach((item) => {
    if (item.face === 'ambiguous' || item.face === 'other' || item.slot === 'ambiguous') return;
    const key = getSkuTargetKey(item.face, item.slot);
    if (!duplicateTargets.has(key)) duplicateTargets.set(key, []);
    duplicateTargets.get(key).push(item);
  });
  group.results = group.items.map((item) => {
    const { file, face, slot } = item;
    let status = 'unmatched';
    let detail = '文件名未识别面向';
    if (face === 'ambiguous') {
      status = 'ambiguous';
      detail = '文件名包含多个面向关键词';
    } else if (slot === 'ambiguous') {
      status = 'ambiguous';
      detail = '文件名包含多个贴图槽关键词';
    } else if (face !== 'other' && (duplicateTargets.get(getSkuTargetKey(face, slot)) || []).length > 1) {
      status = 'duplicate';
      detail = `${face.toUpperCase()} / ${TEXTURE_SLOT_LABELS[slot]} 有 ${(duplicateTargets.get(getSkuTargetKey(face, slot)) || []).length} 个文件，未自动选择`;
    } else if (face !== 'other') {
      const targets = targetsByFace.get(face) || [];
      if (!targets.length) detail = `未找到 ${face.toUpperCase()} 材质槽位`;
      else {
        status = 'pending';
        detail = `等待替换 ${targets.length} 个材质`;
      }
    }
    return {
      ...item,
      skuId: group.id,
      skuLabel: group.label,
      status,
      detail,
      targets: [],
    };
  });
  // Only unique files with an actual material target are decoded.  Keeping
  // unmatched metadata is useful for diagnostics but avoids needless image
  // allocations for folders containing previews or unrelated assets.
  group.slotItems = new Map();
  group.validCount = 0;
  group.results.forEach((result) => {
    if (result.status !== 'pending') return;
    const key = getSkuTargetKey(result.face, result.slot);
    group.slotItems.set(key, result);
    group.validCount += 1;
  });
  return group.results;
}

function touchSkuCache(entry) {
  if (!entry) return;
  entry.lastUsed = ++state.skuCacheClock;
}

function textureIsReferenced(texture) {
  if (!texture) return false;
  for (const record of state.materialRecords.values()) {
    for (const { key } of TEXTURE_SLOTS) {
      if (record.material[key] === texture) return true;
    }
  }
  return false;
}

function disposeSkuCacheEntry(entry) {
  if (!entry || entry.loading) return false;
  state.skuCache.delete(entry.id);
  state.skuCacheBytes = Math.max(0, state.skuCacheBytes - (entry.bytes || 0));
  entry.textures.forEach((texture) => {
    // An inactive entry should normally have no material references.  Keep a
    // defensive check so a manually selected/shared texture cannot be freed
    // while Three.js is still sampling it.
    if (!textureIsReferenced(texture)) texture.dispose?.();
  });
  entry.textures.clear();
  entry.bytes = 0;
  entry.loaded = false;
  const group = state.skuSetById.get(entry.id);
  group?.slotItems?.forEach((item) => {
    if (item.status === 'matched') {
      item.status = 'pending';
      item.detail = '缓存已释放，点击 SKU 可重新载入';
    }
  });
  return true;
}

function evictSkuCacheIfNeeded() {
  const activeId = state.activeSkuId;
  const overLimit = () => state.skuCache.size > SKU_CACHE_MAX_ENTRIES || state.skuCacheBytes > SKU_CACHE_MAX_BYTES;
  while (overLimit()) {
    const candidates = [...state.skuCache.values()]
      .filter((entry) => entry.id !== activeId && !entry.loading)
      .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    if (!candidates.length) break;
    if (!disposeSkuCacheEntry(candidates[0])) break;
  }
  renderSkuPanel();
}

function clearSkuCaches() {
  [...state.skuCache.values()].forEach((entry) => {
    // During model teardown material references are removed immediately
    // afterwards; disposing here is safe and releases GPU memory promptly.
    entry.loading = null;
    entry.textures.forEach((texture) => texture.dispose?.());
    entry.textures.clear();
    entry.bytes = 0;
    entry.loaded = false;
  });
  state.skuCache.clear();
  state.skuCacheBytes = 0;
  state.activeSkuId = null;
  renderSkuPanel();
}

function isSkuCachedTexture(texture) {
  if (!texture) return false;
  for (const entry of state.skuCache.values()) {
    for (const candidate of entry.textures.values()) {
      if (candidate === texture) return true;
    }
  }
  return false;
}

function skuCacheEntryFor(id) {
  return state.skuCache.get(id) || null;
}

function renderSkuPanel() {
  if (!dom.skuPanel || !dom.skuList) return;
  const groups = state.skuSets || [];
  const options = groups.map((group) => new Option(group.label, group.id));
  if (!options.length) options.push(new Option('模型原始贴图', ''));
  dom.skuSelect.replaceChildren(...options);
  dom.skuSelect.disabled = groups.length === 0;
  dom.skuSelect.value = state.activeSkuId || groups[0]?.id || '';
  updateTextureSourceUI();
  dom.skuPanel.hidden = groups.length === 0;
  if (dom.skuPanelTitle) dom.skuPanelTitle.textContent = groups.length ? `贴图 SKU（${groups.length}）` : '贴图 SKU';
  if (dom.skuCacheLabel) {
    const loaded = [...state.skuCache.values()].filter((entry) => entry.loaded).length;
    dom.skuCacheLabel.textContent = loaded
      ? `缓存 ${loaded}/${groups.length} · ${formatFileSize(state.skuCacheBytes)}`
      : '首次点击后载入';
  }
  dom.skuList.replaceChildren();
  groups.forEach((group) => {
    const entry = skuCacheEntryFor(group.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sku-card${state.activeSkuId === group.id ? ' is-active' : ''}`;
    button.dataset.skuId = group.id;
    button.setAttribute('aria-pressed', String(state.activeSkuId === group.id));
    button.title = `切换到 ${group.label}`;

    const head = document.createElement('span');
    head.className = 'sku-card-head';
    const label = document.createElement('strong');
    label.textContent = group.label;
    const status = document.createElement('span');
    status.className = 'sku-card-status';
    status.textContent = state.activeSkuId === group.id
      ? '当前'
      : entry?.loading
        ? '载入中'
        : entry?.loaded
          ? '已缓存'
          : '待载入';
    head.append(label, status);

    const meta = document.createElement('span');
    meta.className = 'sku-card-meta';
    const source = group.folder && group.folder !== group.label ? `文件夹：${group.folder}` : '';
    const matched = group.validCount || 0;
    meta.textContent = `${group.files.length} 张图片 · ${matched} 个贴图槽${source ? ` · ${source}` : ''}`;
    button.append(head, meta);
    button.addEventListener('click', () => { void activateSkuSet(group.id); });
    dom.skuList.append(button);
  });
}

function restoreRecordTexture(record, slotKey) {
  if (!record) return;
  const current = record.material[slotKey];
  const original = record.originals[slotKey] || null;
  if (current && current !== original && !isSkuCachedTexture(current)) current.dispose?.();
  record.material[slotKey] = original;
  delete record.replacements[slotKey];
  record.activeSkuSlots?.delete(slotKey);
  record.material.needsUpdate = true;
  refreshMaterialCard(record);
}

function applySkuTextureSet(group, cacheEntry) {
  const availableKeys = new Set(cacheEntry?.textures?.keys?.() || []);
  // Remove slots supplied by the previous SKU but absent from the new one so
  // a partial folder never leaves stale images from the prior SKU visible.
  state.materialRecords.forEach((record) => {
    const activeSlots = record.activeSkuSlots || new Set();
    activeSlots.forEach((slotKey) => {
      const targetKey = getSkuTargetKey(record.face, slotKey);
      if (!availableKeys.has(targetKey)) restoreRecordTexture(record, slotKey);
    });
  });

  availableKeys.forEach((targetKey) => {
    const texture = cacheEntry.textures.get(targetKey);
    const item = group.slotItems.get(targetKey);
    if (!texture || !item) return;
    const [face, slot] = targetKey.split(':');
    const targets = getBatchTargetRecords(face);
    targets.forEach((record) => {
      assignTexture(record, slot, texture, item.file.name, { cached: true });
      if (!record.activeSkuSlots) record.activeSkuSlots = new Set();
      record.activeSkuSlots.add(slot);
    });
    item.status = 'matched';
    item.targets = targets;
    item.detail = `已替换 ${targets.length} 个材质`;
  });
}

function makeSkuCancellation() {
  const error = new Error('SKU 切换已取消');
  error.code = 'SKU_CANCELLED';
  return error;
}

async function ensureSkuTextures(group, token, onProgress = () => {}) {
  let entry = skuCacheEntryFor(group.id);
  if (entry?.loaded) {
    touchSkuCache(entry);
    onProgress(1, 1);
    return entry;
  }
  if (entry?.loading) {
    // A second click on the SKU should take ownership of the in-flight load
    // instead of cancelling the shared promise with its newer selection
    // token. This also keeps progress attached to the latest click.
    entry.requestToken = token;
    entry.onProgress = onProgress;
    onProgress(entry.completed || 0, entry.total || 1);
    return entry.loading;
  }

  entry = entry || {
    id: group.id,
    textures: new Map(),
    bytes: 0,
    loaded: false,
    loading: null,
    lastUsed: 0,
  };
  entry.requestToken = token;
  entry.onProgress = onProgress;
  state.skuCache.set(group.id, entry);
  const items = [...group.slotItems.values()];
  const total = Math.max(items.length, 1);
  entry.completed = 0;
  entry.total = total;
  entry.loading = (async () => {
    let completed = 0;
    for (const item of items) {
      if (entry.requestToken !== state.batchToken) throw makeSkuCancellation();
      const key = getSkuTargetKey(item.face, item.slot);
      // A retry may reuse textures left by a non-cancellation decode error.
      if (!entry.textures.has(key)) {
        try {
          const template = getBatchTargetRecords(item.face)
            .map((record) => record.originals[item.slot])
            .find((candidate) => candidate?.isTexture) || null;
          const texture = await enqueueTextureDecode(() => {
            if (entry.requestToken !== state.batchToken) throw makeSkuCancellation();
            return loadTextureFromSource(item.file, item.slot, template);
          });
          if (entry.requestToken !== state.batchToken) {
            texture.dispose?.();
            throw makeSkuCancellation();
          }
          entry.textures.set(key, texture);
          entry.bytes += estimateTextureBytes(texture);
          state.skuCacheBytes += estimateTextureBytes(texture);
          // Enforce the entry/byte budget after every decoded image rather
          // than waiting for the whole SKU, keeping switch-time peaks lower.
          evictSkuCacheIfNeeded();
          item.status = 'matched';
          item.detail = '已载入缓存，等待切换';
        } catch (error) {
          if (error?.code === 'SKU_CANCELLED') throw error;
          item.status = 'unmatched';
          item.detail = `图片载入失败：${error?.message || item.file.name}`;
        }
      }
      completed += 1;
      entry.completed = completed;
      entry.onProgress?.(completed, total);
      renderSkuPanel();
    }
    if (entry.textures.size !== items.length) throw new Error(`${group.label} 部分贴图加载失败，请重新选择此 SKU 重试`);
    entry.loaded = true;
    entry.loading = null;
    entry.onProgress = null;
    touchSkuCache(entry);
    return entry;
  })();
  try {
    return await entry.loading;
  } catch (error) {
    entry.loading = null;
    entry.onProgress = null;
    // The same SKU id can exist again after importing a new folder, so only
    // remove this exact entry; never delete a newer library's cache entry.
    if (state.skuCache.get(entry.id) === entry) {
      if (error?.code === 'SKU_CANCELLED') {
        // A rapid switch should not leave partially decoded SKU sets piling
        // up. Release them immediately; the source File references remain and
        // clicking the SKU later simply loads it again.
        disposeSkuCacheEntry(entry);
        renderSkuPanel();
      } else if (!entry.textures.size) {
        state.skuCache.delete(entry.id);
      }
    }
    throw error;
  }
}

async function activateSkuSet(id) {
  const group = state.skuSetById.get(id);
  if (!group) return;
  if (state.activeSkuId === id) {
    const cached = skuCacheEntryFor(id);
    if (cached?.loaded) {
      touchSkuCache(cached);
      renderSkuPanel();
      return;
    }
  }
  const token = ++state.batchToken;
  setBatchBusy(true);
  dom.batchProgress.hidden = false;
  setBatchProgress(0);
  renderBatchResults(state.batchResults, true);
  renderSkuPanel();
  try {
    const entry = await ensureSkuTextures(group, token, (completed, total) => {
      if (token === state.batchToken) setBatchProgress((completed / Math.max(total, 1)) * 100);
    });
    if (token !== state.batchToken) return;
    applySkuTextureSet(group, entry);
    state.activeSkuId = id;
    detailWindow.setGroup(group);
    hideError();
    setLoadState(`${group.label} · 贴图已就绪`, 'ready');
    setFooterStatus(`${state.sourceLabel} · ${group.label}`);
    touchSkuCache(entry);
    evictSkuCacheIfNeeded();
    // Refresh aggregate result rows after applying the selected SKU.
    state.batchResults = state.skuSets.flatMap((sku) => sku.results || []);
    renderBatchResults(state.batchResults, false);
    renderSkuPanel();
  } catch (error) {
    if (error?.code !== 'SKU_CANCELLED') {
      showError(error);
      group.results?.forEach((result) => {
        if (result.status === 'pending') {
          result.status = 'unmatched';
          result.detail = `图片载入失败：${error?.message || '未知错误'}`;
        }
      });
      state.batchResults = state.skuSets.flatMap((sku) => sku.results || []);
      renderBatchResults(state.batchResults, false);
    }
  } finally {
    if (token === state.batchToken) {
      dom.batchProgress.hidden = true;
      setBatchBusy(false);
      renderSkuPanel();
    }
  }
}

function clearSkuState({ restore = true } = {}) {
  if (restore) {
    state.materialRecords.forEach((record) => {
      (record.activeSkuSlots || new Set()).forEach((slotKey) => restoreRecordTexture(record, slotKey));
      record.activeSkuSlots?.clear();
    });
  }
  clearSkuCaches();
  detailWindow.setGroup(state.modelDetailGroup);
  state.skuSets = [];
  state.skuSetById.clear();
  state.batchResults = [];
  renderSkuPanel();
}

async function handleBatchFiles(fileList) {
  const files = Array.from(fileList || [])
    .filter(isImageFile)
    .sort((a, b) => batchFilePath(a).localeCompare(batchFilePath(b), 'zh-CN', { numeric: true }));
  const token = ++state.batchToken;
  // A new import replaces the previous SKU library. Restore active SKU slots
  // first, then release all cached GPU textures before retaining new files.
  clearSkuState({ restore: true });
  if (!files.length) {
    setBatchBusy(false);
    dom.batchSummary.hidden = false;
    dom.batchSummaryTitle.textContent = '没有可处理的图片';
    dom.batchSummaryCounts.textContent = '请选择包含 PNG / JPG / WebP / AVIF 的文件夹';
    dom.batchResults.replaceChildren();
    dom.batchProgress.hidden = true;
    setBatchProgress(0);
    setBatchPickerHint();
    return;
  }

  setBatchBusy(true);
  const targetsByFace = new Map(MATERIAL_FACE_ORDER.map((face) => [face, getBatchTargetRecords(face)]));
  const groups = makeSkuGroups(files);
  groups.forEach((group) => classifySkuGroup(group, targetsByFace));
  state.skuSets = groups;
  state.skuSetById = new Map(groups.map((group) => [group.id, group]));
  state.batchResults = groups.flatMap((group) => group.results);

  const folderName = batchFolderName(files);
  const groupSummary = groups.length > 1 ? `，识别为 ${groups.length} 个 SKU` : '';
  dom.batchHint.textContent = folderName
    ? `已扫描「${folderName}」中的 ${files.length} 张图片${groupSummary}；首次点击 SKU 后载入并缓存`
    : `已扫描 ${files.length} 张图片${groupSummary}；首次点击 SKU 后载入并缓存`;
  dom.batchProgress.hidden = true;
  setBatchProgress(0);
  renderBatchResults(state.batchResults, false);
  renderSkuPanel();

  // Preserve the original single-folder behavior: activate the first (and
  // usually only) SKU automatically. Additional groups remain lazy-loaded.
  if (token === state.batchToken && groups[0]) await activateSkuSet(groups[0].id);
}

function resetMaterialTextures() {
  clearBatchSummary();
  state.materialRecords.forEach((record) => {
    TEXTURE_SLOTS.forEach(({ key }) => {
      const current = record.material[key];
      const original = record.originals[key] || null;
      if (current && current !== original && !isSkuCachedTexture(current)) current.dispose?.();
      record.material[key] = original;
      delete record.replacements[key];
    });
    record.activeSkuSlots?.clear();
    record.material.needsUpdate = true;
    if (record.ui) record.ui.drop.textContent = '也可将图片拖到此处替换所选槽位';
    refreshMaterialCard(record);
  });
  clearSkuCaches();
  detailWindow.setGroup(state.modelDetailGroup);
  state.skuSets = [];
  state.skuSetById.clear();
  state.batchResults = [];
  renderSkuPanel();
  setLoadState('模型自带贴图已就绪', 'ready');
  setFooterStatus(`${state.sourceLabel} · 已恢复模型自带贴图`);
}

function setModelLightsVisible(visible) {
  state.modelLightsEnabled = visible;
  state.sceneLights.forEach((light) => { light.visible = visible; });
  dom.lightsButton.classList.toggle('is-active', visible);
  dom.lightsButton.setAttribute('aria-pressed', String(visible));
}

function updateLightingControls() {
  const brightnessPercent = Math.round(state.environmentBrightness * 100);
  const azimuth = Math.round(state.environmentAzimuth);
  if (dom.environmentBrightnessInput) {
    dom.environmentBrightnessInput.value = String(brightnessPercent);
    dom.environmentBrightnessInput.setAttribute('aria-valuetext', `${brightnessPercent}%`);
  }
  if (dom.environmentBrightnessValue) dom.environmentBrightnessValue.textContent = `${brightnessPercent}%`;
  if (dom.environmentAngleInput) {
    dom.environmentAngleInput.value = String(azimuth);
    dom.environmentAngleInput.setAttribute('aria-valuetext', `${azimuth}度`);
  }
  if (dom.environmentAngleValue) {
    dom.environmentAngleValue.textContent = `${azimuth > 0 ? '+' : ''}${azimuth}°`;
  }
  dom.lightingSection?.classList.toggle('is-off', !state.environmentEnabled);
}

function applyEnvironmentSettings() {
  const brightness = THREE.MathUtils.clamp(Number(state.environmentBrightness) || 0, 0, 2);
  const azimuth = THREE.MathUtils.clamp(Number(state.environmentAzimuth) || 0, -180, 180);
  const rotation = THREE.MathUtils.degToRad(azimuth);
  state.environmentBrightness = brightness;
  state.environmentAzimuth = azimuth;

  const { hemisphere, key, fill } = state.helperLightRig;
  if (hemisphere) hemisphere.intensity = HELPER_LIGHT_DEFAULTS.hemisphereIntensity * brightness;
  if (key) {
    key.intensity = HELPER_LIGHT_DEFAULTS.keyIntensity * brightness;
    key.position.copy(HELPER_KEY_POSITION).applyAxisAngle(HELPER_Y_AXIS, rotation);
  }
  if (fill) {
    fill.intensity = HELPER_LIGHT_DEFAULTS.fillIntensity * brightness;
    fill.position.copy(HELPER_FILL_POSITION).applyAxisAngle(HELPER_Y_AXIS, rotation);
  }
  if (state.scene) {
    state.scene.environmentIntensity = state.environmentEnabled
      ? HELPER_LIGHT_DEFAULTS.environmentIntensity * brightness
      : 0;
    state.scene.environmentRotation?.set(0, rotation, 0);
  }
  updateLightingControls();
}

function setEnvironmentVisible(visible) {
  state.environmentEnabled = visible;
  state.helperLights.forEach((light) => { light.visible = visible; });
  if (state.scene) {
    state.scene.environment = visible ? state.viewerEnvironment : null;
    state.scene.background = visible ? state.scene.userData.__viewerBackground : new THREE.Color(0x10161e);
  }
  applyEnvironmentSettings();
  dom.environmentButton.classList.toggle('is-active', visible);
  dom.environmentButton.setAttribute('aria-pressed', String(visible));
}

function resetEnvironmentSettings() {
  state.environmentBrightness = HELPER_LIGHT_DEFAULTS.brightness;
  state.environmentAzimuth = HELPER_LIGHT_DEFAULTS.azimuth;
  applyEnvironmentSettings();
}

function createHelpers() {
  if (!state.scene) return;
  state.helperLights.forEach((light) => state.scene.remove(light));
  state.helperLights = [];
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x151821, 1.8);
  hemi.name = 'Viewer辅助环境光';
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.name = 'Viewer辅助主光';
  key.position.set(4, 7, 5);
  const fill = new THREE.DirectionalLight(0x91b9ff, 0.9);
  fill.name = 'Viewer辅助补光';
  fill.position.set(-5, 2, -4);
  state.helperLights = [hemi, key, fill];
  state.helperLightRig = { hemisphere: hemi, key, fill };
  state.scene.add(...state.helperLights);
  // RoomEnvironment is converted to a PMREM texture once and used as a
  // neutral studio IBL. It is a viewer-only aid; no pixels are written back
  // to the source GLB. The direct lights below retain readable contact/shading
  // when a material does not respond strongly to image-based lighting.
  if (state.pmremGenerator) {
    state.viewerEnvironment?.dispose?.();
    state.pmremGenerator.dispose?.();
  }
  state.pmremGenerator = new THREE.PMREMGenerator(state.renderer);
  const room = new RoomEnvironment();
  state.viewerEnvironment = state.pmremGenerator.fromScene(room, 0.04).texture;
  room.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
  const background = new THREE.Color(0x10161e);
  state.scene.userData.__viewerBackground = background;
  state.scene.background = background;
  setEnvironmentVisible(state.environmentEnabled);
}

function createGridAndAxes() {
  if (!state.scene) return;
  if (state.grid) {
    state.scene.remove(state.grid);
    state.grid.geometry?.dispose?.();
    if (Array.isArray(state.grid.material)) state.grid.material.forEach((material) => material.dispose?.());
    else state.grid.material?.dispose?.();
  }
  if (state.axes) {
    state.scene.remove(state.axes);
    state.axes.geometry?.dispose?.();
    if (Array.isArray(state.axes.material)) state.axes.material.forEach((material) => material.dispose?.());
    else state.axes.material?.dispose?.();
  }
  const size = Math.max(5, getModelRadius() * 3.1);
  state.grid = new THREE.GridHelper(size, 20, 0x3b4b5c, 0x1b2531);
  state.grid.name = 'Viewer辅助网格';
  state.grid.position.y = state.fitBox.min.y;
  state.grid.material.transparent = true;
  state.grid.material.opacity = 0.48;
  state.axes = new THREE.AxesHelper(Math.max(1, getModelRadius() * 1.2));
  state.axes.name = 'Viewer辅助坐标轴';
  state.scene.add(state.grid, state.axes);
  state.grid.visible = state.gridEnabled;
  state.axes.visible = state.axesEnabled;
}

function getModelRadius() {
  if (!state.fitBox || state.fitBox.isEmpty()) return 2;
  return Math.max(state.fitBox.getSize(new THREE.Vector3()).length() * 0.5, 0.5);
}

function fitCameraToModel({ preserveDirection = false } = {}) {
  if (!state.modelRoot || !state.camera || !state.controls) return;
  state.fitBox.setFromObject(state.modelRoot);
  state.fitBox.getBoundingSphere(state.fitSphere);
  const center = state.fitSphere.center.clone();
  const radius = Math.max(state.fitSphere.radius, 0.1);
  const direction = preserveDirection
    ? state.camera.position.clone().sub(state.controls.target).normalize()
    : (state.laptopLid ? new THREE.Vector3(0.35, 0.45, 1) : new THREE.Vector3(0.64, 0.42, 0.64)).normalize();
  const verticalHalfFov = THREE.MathUtils.degToRad(state.camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * state.camera.aspect);
  const distance = state.laptopLid
    ? radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.08
    : radius / Math.tan(verticalHalfFov) * 1.18;
  state.camera.position.copy(center).add(direction.multiplyScalar(distance));
  state.camera.near = Math.max(radius / 100, 0.001);
  state.camera.far = Math.max(radius * 100, 100);
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(center);
  state.controls.minDistance = Math.max(radius * 0.18, 0.01);
  state.controls.maxDistance = Math.max(radius * 12, 10);
  state.controls.update();
  state.initialCamera.position.copy(state.camera.position);
  state.initialCamera.target.copy(center);
  if (state.grid) {
    state.grid.position.y = state.fitBox.min.y;
    const size = Math.max(5, radius * 5.5);
    state.grid.scale.setScalar(size / 5);
  }
  if (state.axes) state.axes.scale.setScalar(Math.max(radius * 0.85, 0.5));
}

function resetView() {
  if (!state.camera || !state.controls || !state.modelRoot) return;
  state.camera.position.copy(state.initialCamera.position);
  state.controls.target.copy(state.initialCamera.target);
  state.controls.update();
}

function frameView() {
  fitCameraToModel({ preserveDirection: true });
}

function iconForObject(object) {
  if (object.isScene) return '◎';
  if (object.isMesh || object.isSkinnedMesh) return '◇';
  if (object.isCamera) return '▣';
  if (object.isLight) return '☼';
  return '·';
}

function buildTreeNode(object) {
  const li = document.createElement('li');
  li.className = 'tree-node';
  const row = document.createElement('div');
  row.className = 'tree-row';
  const children = [...object.children];
  const expander = document.createElement('button');
  expander.className = `tree-expander${children.length ? '' : ' is-empty'}`;
  expander.type = 'button';
  expander.textContent = children.length ? (state.expandedTree ? '⌄' : '›') : '·';
  expander.setAttribute('aria-label', children.length ? '展开/折叠节点' : '无子节点');
  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = iconForObject(object);
  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = object.name || `${object.type} #${object.id}`;
  name.title = name.textContent;
  const type = document.createElement('span');
  type.className = 'tree-type';
  type.textContent = object.type;
  row.append(expander, icon, name, type);
  li.append(row);
  if (children.length) {
    const nested = document.createElement('ul');
    nested.className = 'tree-list';
    nested.hidden = !state.expandedTree;
    children.forEach((child) => nested.append(buildTreeNode(child)));
    li.append(nested);
    expander.addEventListener('click', () => {
      nested.hidden = !nested.hidden;
      expander.textContent = nested.hidden ? '›' : '⌄';
    });
  }
  row.addEventListener('click', () => {
    if (object.isMesh || object.isSkinnedMesh) {
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const record = [...state.materialRecords.values()].find((item) => item.material === material);
      if (record) {
        selectMaterial(record.key);
        record.ui?.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  });
  return li;
}

function renderSceneTree() {
  dom.sceneTree.replaceChildren();
  if (!state.modelRoot) {
    dom.sceneTree.innerHTML = '<div class="empty-state small">加载模型后显示节点层级</div>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'tree-list';
  list.append(buildTreeNode(state.modelRoot));
  dom.sceneTree.append(list);
}

function disposeModel(root, extraTextures = []) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set(extraTextures);
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      // Cover all current Three.js / MeshPhysicalMaterial texture slots, not
      // only the six slots exposed by this viewer's replacement UI.
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose?.());
  materials.forEach((material) => material.dispose?.());
  geometries.forEach((geometry) => geometry.dispose?.());
}

function clearCurrentModel() {
  state.modelDetailGroup = null;
  state.laptopLid?.dispose();
  state.laptopLid = null;
  updateLidButton();
  // Invalidate an in-flight folder scan before its asynchronous texture loads
  // can attach images to the next model.
  state.batchToken += 1;
  clearBatchSummary();
  clearSkuState({ restore: true });
  if (state.modelRoot && state.scene) state.scene.remove(state.modelRoot);
  const textures = new Set();
  state.materialRecords.forEach((record) => {
    Object.values(record.originals).forEach((texture) => texture && textures.add(texture));
    Object.values(record.replacements).forEach((texture) => texture && textures.add(texture));
  });
  disposeModel(state.modelRoot, textures);
  state.modelRoot = null;
  state.modelAsset = null;
  state.materials = [];
  state.materialRecords.clear();
  state.sceneLights = [];
  renderMaterialPanel();
  renderSceneTree();
}

async function loadModel(url, sourceLabel = basename(url), revokeAfter = false) {
  const loadToken = ++state.modelLoadToken;
  hideError();
  setLoadState('读取模型…', 'busy');
  setFooterStatus('读取模型…', 'busy');
  dom.sourceName.textContent = sourceLabel;
  dom.modelBadge.textContent = sourceLabel;
  if (state.sourceSize > 0) dom.footerSize.textContent = formatFileSize(state.sourceSize);
  try {
    const gltf = await loader.loadAsync(url, (progress) => {
      if (loadToken !== state.modelLoadToken) return;
      if (progress.total) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        setLoadState(`读取模型 ${percent}%`, 'busy');
      }
    });
    // A newer open/reload request wins even if this older GLB finishes last.
    if (loadToken !== state.modelLoadToken) {
      disposeModel(gltf.scene || gltf.scenes?.[0]);
      return;
    }
    clearCurrentModel();
    state.modelAsset = gltf;
    state.modelRoot = gltf.scene || gltf.scenes?.[0];
    if (!state.modelRoot) throw new Error('GLB 中没有可显示的场景节点');
    state.scene.add(state.modelRoot);
    state.laptopLid = createLaptopLidController(gltf);
    updateLidButton();
    const builtin = spus.find((spu) => spu.url === url);
    const modelTitle = builtin?.label || sourceLabel.replace(/\.glb$/i, '');
    document.querySelector('#model-title').textContent = modelTitle;
    document.querySelector('#model-category-label').textContent = `${builtin?.categoryLabel || '模型'} / 外观预览`;
    setCanvasMode('ready');
    document.title = `${modelTitle} · 3D 瑕疵展示`;
    const data = collectModelData(state.modelRoot);
    state.sceneLights = data.sceneLights;
    rememberOriginalMaterials(data.materials);
    collectMaterialNodes(state.modelRoot);
    const extensions = inspectExtensions(gltf);
    updateStats(data, extensions);
    renderMaterialPanel();
    renderSceneTree();
    setModelLightsVisible(state.modelLightsEnabled);
    fitCameraToModel();
    createGridAndAxes();
    setLoadState('模型自带贴图已就绪', 'ready');
    setFooterStatus(`${modelTitle} · 图片仅在本机预览`);
    dom.batchHint.textContent = state.laptopLid
      ? '请选择 image 1.png ～ image 8.png 所在文件夹'
      : '请上传 front / back / left / right / top / bottom 六面图片文件夹';
    if (revokeAfter) {
      if (state.modelObjectUrl && state.modelObjectUrl !== url) URL.revokeObjectURL(state.modelObjectUrl);
      state.modelObjectUrl = url;
    }
  } catch (error) {
    if (loadToken !== state.modelLoadToken) return;
    showError(error);
    console.error(error);
  }
}

function handleFile(file) {
  if (file) library?.openAddModel(file);
}

function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.setSize(dom.viewport.clientWidth, dom.viewport.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'GLB 模型画布');
  dom.viewport.append(renderer.domElement);
  state.renderer = renderer;
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x10161e);
  state.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  state.camera.position.copy(state.initialCamera.position);
  state.controls = new OrbitControls(state.camera, renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.075;
  state.controls.screenSpacePanning = true;
  state.controls.rotateSpeed = 0.65;
  state.controls.zoomSpeed = 0.85;
  state.controls.panSpeed = 0.65;
  state.controls.target.copy(state.initialCamera.target);
  state.controls.addEventListener('change', () => {
    dom.renderMode.textContent = '实时预览';
  });
  const resize = () => {
    if (immersiveDemo?.active) return;
    const width = Math.max(1, dom.viewport.clientWidth);
    const height = Math.max(1, dom.viewport.clientHeight);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(dom.viewport);
  resize();
}

function animate(now) {
  requestAnimationFrame(animate);
  // Browser zoom, a Retina display or moving between panels can change DPR
  // after startup without changing the canvas CSS size.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
  if (state.renderer && state.renderer.getPixelRatio() !== pixelRatio) {
    state.renderer.setPixelRatio(pixelRatio);
  }
  const delta = state.lastFrameTime === null ? 0 : Math.max(0, now - state.lastFrameTime);
  state.lastFrameTime = now;
  state.laptopLid?.update(delta / 1000);
  updateLidButton();
  if (state.fpsSampleStart === null) state.fpsSampleStart = now;
  else {
    state.fpsFrameCount++;
    const elapsed = now - state.fpsSampleStart;
    if (elapsed >= 500) {
      dom.footerFps.textContent = `${Math.round(state.fpsFrameCount * 1000 / elapsed)} FPS`;
      state.fpsSampleStart = now;
      state.fpsFrameCount = 0;
    }
  }
  if (immersiveDemo?.active) immersiveDemo.render();
  else {
    state.controls?.update();
    state.renderer?.render(state.scene, state.camera);
  }
}

function wireEvents() {
  dom.lidButton.addEventListener('click', () => {
    state.laptopLid?.toggle();
    updateLidButton();
  });
  document.querySelector('#empty-add-model').addEventListener('click', () => library?.openAddModel());
  dom.skuSelect.addEventListener('change', () => void activateSkuSet(dom.skuSelect.value));
  dom.openFileButton.addEventListener('click', () => library?.openAddModel());
  dom.dropZone.addEventListener('click', () => library?.openAddModel());
  dom.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      library?.openAddModel();
    }
  });
  dom.fileInput.addEventListener('change', () => {
    handleFile(dom.fileInput.files?.[0]);
    dom.fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((eventName) => dom.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dom.dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => dom.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === 'drop') {
      const file = [...(event.dataTransfer?.files || [])][0];
      if (file) handleFile(file);
    }
    dom.dropZone.classList.remove('is-dragging');
  }));
  dom.reloadButton.addEventListener('click', () => loadModel(state.modelUrl, state.sourceLabel));
  dom.resetViewButton.addEventListener('click', resetView);
  dom.frameViewButton.addEventListener('click', frameView);
  dom.gridButton.addEventListener('click', () => {
    state.gridEnabled = !state.gridEnabled;
    if (state.grid) state.grid.visible = state.gridEnabled;
    dom.gridButton.classList.toggle('is-active', state.gridEnabled);
    dom.gridButton.setAttribute('aria-pressed', String(state.gridEnabled));
  });
  dom.axesButton.addEventListener('click', () => {
    state.axesEnabled = !state.axesEnabled;
    if (state.axes) state.axes.visible = state.axesEnabled;
    dom.axesButton.classList.toggle('is-active', state.axesEnabled);
    dom.axesButton.setAttribute('aria-pressed', String(state.axesEnabled));
  });
  dom.lightsButton.addEventListener('click', () => setModelLightsVisible(!state.modelLightsEnabled));
  dom.environmentButton.addEventListener('click', () => setEnvironmentVisible(!state.environmentEnabled));
  dom.recordButton?.addEventListener('click', toggleRecording);
  dom.environmentBrightnessInput.addEventListener('input', () => {
    state.environmentBrightness = Number(dom.environmentBrightnessInput.value) / 100;
    if (!state.environmentEnabled) setEnvironmentVisible(true);
    else applyEnvironmentSettings();
  });
  dom.environmentAngleInput.addEventListener('input', () => {
    state.environmentAzimuth = Number(dom.environmentAngleInput.value);
    if (!state.environmentEnabled) setEnvironmentVisible(true);
    else applyEnvironmentSettings();
  });
  dom.resetLightingButton.addEventListener('click', resetEnvironmentSettings);
  dom.resetMaterialsButton.addEventListener('click', resetMaterialTextures);
  dom.batchFolderButton.addEventListener('click', () => dom.batchFolderInput.click());
  dom.batchFolderInput.addEventListener('change', () => {
    void handleBatchFiles(dom.batchFolderInput.files);
    dom.batchFolderInput.value = '';
  });
  dom.expandTreeButton.addEventListener('click', () => {
    state.expandedTree = !state.expandedTree;
    dom.expandTreeButton.textContent = state.expandedTree ? '收起' : '展开';
    renderSceneTree();
  });
  dom.dismissError.addEventListener('click', hideError);
}

async function init() {
  initWorkspaceUI();
  initRenderer();
  immersiveDemo = createImmersiveDemo({ state, viewport: dom.viewport, skuSelect: dom.skuSelect,
    onSkuChange: (id) => void activateSkuSet(id) });
  document.querySelector('#immersive-button').addEventListener('click', () => {
    if (state.modelRoot) immersiveDemo.open();
    else showError('请先等待模型加载完成，再进入演示。');
  });
  createHelpers();
  wireEvents();
  setBatchPickerHint();
  setBatchBusy(false);
  dom.gridButton.setAttribute('aria-pressed', String(state.gridEnabled));
  dom.axesButton.setAttribute('aria-pressed', String(state.axesEnabled));
  dom.lightsButton.setAttribute('aria-pressed', String(state.modelLightsEnabled));
  dom.environmentButton.setAttribute('aria-pressed', String(state.environmentEnabled));
  updateLightingControls();
  setLoadState('准备加载模型', 'busy');
  dom.footerSize.textContent = formatFileSize(state.sourceSize);
  requestAnimationFrame(animate);
  library = await createModelLibrary({
    onCatalog: (catalog) => { spus = catalog.models; },
    onSelect: selectSpu,
    onEmpty: showEmptyLibrary,
  });
  const requested = new URLSearchParams(location.search).get('model');
  library.start(requested === 'laptop' ? 'macbooktest' : requested);

}

function showEmptyLibrary(categoryLabel) {
  state.modelLoadToken += 1;
  clearCurrentModel();
  state.modelUrl = null;
  state.sourceLabel = '';
  state.sourceSize = 0;
  if (state.modelObjectUrl) URL.revokeObjectURL(state.modelObjectUrl);
  state.modelObjectUrl = null;
  if (state.grid) state.scene.remove(state.grid);
  if (state.axes) state.scene.remove(state.axes);
  dom.reloadButton.disabled = true;
  dom.sourceName.textContent = '尚未添加模型';
  dom.modelBadge.textContent = '选择或新增模型';
  dom.footerSize.textContent = '—';
  document.querySelector('#model-title').textContent = '3D 看外观';
  document.querySelector('#model-category-label').textContent = categoryLabel || '模型预览';
  setCanvasMode('empty', categoryLabel);
  document.title = '3D 看外观';
  for (const key of ['statNodes', 'statMeshes', 'statTriangles', 'statMaterials', 'statTextures', 'statLights']) dom[key].textContent = '0';
  for (const key of ['sceneLabel', 'metaScene', 'metaCameras', 'metaPunctual', 'metaEnvironment']) dom[key].textContent = '—';
  hideError();
  setLoadState(categoryLabel ? '当前品类暂无模型，请添加 GLB' : '请先新增品类', 'idle');
  setFooterStatus('模型库已保存到本地');
  const address = new URL(location.href); address.searchParams.delete('model'); history.replaceState(null, '', address);
}

function selectSpu(spu) {
  if (!spu) return;
  if (state.modelObjectUrl) URL.revokeObjectURL(state.modelObjectUrl);
  state.modelObjectUrl = null;
  state.modelUrl = spu.url;
  state.sourceLabel = spu.file;
  state.sourceSize = spu.bytes;
  dom.reloadButton.disabled = false;
  document.querySelector('#model-title').textContent = spu.label;
  document.querySelector('#model-category-label').textContent = `${spu.categoryLabel || '模型'} / 外观预览`;
  setCanvasMode('loading');
  const address = new URL(location.href);
  address.searchParams.set('model', spu.id);
  history.replaceState(null, '', address);
  clearCurrentModel();
  loadModel(spu.url, spu.file);
}

function updateTextureSourceUI() {
  const replaced = [...state.materialRecords.values()].some(record => Object.keys(record.replacements).length > 0);
  const group = state.skuSetById.get(state.activeSkuId);
  document.querySelector('#texture-source-label').textContent = replaced ? (group?.label || '已导入图片') : '模型原始贴图';
  document.querySelector('#texture-source-mark').title = replaced ? '使用本次导入的图片' : '使用模型自带的原始贴图';
  dom.resetMaterialsButton.disabled = !state.materialRecords.size || (!replaced && !state.skuSets.length);
}

function setCanvasMode(mode, categoryLabel) {
  const empty = document.querySelector('#canvas-empty');
  empty.hidden = mode !== 'empty';
  if (mode === 'empty') {
    empty.querySelector('strong').textContent = categoryLabel ? `${categoryLabel}还没有模型` : '建立你的模型库';
    empty.querySelector('span').textContent = categoryLabel ? '添加 GLB 模型，开始查看外观。' : '先新增一个品类，再添加你的第一个模型。';
    document.querySelector('#empty-add-model').textContent = categoryLabel ? '添加模型' : '新增品类';
  }
  for (const button of [dom.resetViewButton, dom.frameViewButton, document.querySelector('#immersive-button')]) button.disabled = mode !== 'ready';
}

function updateLidButton() {
  const lid = state.laptopLid;
  dom.lidButton.hidden = !lid;
  if (!lid) return;
  const label = lid.targetOpen ? '合盖' : '开盖';
  const text = dom.lidButton.querySelector('em');
  if (text.textContent !== label) text.textContent = label;
  dom.lidButton.setAttribute('aria-label', `${label}笔记本`);
  dom.lidButton.setAttribute('aria-pressed', String(lid.targetOpen));
  dom.lidButton.dataset.lidState = lid.moving ? 'moving' : (lid.targetOpen ? 'open' : 'closed');
  dom.lidButton.title = lid.moving ? '点击可反向开合' : `${label}笔记本`;
}

async function toggleRecording() {
  if (state.recorder && state.recorder.state === 'recording') { state.recorder.stop(); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) { showError('当前浏览器不支持窗口录制，请使用 Chrome 或 Edge。'); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    state.recordStream = stream; state.recordChunks = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 }); state.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data.size) state.recordChunks.push(e.data); };
    recorder.onstop = () => { const blob = new Blob(state.recordChunks, { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `GLB-Studio-${state.activeSkuId || 'SKU'}.webm`; a.click(); stream.getTracks().forEach(t => t.stop()); state.recorder = null; dom.recordButton?.classList.remove('is-recording'); dom.recordButton?.querySelector('em')?.replaceChildren('录制窗口'); };
    recorder.start(250); dom.recordButton?.classList.add('is-recording'); dom.recordButton?.querySelector('em')?.replaceChildren('停止录制');
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (recorder.state === 'recording') recorder.stop(); });
  } catch (error) { if (error?.name !== 'AbortError') showError(error); }
}

init().catch(showError);
