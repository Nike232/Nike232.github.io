import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const SESSION_COOKIE = "tomfng_admin_session";
const STATE_COOKIE = "tomfng_oauth_state";
const SESSION_TTL = 60 * 60 * 24 * 14;
const STATE_TTL = 60 * 10;
const REVISION_MARKER = "tomfng-admin-revision";

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return preflight(request, env);

      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true }, 200, request, env);
      if (url.pathname === "/api/session" && request.method === "GET") return await session(request, env);
      if ((url.pathname === "/api/owner/start" || url.pathname === "/api/auth/github") && request.method === "GET") {
        return await startGithubAuth(request, env);
      }
      if ((url.pathname === "/api/owner/callback" || url.pathname === "/api/auth/callback") && request.method === "GET") {
        return await finishGithubAuth(request, env);
      }
      if (url.pathname === "/api/logout" && request.method === "POST") return await logout(request, env);
      if ((url.pathname === "/api/posts" || url.pathname === "/api/notes-data") && request.method === "GET") {
        return await postsData(request, env);
      }
      if (url.pathname === "/api/posts" && request.method === "DELETE") return await deletePost(request, env);
      if (url.pathname === "/api/publish" && request.method === "POST") return await publish(request, env);
      if (url.pathname === "/api/publish-status" && request.method === "GET") return await publishStatus(request, env);

      return json({ error: "Not found" }, 404, request, env);
    } catch (error) {
      const status = error.status || 500;
      return json({ error: error.message || "Internal error" }, status, request, env);
    }
  }
};

async function session(request, env) {
  const payload = await readSession(request, env);
  return json({
    authenticated: Boolean(payload),
    login: payload?.login || null,
    expiresAt: payload?.exp || null
  }, 200, request, env);
}

async function startGithubAuth(request, env) {
  requireEnv(env, ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"]);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), env);
  const sessionMode = url.searchParams.get("session") === "token" ? "token" : "cookie";
  const state = randomToken();
  const stateCookie = await signPayload({ state, returnTo, sessionMode, exp: now() + STATE_TTL }, env.SESSION_SECRET);
  const redirectUri = new URL("/api/owner/callback", url.origin).href;
  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set("redirect_uri", redirectUri);
  githubUrl.searchParams.set("scope", "read:user");
  githubUrl.searchParams.set("state", state);

  return redirect(githubUrl.href, {
    "Set-Cookie": serializeCookie(STATE_COOKIE, stateCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: STATE_TTL
    })
  });
}

async function finishGithubAuth(request, env) {
  requireEnv(env, ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"]);
  const url = new URL(request.url);
  const stateValue = getCookie(request, STATE_COOKIE);
  const statePayload = stateValue ? await verifySignedPayload(stateValue, env.SESSION_SECRET) : null;
  const returnTo = safeReturnTo(statePayload?.returnTo, env);
  const clearState = serializeCookie(STATE_COOKIE, "", { path: "/", maxAge: 0 });

  try {
    if (!statePayload || statePayload.exp < now() || statePayload.state !== url.searchParams.get("state")) {
      throw new HttpError(401, "登录状态已过期，请重新登录");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, "GitHub 没有返回授权码");

    const tokenPayload = await exchangeGithubCode(code, new URL("/api/owner/callback", url.origin).href, env);
    const user = await githubUser(tokenPayload.access_token);
    const adminLogin = env.ADMIN_LOGIN || "Nike232";
    if (String(user.login || "").toLowerCase() !== adminLogin.toLowerCase()) {
      throw new HttpError(403, `当前账号是 ${user.login || "未知账号"}，不是 ${adminLogin}`);
    }

    const sessionToken = await signPayload({ login: user.login, iat: now(), exp: now() + SESSION_TTL }, env.SESSION_SECRET);
    const successUrl = statePayload.sessionMode === "token" ? withSessionFragment(returnTo, sessionToken) : returnTo;
    return redirect(successUrl, {
      "Set-Cookie": [
        clearState,
        serializeCookie(SESSION_COOKIE, sessionToken, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
          path: "/",
          maxAge: SESSION_TTL
        })
      ]
    });
  } catch (error) {
    const failUrl = new URL(returnTo);
    failUrl.searchParams.set("admin_error", error.message || "登录失败");
    return redirect(failUrl.href, { "Set-Cookie": clearState });
  }
}

