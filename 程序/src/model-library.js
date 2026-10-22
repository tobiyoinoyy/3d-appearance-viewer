export async function createModelLibrary({ onCatalog, onSelect, onEmpty }) {
  const tabs = document.querySelector('#category-tabs');
  const options = document.querySelector('#spu-options');
  const addCategory = document.querySelector('#add-category');
  const deleteCategory = document.querySelector('#delete-category');
  const addModel = document.querySelector('#add-model');
  const status = document.querySelector('#library-status');
  const search = document.querySelector('#library-search');
  const dialog = document.querySelector('#library-dialog');
  const form = document.querySelector('#library-form');
  const title = document.querySelector('#library-dialog-title');
  const description = document.querySelector('#library-dialog-description');
  const nameRow = document.querySelector('#library-name-row');
  const nameInput = document.querySelector('#library-name');
  const fileRow = document.querySelector('#library-file-row');
  const fileInput = document.querySelector('#library-file');
  const fileLabel = document.querySelector('#library-file-label');
  const errorBox = document.querySelector('#library-error');
  const submit = document.querySelector('#library-submit');
  const cancel = document.querySelector('#library-cancel');
  let catalog, token, activeCategory = null, selectedId = null, busy = false, action, droppedFile;
  const lastModel = new Map();

  async function request(endpoint, { method = 'GET', body } = {}) {
    const response = await fetch(endpoint, {
      method, body, cache: 'no-store',
      headers: method === 'GET' ? {} : {
        'X-Viewer-Token': token, 'X-Catalog-Revision': String(catalog.revision),
        'Content-Type': body instanceof File ? 'model/gltf-binary' : 'application/json',
      },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '本地保存失败，请重试。');
    return result;
  }
  function accept(data) {
    catalog = data.catalog;
    if (data.token) token = data.token;
    onCatalog(catalog);
  }
  function currentCategory() { return catalog.categories.find(item => item.id === activeCategory); }
  function render() {
    document.querySelector('#library-count').textContent = `${catalog.models.length} 个模型 · 保存在本机`;
    const inCategory = catalog.models.filter(model => model.category === activeCategory);
    const query = search.value.trim().toLocaleLowerCase();
    const visibleModels = inCategory.filter(model => model.label.toLocaleLowerCase().includes(query));
    document.querySelector('#category-model-count').textContent = `模型 · ${visibleModels.length}${query ? '/' + inCategory.length : ''}`;
    tabs.replaceChildren(...catalog.categories.map(category => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'category-tab'; button.id = `category-${category.id}`;
      button.dataset.category = category.id; button.textContent = category.label; button.title = category.label;
      button.setAttribute('aria-label', category.label);
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'spu-options');
      button.setAttribute('aria-selected', String(category.id === activeCategory));
      button.tabIndex = category.id === activeCategory ? 0 : -1;
      return button;
    }));
    if (activeCategory) options.setAttribute('aria-labelledby', `category-${activeCategory}`);
    else { options.removeAttribute('aria-labelledby'); options.setAttribute('aria-label', '模型列表'); }
    options.replaceChildren(...visibleModels.map(model => {
      const row = document.createElement('div'); row.className = 'spu-row';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'spu-option';
      button.dataset.spu = model.id; button.setAttribute('aria-pressed', String(model.id === selectedId));
      button.setAttribute('aria-label', model.label);
      const icon = document.createElement('span'); icon.className = 'spu-device'; icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = model.category === 'phone'
        ? '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/></svg>'
        : `<svg class="icon"><use href="${model.category === 'laptop' ? '#i-laptop' : '#i-cube'}"/></svg>`;
      const copy = document.createElement('span'); copy.className = 'spu-copy';
      const label = document.createElement('strong'); label.textContent = model.label;
      const meta = document.createElement('span'); meta.className = 'spu-meta';
      meta.textContent = `${(model.bytes / 1024 / 1024).toFixed(1)} MB · GLB`;
      copy.append(label, meta);
      const indicator = document.createElement('span'); indicator.className = 'spu-indicator'; indicator.setAttribute('aria-hidden', 'true');
      button.append(icon, copy, indicator);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'model-remove';
      remove.dataset.removeModel = model.id; remove.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>'; remove.title = `删除 ${model.label}`;
      remove.setAttribute('aria-label', `删除模型 ${model.label}`);
      row.append(button, remove); return row;
    }));
    if (!options.children.length) {
      const empty = document.createElement('p'); empty.className = 'library-empty';
      empty.textContent = query ? '没有找到匹配的模型' : activeCategory ? '这个品类还没有模型，点击下方添加。' : '还没有品类，先新增一个吧。';
      if (query) {
        const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'text-button'; clear.textContent = '清除搜索';
        clear.addEventListener('click', () => { search.value = ''; render(); search.focus(); });
        empty.append(document.createElement('br'), clear);
      }
      options.append(empty);
    }
    deleteCategory.disabled = !activeCategory;
    addModel.disabled = !activeCategory;
    status.textContent = '已保存到本地文件夹';
  }
  function selectCategory(id, preferred) {
    const category = catalog.categories.find(item => item.id === id);
    if (activeCategory !== category?.id) search.value = '';
    activeCategory = category?.id || null;
    const idToUse = preferred || lastModel.get(activeCategory);
    const model = catalog.models.find(item => item.category === activeCategory && item.id === idToUse)
      || catalog.models.find(item => item.category === activeCategory);
    if (model) selectModel(model.id);
    else { selectedId = null; render(); onEmpty(category?.label || null); }
  }
  function selectModel(id) {
    const model = catalog.models.find(item => item.id === id);
    if (!model) return;
    const changed = selectedId !== id;
    if (!model.label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())) search.value = '';
    selectedId = id; activeCategory = model.category; lastModel.set(activeCategory, id);
    render(); if (changed) onSelect(model);
  }
  function open(kind, target, file) {
    if (busy) return;
    if (kind === 'add-model' && !currentCategory()) { kind = 'add-category'; file = null; }
    action = { kind, target, category: activeCategory, revision: catalog.revision };
    droppedFile = file || null;
    nameInput.value = file?.name.replace(/\.glb$/i, '') || '';
    nameInput.required = kind === 'add-category' || kind === 'add-model';
    nameRow.hidden = !nameInput.required; fileRow.hidden = kind !== 'add-model';
    fileInput.value = ''; fileLabel.textContent = file?.name || '请选择 GLB 文件，最大 256 MB';
    errorBox.textContent = ''; errorBox.hidden = true;
    const deleting = kind.startsWith('delete-');
    submit.classList.toggle('button-danger', deleting);
    if (kind === 'add-category') {
      title.textContent = '新增品类'; description.textContent = '例如：平板、手表。保存后会出现在品类 Tab 中。'; submit.textContent = '保存品类';
    } else if (kind === 'add-model') {
      title.textContent = '新增 GLB 模型'; description.textContent = `添加到「${currentCategory().label}」，模型文件和自带贴图会保存在本地。`; submit.textContent = '保存模型';
    } else if (kind === 'delete-model') {
      title.textContent = '删除模型'; description.textContent = `删除「${target.label}」？模型会从列表移除，文件移入本地回收站。`; submit.textContent = '删除模型';
    } else {
      const count = catalog.models.filter(model => model.category === target.id).length;
      title.textContent = '删除品类'; description.textContent = `删除「${target.label}」及其中的 ${count} 个模型？相关模型文件会移入本地回收站。`;
      submit.textContent = count ? `删除品类及 ${count} 个模型` : '删除品类';
    }
    dialog.showModal();
    (deleting ? cancel : nameInput).focus();
  }
  search.addEventListener('input', render);
  addCategory.addEventListener('click', () => open('add-category'));
  deleteCategory.addEventListener('click', () => open('delete-category', currentCategory()));
  addModel.addEventListener('click', () => open('add-model'));
  tabs.addEventListener('click', event => {
    const tab = event.target.closest('[data-category]');
    if (!tab) return;
    if (tab.dataset.category !== activeCategory || !selectedId) selectCategory(tab.dataset.category);
    document.getElementById(`category-${tab.dataset.category}`)?.focus();
  });
  tabs.addEventListener('keydown', event => {
    if (!catalog.categories.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = catalog.categories.findIndex(category => category.id === activeCategory), count = catalog.categories.length;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    const id = catalog.categories[next].id;
    if (id !== activeCategory) selectCategory(id);
    document.getElementById(`category-${id}`)?.focus();
  });
  options.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-model]');
    if (remove) { open('delete-model', catalog.models.find(model => model.id === remove.dataset.removeModel)); return; }
    const button = event.target.closest('[data-spu]');
    if (button && button.dataset.spu !== selectedId) { selectModel(button.dataset.spu); options.querySelector(`[data-spu="${button.dataset.spu}"]`)?.focus(); }
  });
  fileInput.addEventListener('change', () => {
    droppedFile = fileInput.files[0] || null;
    fileLabel.textContent = droppedFile?.name || '请选择 GLB 文件，最大 256 MB';
    if (droppedFile && !nameInput.value.trim()) nameInput.value = droppedFile.name.replace(/\.glb$/i, '');
  });
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (!busy) status.textContent = '已保存到本地文件夹'; });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const oldLabel = submit.textContent;
    try {
      errorBox.hidden = true;
      const file = droppedFile || fileInput.files[0];
      if (action.kind === 'add-model') {
        if (!file || !/\.glb$/i.test(file.name)) throw new Error('请选择 .glb 模型文件。');
        if (file.size > 256 * 1024 * 1024) throw new Error('GLB 文件不能超过 256 MB。');
      }
      busy = true; submit.disabled = true; cancel.disabled = true; nameInput.disabled = true; fileInput.disabled = true;
      submit.textContent = '正在保存…'; status.textContent = '正在保存到本地…';
      let result;
      if (action.kind === 'add-category') result = await request('/api/categories', { method: 'POST', body: JSON.stringify({ label: nameInput.value }) });
      else if (action.kind === 'add-model') {
        const params = new URLSearchParams({ category: action.category, label: nameInput.value, filename: file.name });
        result = await request(`/api/models?${params}`, { method: 'POST', body: file });
      } else if (action.kind === 'delete-category') result = await request(`/api/categories/${action.target.id}`, { method: 'DELETE' });
      else result = await request(`/api/models/${action.target.id}`, { method: 'DELETE' });
      accept(result); dialog.close();
      if (result.categoryId) selectCategory(result.categoryId);
      else if (result.modelId) selectModel(result.modelId);
      else if (!catalog.models.some(model => model.id === selectedId)) {
        selectedId = null;
        selectCategory(catalog.categories.some(category => category.id === activeCategory) ? activeCategory : (catalog.categories.find(category => category.id === 'phone') || catalog.categories[0])?.id);
      } else render();
    } catch (error) {
      errorBox.textContent = error.message; errorBox.hidden = false; status.textContent = '未保存，请重试';
    } finally {
      busy = false; submit.disabled = false; cancel.disabled = false; nameInput.disabled = false; fileInput.disabled = false; submit.textContent = oldLabel;
    }
  });
  accept(await request('/api/catalog'));
  return {
    start(id) {
      const model = catalog.models.find(model => model.id === id);
      if (model) selectModel(model.id);
      else selectCategory((catalog.categories.find(category => category.id === 'phone') || catalog.categories[0])?.id);
    },
    openAddModel(file) { open('add-model', null, file); },
  };
}
