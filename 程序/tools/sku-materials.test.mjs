import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { MeshStandardMaterial, Texture } from 'three';

// Exercise the production registration/switch/restore path without WebGL or
// DOM setup. Only the UI refresh is stubbed; material and texture objects are real.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function productionFunction(name) {
  const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `Production function ${name} exists`);
  return match[0];
}
function harness() {
  const state = { materialRecords: new Map(), originalTextures: new Map(), skuCache: new Map() };
  const context = vm.createContext({ state, refreshMaterialCard() {} });
  const functions = ['normalizeFaceText', 'nameTokens', 'aliasMatches', 'findFaceMatches',
    'normalizeFaceName', 'materialDisplayName', 'getMaterialKey', 'rememberOriginalMaterials',
    'getBatchTargetRecords', 'getSkuTargetKey', 'isSkuCachedTexture', 'assignTexture',
    'restoreRecordTexture', 'applySkuTextureSet'];
  vm.runInContext([
    source.slice(source.indexOf('const MATERIAL_FACE_ORDER'), source.indexOf('const SLOT_ALIASES')),
    source.slice(source.indexOf('const TEXTURE_SLOTS ='), source.indexOf('const TEXTURE_SLOT_LABELS')),
    ...functions.map(productionFunction),
  ].join('\n'), context);
  return { state, context };
}

test('backdetal and Blender duplicates map to back; unrelated/ambiguous names stay excluded', () => {
  const { context } = harness();
  for (const name of ['back', 'back-camera', 'backdetal', 'Backdetal.001', 'backdetail.002']) {
    assert.equal(context.normalizeFaceName(name), 'back', name);
  }
  for (const name of ['backdrop', 'backdetalextra', 'leftover', 'backdetal_front', 'glass']) {
    assert.equal(context.normalizeFaceName(name), 'other', name);
  }
  // Material aliases must not turn detail photos into back texture files.
  for (const name of ['backdetal', 'backdetail', 'backdrop', 'leftover']) {
    assert.equal(context.findFaceMatches(name).length, 0, name);
  }
});

test('MacBook numbered uploads match all shared material slots, including Blender duplicates', () => {
  const { context } = harness();
  for (let n = 1; n <= 8; n++) {
    assert.equal(context.findFaceMatches(`image ${n}`)[0], `tex0${n}`);
  }
  const names = { TEX01_LID_EXTERIOR: 'tex01', 'TEX02_SCREEN.001': 'tex02',
    TEX03_KEYCAPS: 'tex03', TEX03_TRACKPAD: 'tex03', TEX03_PALMREST: 'tex03',
    'TEX04_BOTTOM.001': 'tex04', TEX04_RUBBER_FEET: 'tex04',
    TEX05_BASE_front: 'tex05', TEX06_BASE_left: 'tex06',
    TEX07_BASE_right: 'tex07', TEX08_BASE_rear: 'tex08' };
  for (const [name, face] of Object.entries(names)) assert.equal(context.normalizeFaceName(name), face);
  assert.equal(context.normalizeFaceName('image 10'), 'other');
});

test('SKU A -> B -> cached A updates all three back materials and restores missing slots', () => {
  const { state, context } = harness();
  const names = ['back', 'back-camera', 'backdetal', 'backdetal.001', 'front', 'backdrop'];
  const materials = names.map(name => new MeshStandardMaterial({ name, map: new Texture() }));
  const originals = materials.map(m => m.map);
  context.rememberOriginalMaterials(materials);
  let disposed = 0;
  const makeSku = (id, faces) => {
    const textures = new Map(faces.map(face => {
      const texture = new Texture();
      texture.name = `${id}/${face}.png`;
      texture.addEventListener('dispose', () => disposed++);
      return [`${face}:map`, texture];
    }));
    const entry = { textures };
    state.skuCache.set(id, entry);
    return { entry, group: { slotItems: new Map(faces.map(face =>
      [`${face}:map`, { file: { name: `${face}.png` } }])) } };
  };
  const a = makeSku('orange', ['back', 'front']);
  const b = makeSku('blue', ['back', 'front']);
  for (const sku of [a, b, a]) {
    context.applySkuTextureSet(sku.group, sku.entry);
    materials.slice(0, 4).forEach(m => assert.equal(m.map, sku.entry.textures.get('back:map'), m.name));
    assert.equal(materials[4].map, sku.entry.textures.get('front:map'));
    assert.equal(materials[5].map, originals[5], 'unrelated material unchanged');
    assert.equal(sku.group.slotItems.get('back:map').targets.length, 4);
  }
  const partial = makeSku('front-only', ['front']);
  context.applySkuTextureSet(partial.group, partial.entry);
  materials.slice(0, 4).forEach((m, i) => assert.equal(m.map, originals[i], m.name));
  for (const record of state.materialRecords.values()) context.restoreRecordTexture(record, 'map');
  materials.forEach((m, i) => assert.equal(m.map, originals[i]));
  assert.equal(disposed, 0, 'shared cached textures must remain alive during switching/restoring');
});