async function logout(request, env) {
  requireAllowedOrigin(request, env);
  return json({ ok: true }, 200, request, env, {
    "Set-Cookie": serializeCookie(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: "/",
      maxAge: 0
    })
  });
}

async function postsData(request, env) {
  await requireAdmin(request, env);
  const directory = normalizePostDirectory(env.POST_DIR || "source/_posts");
  let entries = [];
  try {
    entries = await githubGetContent(directory, env);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!Array.isArray(entries)) throw new HttpError(500, "文章目录不是有效的 GitHub 目录");

  const files = entries.filter((entry) => entry.type === "file" && /\.md$/i.test(entry.name || ""));
  const notes = await mapLimit(files, 6, async (entry) => {
    const file = await githubGetContent(entry.path, env);
    return parseHexoPost(decodeBase64(file.content || ""), entry.path, file.sha, env);
  });
  notes.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return json({
    path: directory,
    data: {
      version: 2,
      updatedAt: new Date().toISOString(),
      notes
    }
  }, 200, request, env);
}

async function publish(request, env) {
  await requireAdmin(request, env);
  requireAllowedOrigin(request, env);

  const body = await request.json().catch(() => null);
  const note = normalizeNote(body?.note || {});
  if (!note.title.trim()) throw new HttpError(400, "需要标题");

  try {
    await githubGetContent("_config.yml", env);
  } catch {
    throw new HttpError(400, `目标分支 ${githubBranch(env)} 缺少 _config.yml，请把 Worker 指向 Hexo 源码分支`);
  }

  const target = await resolvePostTarget(note, env);
  const revision = randomRevision();
  const content = buildHexoPost(note, env, revision);

  const result = await githubPutContent(
    target.path,
    content,
    `${target.sha ? "Update" : "Publish"} post: ${note.title}`,
    target.sha,
    env
  );
  return json({
    ok: true,
    path: target.path,
    slug: target.slug,
    sha: result.content?.sha || null,
    revision,
    publicUrl: publicPostUrl(note, env, target.slug),
    commit: result.commit?.sha || null
  }, 200, request, env);
}

async function deletePost(request, env) {
  await requireAdmin(request, env);
  requireAllowedOrigin(request, env);

  const body = await request.json().catch(() => null);
  const path = safePostPath(body?.path, env);
  let file = null;
  try {
    file = await githubGetContent(path, env);
  } catch (error) {
    if (error.status === 404) return json({ ok: true, path, alreadyDeleted: true }, 200, request, env);
    throw error;
  }
  const result = await githubDeleteContent(path, `Delete post: ${body?.title || postSlugFromPath(path)}`, file.sha, env);
  return json({ ok: true, path, commit: result.commit?.sha || null }, 200, request, env);
}

async function publishStatus(request, env) {
  await requireAdmin(request, env);
  requireAllowedOrigin(request, env);

  const url = new URL(request.url);
  const publicUrl = safePublicUrl(url.searchParams.get("url"), env);
  const title = String(url.searchParams.get("title") || "").trim();
  const revision = String(url.searchParams.get("revision") || "").trim();
  const checkUrl = new URL(publicUrl);
  checkUrl.searchParams.set("_publish_check", Date.now().toString(36));

  const response = await fetch(checkUrl.href, {
    headers: {
      "Cache-Control": "no-cache",
      "User-Agent": "tomfng-blog-admin-worker"
    },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  const text = response.ok ? await response.text() : "";
  return json({
    ready: response.ok && (revision
      ? text.includes(`<!-- ${REVISION_MARKER}:${revision} -->`)
      : (!title || text.includes(title))),
    status: response.status,
    url: publicUrl
  }, 200, request, env);
}

async function requireAdmin(request, env) {
  requireEnv(env, ["GITHUB_TOKEN", "SESSION_SECRET"]);
  const payload = await readSession(request, env);
  const adminLogin = env.ADMIN_LOGIN || "Nike232";
  if (!payload || payload.login?.toLowerCase() !== adminLogin.toLowerCase()) {
    throw new HttpError(401, "未登录或登录已过期");
  }
  return payload;
}

async function readSession(request, env) {
  const raw = bearerToken(request) || getCookie(request, SESSION_COOKIE);
  if (!raw || !env.SESSION_SECRET) return null;
  const payload = await verifySignedPayload(raw, env.SESSION_SECRET);
  if (!payload || payload.exp < now()) return null;
  return payload;
}

async function exchangeGithubCode(code, redirectUri, env) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new HttpError(401, payload.error_description || payload.error || "GitHub 授权失败");
  }
  return payload;
}

