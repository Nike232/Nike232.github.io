---
title: 管理笔记
date: 2026-07-05 17:10:00
comment: false
comments: false
---

<div class="note-tools notes-admin" data-notes-admin data-auth-state="checking">
<section class="admin-auth-panel" data-admin-auth-panel aria-label="管理权限">
<div class="admin-auth-card">
<span class="admin-auth-kicker">Owner workspace</span>
<h1>管理区已锁定</h1>
<p>公开访问只负责阅读。完成 Nike232 所有者身份校验后，才会打开编辑器和发布权限。</p>
<label class="admin-auth-field">
<span>发布服务地址</span>
<input id="auth-api-base" type="url" autocomplete="off" placeholder="https://tomfng-blog-admin.tomfng-space.workers.dev">
</label>
<div class="admin-auth-actions">
<button class="solid-button" id="auth-login" type="button"><i class="fa-solid fa-shield-halved"></i><span>验证并进入</span></button>
<button class="ghost-button" id="auth-clear" type="button"><i class="fa-regular fa-trash-can"></i><span>清除本机设置</span></button>
</div>
<p class="admin-auth-message" id="auth-message">未登录时不会加载笔记编辑器。</p>
</div>
</section>
<section class="admin-layout" data-admin-workspace hidden>
<aside class="admin-sidebar" aria-label="笔记列表">
<div class="rail-head">
<h2 id="sidebar-view-title">页面</h2>
<div class="sidebar-head-actions">
<div class="sidebar-view-tabs" role="tablist" aria-label="侧栏视图">
<button type="button" id="sidebar-pages" role="tab" aria-selected="true" aria-controls="admin-list" title="页面" aria-label="页面"><i class="fa-regular fa-file-lines"></i></button>
<button type="button" id="sidebar-outline" role="tab" aria-selected="false" aria-controls="admin-outline" title="大纲" aria-label="大纲"><i class="fa-solid fa-list-ul"></i></button>
</div>
<span class="count-pill" id="admin-count">0</span>
</div>
</div>
<div class="admin-actions" id="admin-page-actions">
<button class="solid-button" id="new-note" type="button"><i class="fa-solid fa-plus"></i><span>新页面</span></button>
<button class="ghost-button" id="duplicate-note" type="button"><i class="fa-regular fa-copy"></i><span>复制</span></button>
<button class="danger-button" id="delete-note" type="button"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>
<button class="ghost-button" id="admin-batch-toggle" type="button" aria-pressed="false" title="多选管理" aria-label="多选管理"><i class="fa-solid fa-check-double"></i><span>多选</span></button>
</div>
<label class="admin-note-search" id="admin-note-search-wrap">
<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
<input id="admin-note-search" type="search" autocomplete="off" placeholder="搜索页面" aria-label="搜索页面">
</label>
<div class="admin-recent-strip" id="admin-recent-strip" aria-label="最近打开" hidden></div>
<div class="admin-search-results" id="admin-search-results" hidden></div>
<div class="admin-filter-stack" id="admin-filter-stack">
<div class="category-strip" id="admin-status-strip" aria-label="状态"></div>
<label class="admin-sort-field" id="admin-sort-wrap">
<span>排序</span>
<select id="admin-sort" aria-label="排序方式">
<option value="updated">最近更新</option>
<option value="created">创建时间</option>
<option value="title">标题</option>
</select>
</label>
<div class="category-strip" id="admin-category-strip" aria-label="分类"></div>
<div class="tag-strip" id="admin-tag-strip" aria-label="标签"></div>
</div>
<div class="admin-batch-bar" id="admin-batch-bar" hidden>
<span class="admin-batch-count" id="admin-batch-count">已选 0</span>
<button class="ghost-button" id="admin-batch-category" type="button"><i class="fa-solid fa-folder"></i><span>改分类</span></button>
<button class="danger-button" id="admin-batch-delete" type="button"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>
<button class="ghost-button" id="admin-batch-cancel" type="button"><span>取消</span></button>
</div>
<div class="admin-list" id="admin-list" aria-live="polite"></div>
<div class="admin-outline" id="admin-outline" aria-live="polite" hidden></div>
</aside>
<section class="editor-panel" aria-label="编辑器">
<div class="status-line">
<span class="status-text" id="status-text">本地工作区</span>
<div class="sync-actions">
<button class="ghost-button" id="pull-remote" type="button"><i class="fa-solid fa-rotate"></i><span>同步</span></button>
<button class="ghost-button" id="save-draft-remote" type="button"><i class="fa-solid fa-cloud"></i><span>远端草稿</span></button>
<button class="ghost-button" id="save-local" type="button"><i class="fa-regular fa-floppy-disk"></i><span>本地</span></button>
<button class="solid-button" id="publish-remote" type="button"><i class="fa-solid fa-cloud-arrow-up"></i><span>发布</span></button>
<button class="ghost-button" id="export-workspace" type="button" title="导出工作区"><i class="fa-solid fa-file-export"></i></button>
<button class="ghost-button" id="import-workspace" type="button" title="导入工作区"><i class="fa-solid fa-file-import"></i></button>
<button class="ghost-button" id="note-history" type="button" title="版本历史"><i class="fa-solid fa-clock-rotate-left"></i></button>
<input id="import-workspace-file" type="file" accept="application/json,.json" hidden>
</div>
</div>
<form class="editor-form" id="editor-form">
<div class="field-grid">
<label class="field">
<span>标题</span>
<textarea id="field-title" name="title" rows="1" autocomplete="off" placeholder="无标题"></textarea>
<small class="field-error" id="error-title"></small>
</label>
<label class="field" hidden>
<span>Slug</span>
<input id="field-slug" name="slug" autocomplete="off">
<small class="field-error" id="error-slug"></small>
</label>
<label class="field">
<span>分类</span>
<input id="field-category" name="category" autocomplete="off" list="category-options" placeholder="未分类">
<datalist id="category-options"></datalist>
<small class="field-error"></small>
</label>
<label class="field">
<span>标签</span>
<input id="field-tags" name="tags" autocomplete="off" placeholder="writing, idea">
<small class="field-error"></small>
</label>
<label class="field">
<span>父页面</span>
<select id="field-parent" name="parent" aria-label="父页面">
<option value="">无（根页面）</option>
</select>
<small class="field-hint">用于轻量层级，子页面在列表中缩进</small>
</label>
<label class="field">
<span>状态</span>
<select id="field-status" name="status" aria-label="发布状态" disabled>
<option value="draft">草稿</option>
<option value="published">已发布</option>
</select>
<small class="field-hint" id="status-hint">由同步与发布自动决定</small>
</label>
<label class="field field-wide">
<span>摘要</span>
<textarea id="field-summary" name="summary" rows="3" placeholder="给这篇笔记留一句简短说明"></textarea>
<small class="field-error"></small>
</label>
<div class="field field-wide editor-field">
<div class="editor-head">
<div class="editor-head-title">
<span>正文</span>
<button class="editor-block-add" id="editor-block-toggle" type="button" aria-expanded="false" aria-controls="editor-block-menu" title="插入内容" aria-label="插入内容"><i class="fa-solid fa-plus"></i></button>
</div>
<div class="editor-controls">
<button class="ghost-button editor-toggle" id="toggle-vim" type="button" aria-pressed="false"><i class="fa-regular fa-keyboard"></i><span>Vim</span></button>
<button class="ghost-button editor-icon-button" id="toggle-source" type="button" aria-pressed="false" title="Markdown 源码" aria-label="切换 Markdown 源码"><i class="fa-solid fa-code"></i></button>
<button class="ghost-button editor-icon-button" id="editor-search" type="button" title="查找" aria-label="查找正文"><i class="fa-solid fa-magnifying-glass"></i></button>
<button class="ghost-button editor-icon-button" id="toggle-typewriter" type="button" aria-pressed="false" title="打字机滚动 (F10)" aria-label="切换打字机滚动"><i class="fa-solid fa-align-center"></i></button>
<button class="ghost-button editor-icon-button" id="toggle-focus" type="button" aria-pressed="false" title="沉浸写作 (F9)" aria-label="切换沉浸写作"><i class="fa-solid fa-expand"></i></button>
<span class="editor-stat" id="editor-mode">Markdown</span>
<span class="editor-stat" id="editor-position">Ln 1, Col 1</span>
<span class="editor-stat" id="editor-words">0 字</span>
</div>
</div>
<div class="editor-block-menu" id="editor-block-menu" role="menu" aria-label="插入内容" hidden>
<button type="button" role="menuitem" data-block-command="paragraph"><i class="fa-solid fa-paragraph"></i><span>正文</span></button>
<button type="button" role="menuitem" data-block-command="heading-1"><strong>H1</strong><span>标题 1</span></button>
<button type="button" role="menuitem" data-block-command="heading-2"><strong>H2</strong><span>标题 2</span></button>
<button type="button" role="menuitem" data-block-command="heading-3"><strong>H3</strong><span>标题 3</span></button>
<span class="editor-block-separator" aria-hidden="true"></span>
<button type="button" role="menuitem" data-block-command="bullet-list"><i class="fa-solid fa-list-ul"></i><span>无序列表</span></button>
<button type="button" role="menuitem" data-block-command="ordered-list"><i class="fa-solid fa-list-ol"></i><span>有序列表</span></button>
<button type="button" role="menuitem" data-block-command="task-list"><i class="fa-regular fa-square-check"></i><span>待办事项</span></button>
<button type="button" role="menuitem" data-block-command="quote"><i class="fa-solid fa-quote-left"></i><span>引用</span></button>
<span class="editor-block-separator" aria-hidden="true"></span>
<button type="button" role="menuitem" data-block-command="code-block"><i class="fa-solid fa-code"></i><span>代码块</span></button>
<button type="button" role="menuitem" data-block-command="mermaid"><i class="fa-solid fa-diagram-project"></i><span>流程图</span></button>
<button type="button" role="menuitem" data-block-command="math-block"><i class="fa-solid fa-square-root-variable"></i><span>公式块</span></button>
<button type="button" role="menuitem" data-block-command="table"><i class="fa-solid fa-table-cells"></i><span>表格</span></button>
<button type="button" role="menuitem" data-block-command="footnote"><i class="fa-solid fa-superscript"></i><span>脚注</span></button>
<button type="button" role="menuitem" data-block-command="horizontal-rule"><i class="fa-solid fa-minus"></i><span>分割线</span></button>
<button type="button" role="menuitem" data-block-command="image"><i class="fa-regular fa-image"></i><span>图片</span></button>
</div>
<div class="editor-slash-menu" id="editor-slash-menu" role="listbox" aria-label="插入内容" hidden></div>
<input id="editor-image-picker" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
<div class="editor-selection-toolbar" id="editor-selection-toolbar" role="toolbar" aria-label="文本格式" hidden>
<button type="button" data-editor-command="bold" title="加粗" aria-label="加粗"><strong>B</strong></button>
<button type="button" data-editor-command="italic" title="斜体" aria-label="斜体"><em>I</em></button>
<button type="button" data-editor-command="strike" title="删除线" aria-label="删除线"><s>S</s></button>
<span aria-hidden="true"></span>
<button type="button" data-editor-command="code" title="行内代码" aria-label="行内代码"><i class="fa-solid fa-code"></i></button>
<button type="button" data-editor-command="math" title="行内公式" aria-label="行内公式"><i class="fa-solid fa-square-root-variable"></i></button>
<button type="button" data-editor-command="link" title="链接" aria-label="链接"><i class="fa-solid fa-link"></i></button>
</div>
<div class="editor-link-popover" id="editor-link-popover" role="dialog" aria-label="编辑链接" hidden>
<label class="editor-link-input editor-link-label">
<i class="fa-solid fa-font" data-resource-label-icon aria-hidden="true"></i>
<input id="editor-link-label" type="text" maxlength="240" autocomplete="off" placeholder="链接文字" aria-label="链接文字">
</label>
<label class="editor-link-input editor-link-url">
<i class="fa-solid fa-link" data-resource-url-icon aria-hidden="true"></i>
<input id="editor-link-url" type="text" inputmode="url" maxlength="2048" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="粘贴或输入链接" aria-label="链接地址" aria-describedby="editor-link-error">
</label>
<div class="editor-link-actions">
<button type="button" data-link-action="open" title="打开链接" aria-label="打开链接"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
<button type="button" data-link-action="remove" title="移除链接" aria-label="移除链接"><i class="fa-solid fa-link-slash"></i></button>
<button type="button" data-link-action="apply" class="is-primary" title="应用链接" aria-label="应用链接"><i class="fa-solid fa-check"></i></button>
</div>
<small class="editor-link-error" id="editor-link-error" role="alert" hidden></small>
</div>
<div class="editor-table-toolbar" id="editor-table-toolbar" role="toolbar" aria-label="表格操作" hidden>
<button type="button" data-table-action="add-row" title="在下方插入行" aria-label="在下方插入行"><span class="table-action-symbol"><i class="fa-solid fa-table-rows"></i><i class="fa-solid fa-plus"></i></span></button>
<button type="button" data-table-action="delete-row" title="删除当前行" aria-label="删除当前行"><span class="table-action-symbol"><i class="fa-solid fa-table-rows"></i><i class="fa-solid fa-minus"></i></span></button>
<span aria-hidden="true"></span>
<button type="button" data-table-action="add-column" title="在右侧插入列" aria-label="在右侧插入列"><span class="table-action-symbol"><i class="fa-solid fa-table-columns"></i><i class="fa-solid fa-plus"></i></span></button>
<button type="button" data-table-action="delete-column" title="删除当前列" aria-label="删除当前列"><span class="table-action-symbol"><i class="fa-solid fa-table-columns"></i><i class="fa-solid fa-minus"></i></span></button>
<span aria-hidden="true"></span>
<button type="button" data-table-action="align" data-table-value="left" aria-pressed="false" title="左对齐" aria-label="左对齐"><i class="fa-solid fa-align-left"></i></button>
<button type="button" data-table-action="align" data-table-value="center" aria-pressed="false" title="居中对齐" aria-label="居中对齐"><i class="fa-solid fa-align-center"></i></button>
<button type="button" data-table-action="align" data-table-value="right" aria-pressed="false" title="右对齐" aria-label="右对齐"><i class="fa-solid fa-align-right"></i></button>
</div>
<textarea class="editor-textarea" id="field-content" name="content" spellcheck="false" placeholder="开始写..."></textarea>
<small class="field-error"></small>
</div>
</div>
</form>
</section>
<details class="preview-panel" aria-label="预览" data-admin-workspace hidden>
<summary class="preview-head">
<h2>预览</h2>
<span class="state-pill state-saved" id="dirty-state">已保存到本机</span>
</summary>
<p class="preview-summary" id="preview-summary"></p>
<div class="preview-body">
<h1 class="preview-title" id="preview-title"></h1>
<div class="note-rendered" id="preview-content"></div>
</div>
</details>
<dialog class="admin-history-dialog" id="admin-history-dialog">
<div class="admin-history-card">
<div class="admin-history-head">
<strong>版本历史</strong>
<button type="button" class="ghost-button" id="admin-history-close">关闭</button>
</div>
<p class="admin-history-path" id="admin-history-path"></p>
<div class="admin-history-list" id="admin-history-list"></div>
</div>
</dialog>
<details class="connection-panel" data-admin-workspace hidden>
<summary>发布服务</summary>
<div class="token-grid">
<label>
<span>API 地址</span>
<input id="config-api-base" type="url" autocomplete="off" placeholder="https://tomfng-blog-admin.tomfng-space.workers.dev">
</label>
<button class="ghost-button" id="save-config" type="button"><i class="fa-regular fa-floppy-disk"></i><span>保存</span></button>
<button class="ghost-button" id="logout-admin" type="button"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>退出登录</span></button>
</div>
</details>
</section>
</div>
