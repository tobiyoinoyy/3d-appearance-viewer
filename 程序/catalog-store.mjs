import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const MAX_MODEL_BYTES = 256 * 1024 * 1024;
export class CatalogError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function atomicWrite(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function cleanName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[\x00-\x1f]/.test(name)) throw new CatalogError('名称需为 1–80 个字符。');
  return name;
}

export function validateGlb(bytes) {
  if (bytes.length < 28 || bytes.length > MAX_MODEL_BYTES) throw new CatalogError('GLB 文件为空、损坏或超过 256 MB。');
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new CatalogError('不是完整的 GLB 2.0 文件，请重新导出。');
  }
  let offset = 12, doc, binarySize = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new CatalogError('GLB 数据块不完整。');
    const size = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    if (size % 4 || offset + 8 + size > bytes.length) throw new CatalogError('GLB 数据块长度不正确。');
    if (offset === 12) {
      if (kind !== 0x4e4f534a) throw new CatalogError('GLB 缺少场景描述。');
      try { doc = JSON.parse(bytes.subarray(offset + 8, offset + 8 + size).toString()); }
      catch { throw new CatalogError('GLB 场景描述无法读取。'); }
    } else if (kind === 0x004e4942) binarySize = size;
    offset += 8 + size;
  }
  if (!doc || doc.asset?.version !== '2.0' || !Array.isArray(doc.meshes) || !doc.meshes.length) {
    throw new CatalogError('模型中没有网格，请导出包含机身的 GLB。');
  }
  const scene = doc.scenes?.[doc.scene ?? 0];
  const seen = new Set();
  let renderable = false;
  function visit(index) {
    if (seen.has(index)) return;
    seen.add(index);
    const node = doc.nodes?.[index];
    if (!node) throw new CatalogError('GLB 场景引用了不存在的节点。');
    if (node.mesh !== undefined && doc.meshes[node.mesh]?.primitives?.length) renderable = true;
    (node.children || []).forEach(visit);
  }
  (scene?.nodes || []).forEach(visit);
  if (!renderable) throw new CatalogError('GLB 默认场景中没有可显示的网格。');
  for (const resource of [...(doc.buffers || []), ...(doc.images || [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) throw new CatalogError('请将外部图片和数据打包进 GLB 后再添加。');
  }
  for (const buffer of doc.buffers || []) {
    if (!buffer.uri && buffer.byteLength > binarySize) throw new CatalogError('GLB 几何数据不完整。');
  }
  for (const view of doc.bufferViews || []) {
    if (!doc.buffers?.[view.buffer] || (view.byteOffset || 0) + view.byteLength > doc.buffers[view.buffer].byteLength) {
      throw new CatalogError('GLB 数据范围不正确。');
    }
  }
  return doc;
}

export function createCatalogStore(root, seedFile) {
  const dataDir = path.join(root, '数据');
  const modelDir = path.join(root, '模型');
  const catalogFile = path.join(dataDir, '模型目录.json');
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(modelDir, { recursive: true });
  if (!fs.existsSync(catalogFile)) {
    const models = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const categories = [...new Map(models.map(model => [model.category, { id: model.category, label: model.categoryLabel }])).values()];
    atomicWrite(catalogFile, JSON.stringify({ version: 1, revision: 1, categories, models }, null, 2));
  }
  function read() {
    let catalog;
    try { catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')); }
    catch { throw new CatalogError('本地模型目录无法读取，请保留文件并检查 数据/模型目录.json。', 500); }
    if (catalog.version !== 1 || !Number.isSafeInteger(catalog.revision) || !Array.isArray(catalog.categories) || !Array.isArray(catalog.models)) {
      throw new CatalogError('本地模型目录格式不正确，未覆盖现有数据。', 500);
    }
    return catalog;
  }
  function forWrite(revision) {
    const catalog = read();
    if (String(catalog.revision) !== String(revision)) throw new CatalogError('目录已在其他窗口更新，请重新打开页面后操作。', 409);
    return catalog;
  }
  function save(catalog) {
    atomicWrite(path.join(dataDir, '模型目录.上次保存.json'), fs.readFileSync(catalogFile));
    const next = { ...catalog, revision: catalog.revision + 1 };
    atomicWrite(catalogFile, JSON.stringify(next, null, 2));
    return next;
  }
  function modelPath(file) {
    if (!file || path.basename(file) !== file) throw new CatalogError('模型文件名不正确。', 500);
    const target = path.join(modelDir, file);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new CatalogError('模型文件不能使用外部软链接。', 500);
    return target;
  }
  function remove(catalog, models, categories = []) {
    const archive = path.join(dataDir, '回收站', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(archive, { recursive: true });
    atomicWrite(path.join(archive, '删除记录.json'), JSON.stringify({ deletedAt: new Date().toISOString(), categories, models, previousCatalog: catalog }, null, 2));
    // Copy first, commit the catalog, then remove active files. A crash cannot destroy the only copy.
    for (const model of models) {
      const original = modelPath(model.file);
      if (fs.existsSync(original)) fs.copyFileSync(original, path.join(archive, model.file));
    }
    const ids = new Set(models.map(model => model.id));
    const categoryIds = new Set(categories.map(category => category.id));
    const next = save({ ...catalog, categories: catalog.categories.filter(item => !categoryIds.has(item.id)), models: catalog.models.filter(item => !ids.has(item.id)) });
    for (const model of models) {
      if (next.models.some(other => other.file === model.file)) continue;
      try { fs.unlinkSync(modelPath(model.file)); } catch { /* Archived and removed from catalog; a leftover file is harmless. */ }
    }
    return next;
  }
  return {
    read,
    addCategory(label, revision) {
      const catalog = forWrite(revision); label = cleanName(label);
      if (catalog.categories.some(item => item.label.toLocaleLowerCase() === label.toLocaleLowerCase())) throw new CatalogError('已存在同名品类。');
      const category = { id: `category-${randomUUID()}`, label };
      return { catalog: save({ ...catalog, categories: [...catalog.categories, category] }), categoryId: category.id };
    },
    deleteCategory(id, revision) {
      const catalog = forWrite(revision), category = catalog.categories.find(item => item.id === id);
      if (!category) throw new CatalogError('品类不存在。', 404);
      return { catalog: remove(catalog, catalog.models.filter(model => model.category === id), [category]) };
    },
    addModel({ categoryId, label, filename, bytes, revision }) {
      const catalog = forWrite(revision);
      const category = catalog.categories.find(item => item.id === categoryId);
      if (!category) throw new CatalogError('请先选择或新增一个品类。');
      if (!/\.glb$/i.test(filename || '')) throw new CatalogError('请选择 .glb 文件。');
      label = cleanName(label);
      if (catalog.models.some(item => item.category === categoryId && item.label.toLocaleLowerCase() === label.toLocaleLowerCase())) throw new CatalogError('当前品类已存在同名模型，请换一个名称。');
      validateGlb(bytes);
      const id = `model-${randomUUID()}`;
      const stem = path.basename(filename).replace(/\.glb$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 60) || '模型';
      const file = `${stem}--${id.slice(-12)}.glb`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const model = { id, label, category: categoryId, categoryLabel: category.label, file, originalFilename: path.basename(filename), bytes: bytes.length, sha256, url: `/models/${encodeURIComponent(file)}?v=${sha256.slice(0, 12)}` };
      const target = modelPath(file);
      atomicWrite(target, bytes);
      try { return { catalog: save({ ...catalog, models: [...catalog.models, model] }), modelId: id }; }
      catch (error) { fs.unlinkSync(target); throw error; }
    },
    deleteModel(id, revision) {
      const catalog = forWrite(revision), model = catalog.models.find(item => item.id === id);
      if (!model) throw new CatalogError('模型不存在。', 404);
      return { catalog: remove(catalog, [model]) };
    },
  };
}

export async function readRequestBody(request, limit) {
  if (Number(request.headers['content-length']) > limit) throw new CatalogError('文件超过大小限制（GLB 最大 256 MB）。', 413);
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new CatalogError('文件超过大小限制（GLB 最大 256 MB）。', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
