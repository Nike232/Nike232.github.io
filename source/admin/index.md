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
<h2>页面</h2>
<span class="count-pill" id="admin-count">0</span>
</div>
<div class="admin-actions">
<button class="solid-button" id="new-note" type="button"><i class="fa-solid fa-plus"></i><span>新页面</span></button>
<button class="ghost-button" id="duplicate-note" type="button"><i class="fa-regular fa-copy"></i><span>复制</span></button>
<button class="danger-button" id="delete-note" type="button"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>
</div>
<div class="category-strip" id="admin-category-strip" aria-label="分类"></div>
<div class="admin-list" id="admin-list" aria-live="polite"></div>
</aside>
<section class="editor-panel" aria-label="编辑器">
<div class="status-line">
<span class="status-text" id="status-text">本地工作区</span>
<div class="sync-actions">
<button class="ghost-button" id="pull-remote" type="button"><i class="fa-solid fa-rotate"></i><span>拉取笔记</span></button>
<button class="ghost-button" id="save-local" type="button"><i class="fa-regular fa-floppy-disk"></i><span>本地保存</span></button>
<button class="solid-button" id="publish-remote" type="button"><i class="fa-solid fa-cloud-arrow-up"></i><span>发布文章</span></button>
</div>
</div>
<form class="editor-form" id="editor-form">
<div class="field-grid">
<label class="field">
<span>标题</span>
<input id="field-title" name="title" autocomplete="off" placeholder="无标题">
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
<span>状态</span>
<select id="field-status" name="status">
<option value="published">published</option>
<option value="draft">draft</option>
<option value="archived">archived</option>
</select>
<small class="field-error"></small>
</label>
<label class="field field-wide">
<span>摘要</span>
<textarea id="field-summary" name="summary" rows="3" placeholder="给这篇笔记留一句简短说明"></textarea>
<small class="field-error"></small>
</label>
<div class="field field-wide editor-field">
<div class="editor-head">
<span>正文</span>
<div class="editor-controls">
<button class="ghost-button editor-toggle" id="toggle-vim" type="button" aria-pressed="false"><i class="fa-regular fa-keyboard"></i><span>Vim</span></button>
<span class="editor-stat" id="editor-mode">Markdown</span>
<span class="editor-stat" id="editor-position">Ln 1, Col 1</span>
<span class="editor-stat" id="editor-words">0 字</span>
</div>
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
<span class="state-pill state-saved" id="dirty-state">已保存</span>
</summary>
<p class="preview-summary" id="preview-summary"></p>
<div class="preview-body">
<h1 class="preview-title" id="preview-title"></h1>
<div class="note-rendered" id="preview-content"></div>
</div>
</details>
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
