import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCatalogStore, validateGlb } from '../catalog-store.mjs';

const original = fs.readFileSync(new URL('../../模型/SPU-iPhone17ProMax.glb', import.meta.url));
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-catalog-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '模型'));
  fs.writeFileSync(path.join(root, '模型', 'original.glb'), original);
  const seed = path.join(root, 'seed.json');
  fs.writeFileSync(seed, JSON.stringify([{ id: 'original', category: 'phone', categoryLabel: '手机', label: '原始模型', file: 'original.glb', url: '/models/original.glb', bytes: original.length }]));
  const store = createCatalogStore(root, seed);
  return { root, seed, store };
}
test('categories, model bytes and labels survive a fresh store instance', t => {
  const { root, seed, store } = setup(t);
  const added = store.addCategory('平板', store.read().revision);
  const result = store.addModel({ categoryId: added.categoryId, label: '新模型', filename: 'my-model.glb', bytes: original, revision: added.catalog.revision });
  const fresh = createCatalogStore(root, seed).read();
  assert.deepEqual(fresh, result.catalog);
  const model = fresh.models.find(item => item.id === result.modelId);
  assert.deepEqual(fs.readFileSync(path.join(root, '模型', model.file)), original);
  assert.equal(fresh.categories.find(item => item.id === added.categoryId).label, '平板');
});
test('deletion archives bytes and removing the final category does not resurrect seed models', t => {
  const { root, seed, store } = setup(t);
  const result = store.deleteCategory('phone', store.read().revision);
  assert.deepEqual(result.catalog.categories, []); assert.deepEqual(result.catalog.models, []);
  assert.equal(fs.existsSync(path.join(root, '模型', 'original.glb')), false);
  const trash = path.join(root, '数据', '回收站');
  assert.deepEqual(fs.readFileSync(path.join(trash, fs.readdirSync(trash)[0], 'original.glb')), original);
  assert.deepEqual(createCatalogStore(root, seed).read(), result.catalog);
  const added = store.addCategory('重新开始', result.catalog.revision);
  assert.equal(added.catalog.categories.length, 1);
});
test('deleting one model keeps its category and unrelated models', t => {
  const { store } = setup(t);
  const added = store.addModel({ categoryId: 'phone', label: '副本', filename: 'original.glb', bytes: original, revision: 1 });
  const deleted = store.deleteModel(added.modelId, added.catalog.revision);
  assert.equal(deleted.catalog.models.length, 1);
  assert.equal(deleted.catalog.models[0].id, 'original');
  assert.equal(deleted.catalog.categories.length, 1);
});
test('stale writes and duplicate names leave the catalog unchanged', t => {
  const { store } = setup(t);
  store.addCategory('笔记本', 1);
  const before = store.read();
  assert.throws(() => store.deleteCategory('phone', 1), /其他窗口/);
  assert.throws(() => store.addCategory(' 手机 ', before.revision), /同名/);
  assert.throws(() => store.addModel({ categoryId: 'phone', label: '原始模型', filename: 'x.glb', bytes: original, revision: before.revision }), /同名/);
  assert.deepEqual(store.read(), before);
});
test('empty, truncated and externally dependent GLBs fail without adding files', t => {
  const { root, store } = setup(t);
  const makeGlb = doc => {
    const text = JSON.stringify(doc); const json = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 4) * 4));
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(json.length + 20, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    return Buffer.concat([header, json]);
  };
  const empty = makeGlb({ asset: { version: '2.0' }, scenes: [{ name: 'Scene' }] });
  for (const bytes of [empty, original.subarray(0, 100)]) {
    assert.throws(() => store.addModel({ categoryId: 'phone', label: '坏模型', filename: 'bad.glb', bytes, revision: 1 }));
  }
  const external = makeGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{}] }], buffers: [{ uri: 'https://example.com/a.bin' }] });
  assert.throws(() => validateGlb(external), /外部/);
  assert.equal(store.read().models.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(root, '模型')), ['original.glb']);
});
test('unreadable catalog is reported without overwriting local state', t => {
  const { root, seed, store } = setup(t);
  const file = path.join(root, '数据', '模型目录.json'); fs.writeFileSync(file, '{broken');
  assert.throws(() => store.read(), /无法读取/);
  assert.throws(() => createCatalogStore(root, seed).read(), /无法读取/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
