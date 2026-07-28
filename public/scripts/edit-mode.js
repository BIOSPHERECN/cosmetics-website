(function() {
  if (!window.location.search.includes('edit=true')) return;

  const SITE_URL = 'https://cosmetics-website-5t8.pages.dev';
  const ADMIN_URL = SITE_URL + '/bohuiadmin/dashboard';

  const style = document.createElement('style');
  style.textContent = `
    [data-i18n] { cursor: pointer; transition: outline 0.2s; }
    [data-i18n]:hover { outline: 2px dashed #16a34a; outline-offset: 2px; border-radius: 2px; }
    [data-i18n].editing { outline: 2px solid #16a34a !important; background: #f0fdf4; border-radius: 4px; padding: 2px 4px; }
    #edit-toolbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999; background: white; border-top: 2px solid #16a34a; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 -4px 20px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; transform: translateY(100%); transition: transform 0.3s; }
    #edit-toolbar.show { transform: translateY(0); }
    #edit-toolbar .info { font-size: 13px; color: #374151; }
    #edit-toolbar .info strong { color: #16a34a; }
    #edit-toolbar .actions { display: flex; gap: 8px; }
    #edit-toolbar button { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s; }
    #edit-toolbar .btn-save { background: #16a34a; color: white; }
    #edit-toolbar .btn-save:hover { background: #15803d; }
    #edit-toolbar .btn-cancel { background: #f3f4f6; color: #374151; }
    #edit-toolbar .btn-cancel:hover { background: #e5e7eb; }
    #edit-toolbar .btn-exit { background: none; border: 1px solid #e5e7eb; color: #6b7280; }
    #edit-toolbar .btn-exit:hover { background: #f9fafb; }
    #edit-toolbar .status { font-size: 12px; color: #16a34a; margin-left: 12px; }
  `;
  document.head.appendChild(style);

  const changedElements = new Map();

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.addEventListener('click', function(e) {
      if (document.activeElement === this) return;
      e.stopPropagation();
      this.contentEditable = 'true';
      this.classList.add('editing');
      this.focus();
      toolbar.classList.add('show');
    });
    el.addEventListener('blur', function() {
      const key = this.dataset.i18n;
      const oldVal = this.dataset.original || this.textContent.trim();
      const newVal = this.textContent.trim();
      if (oldVal !== newVal) {
        changedElements.set(key, newVal);
        this.dataset.original = newVal;
      }
      this.contentEditable = 'false';
      this.classList.remove('editing');
    });
    el.dataset.original = el.textContent.trim();
  });

  const toolbar = document.createElement('div');
  toolbar.id = 'edit-toolbar';
  toolbar.innerHTML = `
    <div class="info">✎ <strong>可视化编辑模式</strong> — 点击任意蓝色虚线文字进行修改</div>
    <div class="actions">
      <span class="status" id="editStatus"></span>
      <button class="btn-save" onclick="window.__saveEdits()">保存修改</button>
      <button class="btn-exit" onclick="window.__exitEdit()">退出编辑</button>
    </div>
  `;
  document.body.appendChild(toolbar);

  setTimeout(() => toolbar.classList.add('show'), 300);

  window.__saveEdits = async function() {
    if (changedElements.size === 0) {
      document.getElementById('editStatus').textContent = '没有修改';
      return;
    }
    document.getElementById('editStatus').textContent = '保存中...';
    const btn = toolbar.querySelector('.btn-save');
    btn.disabled = true;

    const currentPath = window.location.pathname;
    const locale = currentPath.split('/')[1] || 'en';

    const updates = {};
    for (const [key, val] of changedElements) {
      updates[key] = val;
    }

    try {
      const res = await fetch(SITE_URL + '/api/bohuiadmin/content?action=edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ locale, updates }),
      });
      if (!res.ok) throw new Error('保存失败');
      document.getElementById('editStatus').textContent = '✓ 已保存！页面将自动更新';
      changedElements.clear();
    } catch (e) {
      document.getElementById('editStatus').textContent = '✗ 错误：' + e.message;
    }
    btn.disabled = false;
  };

  window.__exitEdit = function() {
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.location.href = url.toString();
  };
})();