async function githubUser(accessToken) {
  return githubFetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function githubGetContent(path, env) {
  return githubFetch(`${githubContentsUrl(path, env)}?ref=${encodeURIComponent(githubBranch(env))}`, {}, env);
}

async function githubPutContent(path, content, message, sha, env) {
  const body = {
    message,
    content: encodeBase64(content),
    branch: githubBranch(env)
  };
  if (sha) body.sha = sha;
  return githubFetch(githubContentsUrl(path, env), {
    method: "PUT",
    body: JSON.stringify(body)
  }, env);
}

async function githubDeleteContent(path, message, sha, env) {
  return githubFetch(githubContentsUrl(path, env), {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha,
      branch: githubBranch(env)
    })
  }, env);
}

async function githubFetch(url, options = {}, env = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "tomfng-blog-admin-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text.slice(0, 240) || response.statusText };
  }
  if (!response.ok) {
    throw new HttpError(response.status, payload.message || response.statusText);
  }
  return payload;
}

function githubContentsUrl(path, env) {
  const owner = encodeURIComponent(env.GITHUB_OWNER || "Nike232");
  const repo = encodeURIComponent(env.GITHUB_REPO || "Nike232.github.io");
  const remotePath = String(path || "").split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${remotePath}`;
}

function githubBranch(env) {
  return env.GITHUB_BRANCH || "main";
}

function postFilePath(note, env, slugOverride = "") {
  const dir = normalizePostDirectory(env.POST_DIR || "source/_posts");
  const slug = normalizePostSlug(slugOverride || note.slug || makeSlug(note.title), note.title);
  return dir ? `${dir}/${slug}.md` : `${slug}.md`;
}

async function resolvePostTarget(note, env) {
  if (note.remotePath) {
    const path = safePostPath(note.remotePath, env);
    try {
      const file = await githubGetContent(path, env);
      if (note.remoteSha && file.sha !== note.remoteSha) {
        throw new HttpError(409, "远程文章已被修改，请先拉取后再发布");
      }
      return { path, slug: postSlugFromPath(path), sha: file.sha };
    } catch (error) {
      if (error.status !== 404) throw error;
      return { path, slug: postSlugFromPath(path), sha: null };
    }
  }

  const baseSlug = normalizePostSlug(note.slug || makeSlug(note.title), note.title);
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const path = postFilePath(note, env, slug);
    try {
      const file = await githubGetContent(path, env);
      const existing = parseHexoPost(decodeBase64(file.content || ""), path, file.sha, env);
      if (existing.id === note.id) return { path, slug, sha: file.sha };
    } catch (error) {
      if (error.status === 404) return { path, slug, sha: null };
      throw error;
    }
  }
  throw new HttpError(409, "同名文章过多，无法生成唯一发布地址");
}

function safePostPath(value, env) {
  const directory = normalizePostDirectory(env.POST_DIR || "source/_posts");
  const path = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.includes("..") || !path.startsWith(`${directory}/`) || !/\.md$/i.test(path)) {
    throw new HttpError(400, "无效的文章路径");
  }
  return path;
}

function postSlugFromPath(path) {
  const filename = String(path || "").split("/").pop() || "";
  return filename.replace(/\.md$/i, "");
}

function publicPostUrl(note, env, slugOverride = "") {
  const [datePart] = formatHexoDate(note.createdAt, env).split(" ");
  const [year, month, day] = datePart.split("-");
  const slug = normalizePostSlug(slugOverride || note.slug || makeSlug(note.title), note.title);
  return `${siteBaseUrl(env)}/${year}/${month}/${day}/${encodeURIComponent(slug)}/`;
}

function siteBaseUrl(env) {
  return String(env.SITE_URL || "http://tomfng.space").trim().replace(/\/+$/g, "") || "http://tomfng.space";
}

function buildHexoPost(note, env, revision = randomRevision()) {
  const category = normalizeCategory(note.category);
  const tags = normalizeTags(note.tags);
  const frontMatter = {
    ...(note.frontMatter && typeof note.frontMatter === "object" ? note.frontMatter : {}),
    title: note.title || "无标题",
    date: formatHexoDate(note.createdAt, env),
    updated: formatHexoDate(note.updatedAt, env),
    admin_id: note.id,
    admin_revision: revision,
    categories: [category]
  };
  if (tags.length) frontMatter.tags = tags;
  else delete frontMatter.tags;
  if (note.summary) frontMatter.description = note.summary;
  else delete frontMatter.description;
  const body = postBody(note);
  const marker = `<!-- ${REVISION_MARKER}:${revision} -->`;
  const yaml = stringifyYaml(frontMatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body ? `${body}\n\n` : ""}${marker}\n`;
}

