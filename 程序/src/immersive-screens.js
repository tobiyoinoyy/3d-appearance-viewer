const assets = '/immersive/flow/';
const icon = (name, className = '') => `<img class="${className}" src="${assets}${name}.svg" alt="" draggable="false">`;
const photo = (name, className = '') => `<img class="${className}" src="${assets}${name}.png" alt="" draggable="false">`;

const tabs = [
  ['photo', '实拍图', 'tab-photo'],
  ['xray', 'X-ray', 'tab-xray'],
  ['model', '3D外观', 'tab-model'],
];

export const demoScreens = `
  <section class="demo-list" aria-label="商品列表">
    ${photo('screen-list', 'demo-screenshot')}
    <button type="button" class="demo-hit demo-list-back" aria-label="返回工作台"></button>
    ${[1, 2, 3].map(id => `<button type="button" class="demo-hit demo-product-${id}" aria-label="查看第 ${id} 件商品详情" data-product></button>`).join('')}
  </section>
  <section class="demo-detail" aria-label="商品详情">
    ${photo('screen-detail', 'demo-screenshot')}
    <button type="button" class="demo-hit demo-detail-back" aria-label="返回商品列表"></button>
    <div class="demo-detail-actions" role="group" aria-label="查看商品外观">
      <button type="button" data-open-tab="photo" aria-label="查看实拍图"></button>
      <button type="button" data-open-tab="photo" aria-label="查看细节图"></button>
      <button type="button" data-open-tab="xray" aria-label="查看X-Ray透视"></button>
      <button type="button" data-open-tab="model" aria-label="放大，进入3D空间"></button>
    </div>
  </section>
  <div class="demo-status" aria-hidden="true"><span>9:41</span>${icon('status')}</div>
  <div class="demo-veil" aria-hidden="true"></div>
  <div class="demo-black" aria-hidden="true"></div>
  <div class="demo-renderer"></div>
  <div class="demo-model" role="button" tabindex="0" aria-label="旋转手机，点击或双指放大进入全屏" aria-expanded="false"></div>
  <section class="demo-media demo-photos" aria-label="实拍与细节" inert>
    ${photo('screen-photo', 'demo-screenshot')}
  </section>
  <section class="demo-media demo-xray" aria-label="X-Ray透视" inert>
    ${photo('screen-xray', 'demo-screenshot')}
    <button type="button" class="demo-hit demo-xray-link" aria-label="查看外观实拍图"></button>
  </section>
  <div class="demo-controls" inert>
    <div class="demo-tabs" role="group" aria-label="沉浸页切换">
      ${tabs.map(([key, label, image]) => `<button type="button" data-tab="${key}" aria-pressed="${key === 'model'}">
        <span class="demo-tab-icon">${icon(image)}</span><span>${label}</span>
      </button>`).join('')}
    </div>
    <button type="button" class="demo-collapse" aria-label="退出沉浸页，返回商品详情">
      <span class="demo-tab-icon">${icon('exit')}</span><span>退出</span>
    </button>
  </div>
  <div class="demo-info-scrim" aria-hidden="true"></div>
  <div class="demo-info">
    <button type="button" class="demo-disclaimer" aria-expanded="false" aria-controls="demo-about">
      <span>3D效果仅供参考，实际瑕疵以实拍图为准</span><span class="demo-info-icon" aria-hidden="true">${icon('info-ring')}${icon('info-mark')}</span>
    </button>
    <div class="demo-about-clip">
      <section id="demo-about" class="demo-about" role="dialog" aria-modal="true" aria-labelledby="demo-about-title" inert>
        <h2 id="demo-about-title">关于 3D 看外观</h2>
        <button type="button" class="demo-about-close" aria-label="关闭说明">${icon('close')}</button>
        <p>由本台实拍照片结合机型模型生成，支持旋转、放大查看外观。</p>
        <ul>
          <li>${icon('bullet')}颜色、光泽及局部明暗可能与实拍有差异。</li>
          <li>${icon('bullet')}划痕、磕碰可能不明显，<br>凹陷的深浅与形状无法准确还原。</li>
          <li>${icon('bullet')}镜头、边框可能出现接缝或重影，<br>不一定是实物瑕疵。</li>
        </ul>
        <p>实际瑕疵请以实拍图和细节图为准</p>
        <button type="button" class="demo-about-photo">查看实拍与细节${icon('arrow')}</button>
      </section>
    </div>
  </div>`;