function normalizeNote(note = {}) {
  const current = new Date().toISOString();
  const title = String(note.title || "无标题").trim();
  return {
    id: String(note.id || `note-${Date.now().toString(36)}`),
    title,
    slug: normalizePostSlug(note.slug || makeSlug(title), title),
    category: normalizeCategory(note.category),
    summary: String(note.summary || "").trim(),
    tags: normalizeTags(note.tags),
    status: "published",
    content: String(note.content || ""),
    createdAt: note.createdAt || current,
    updatedAt: note.updatedAt || current,
    remotePath: String(note.remotePath || ""),
    remoteSha: String(note.remoteSha || ""),
    frontMatter: note.frontMatter && typeof note.frontMatter === "object" ? note.frontMatter : {}
  };
}

function parseHexoPost(source, path, sha, env = {}) {
  const parsed = splitFrontMatter(source);
  const attributes = parsed.attributes;
  const slug = postSlugFromPath(path);
  const title = String(attributes.title || slug || "无标题").trim();
  const categories = Array.isArray(attributes.categories) ? attributes.categories : [attributes.categories];
  const body = stripRevisionMarker(parsed.body).trim();
  return {
    id: String(attributes.admin_id || `post:${path}`),
    title,
    slug,
    category: normalizeCategory(categories.find(Boolean)),
    summary: String(attributes.description || "").trim(),
    tags: normalizeTags(attributes.tags),
    status: "published",
    content: body,
    createdAt: hexoDateValue(attributes.date, env),
    updatedAt: hexoDateValue(attributes.updated || attributes.date, env),
    remotePath: path,
    remoteSha: String(sha || ""),
    localDirty: false,
    parseError: parsed.error || "",
    frontMatter: attributes
  };
}

function splitFrontMatter(source) {
  const markdown = String(source || "").replace(/\r\n/g, "\n");
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(markdown);
  if (!match) return { attributes: {}, body: markdown, error: "缺少 Front Matter" };
  try {
    const attributes = parseYaml(match[1]) || {};
    return { attributes: typeof attributes === "object" ? attributes : {}, body: markdown.slice(match[0].length), error: "" };
  } catch (error) {
    return { attributes: {}, body: markdown.slice(match[0].length), error: error.message || "Front Matter 解析失败" };
  }
}

function stripRevisionMarker(markdown) {
  return String(markdown || "").replace(new RegExp(`\\n?<!--\\s*${REVISION_MARKER}:[^>]+-->\\s*$`), "");
}

function hexoDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value || "").trim();
  if (!text) return new Date().toISOString();
  const normalized = text.replace(" ", "T");
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function normalizeCategory(category) {
  return String(category || "未分类").trim() || "未分类";
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function makeSlug(value = "") {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || `post-${Date.now().toString(36)}`;
}

function normalizePostSlug(slug, title) {
  const cleaned = String(slug || "")
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[\\/#?%*:|"<>]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || makeSlug(title || "post");
}

function normalizePostDirectory(path) {
  return String(path || "source/_posts").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "source/_posts";
}

function postBody(note) {
  return stripFrontMatter(contentWithoutTitleHeading(note)).trim();
}

function contentWithoutTitleHeading(note) {
  const title = String(note.title || "").trim();
  if (!title) return note.content || "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(note.content || "").replace(new RegExp(`^#\\s+${escaped}\\s*(\\n|$)`, "i"), "").trimStart();
}

function stripFrontMatter(markdown) {
  return String(markdown || "").replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, "");
}

function formatHexoDate(value, env) {
  const date = new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.TIME_ZONE || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(safeDate).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function preflight(request, env) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

function json(payload, status, request, env, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(request, env)
  });
  appendHeaders(headers, extraHeaders);
  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}

function redirect(location, headers = {}) {
  const responseHeaders = new Headers({ Location: location });
  appendHeaders(responseHeaders, headers);
  return new Response(null, { status: 302, headers: responseHeaders });
}

function appendHeaders(headers, values) {
  Object.entries(values || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value !== undefined) {
      headers.append(key, value);
    }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  if (!allowedOrigins(env).includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
}

function requireAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).includes(origin)) throw new HttpError(403, "Origin not allowed");
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "https://tomfng.space,http://tomfng.space,http://localhost:4001,http://[::1]:4001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function safeReturnTo(value, env) {
  const fallback = `${allowedOrigins(env)[0] || "https://tomfng.space"}/admin/`;
  try {
    const url = new URL(value || fallback);
    return allowedOrigins(env).includes(url.origin) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function safePublicUrl(value, env) {
  try {
    const url = new URL(value || siteBaseUrl(env));
    if (url.origin !== new URL(siteBaseUrl(env)).origin) throw new Error("bad origin");
    return url.href;
  } catch {
    throw new HttpError(400, "只能检查本站发布地址");
  }
}

function withSessionFragment(returnTo, sessionToken) {
  const url = new URL(returnTo);
  const hash = new URLSearchParams(String(url.hash || "").replace(/^#/, ""));
  hash.set("admin_session", sessionToken);
  url.hash = hash.toString();
  return url.href;
}

async function signPayload(payload, secret) {
  const body = base64UrlEncodeString(JSON.stringify(payload));
  return `${body}.${await hmac(body, secret)}`;
}

async function verifySignedPayload(value, secret) {
  const [body, signature] = String(value || "").split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (signature !== expected) return null;
  try {
    return JSON.parse(base64UrlDecodeString(body));
  } catch {
    return null;
  }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

function randomRevision() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return randomToken().slice(0, 24);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function base64UrlEncodeString(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  return encodeBase64Bytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeString(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(bytesFromBinary(atob(padded)));
}

function encodeBase64(value) {
  return encodeBase64Bytes(new TextEncoder().encode(value));
}

function decodeBase64(value) {
  return new TextDecoder().decode(bytesFromBinary(atob(String(value || "").replace(/\s/g, ""))));
}

function encodeBase64Bytes(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function bytesFromBinary(binary) {
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  return cookies.split(";").map((part) => part.trim()).reduce((found, part) => {
    if (found) return found;
    const [key, ...rest] = part.split("=");
    return key === name ? decodeURIComponent(rest.join("=")) : "";
  }, "");
}

function bearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new HttpError(500, `Worker 缺少环境变量：${missing.join(", ")}`);
}

function now() {
  return Math.floor(Date.now() / 1000);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const __test = {
  buildHexoPost,
  parseHexoPost,
  postBody,
  postSlugFromPath,
  publicPostUrl,
  resolvePostTarget,
  safePostPath,
  splitFrontMatter,
  stripRevisionMarker
};
