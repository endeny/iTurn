(() => {
  // src/helpers/common.ts
  function str(value, fallback = "") {
    if (value === null || value === undefined)
      return fallback;
    return String(value);
  }
  function num(value) {
    if (typeof value === "string") {
      const compact = value.replace(/,/g, "").trim();
      const matched = compact.match(/(\d+(?:\.\d+)?)/);
      if (matched) {
        const base = Number(matched[1]);
        if (Number.isFinite(base)) {
          if (compact.includes("亿"))
            return Math.round(base * 1e8);
          if (compact.includes("万"))
            return Math.round(base * 1e4);
          return Math.round(base);
        }
      }
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  function enumSetting(ctx, key, fallback) {
    const value = ctx.source.settings[key];
    return typeof value === "string" ? value : fallback;
  }
  function joinUrl(base, path) {
    if (/^https?:\/\//i.test(path))
      return path;
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
  function withQuery(url, query) {
    const u = new URL(url);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "")
        continue;
      u.searchParams.set(key, String(value));
    }
    return u.toString();
  }
  async function fetchText(url, init) {
    console.log(`[FETCH] ${url}`, init);
    const res = await fetch(url, init);
    console.log(`[RESPONSE] ${url} - ${res.status}`, res);
    if (!res.ok)
      throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
  }
  async function fetchJson(url, init) {
    const text = await fetchText(url, init);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON parse failed: ${url}
${text.slice(0, 240)}`);
    }
  }
  async function postJson(url, body, init) {
    return fetchJson(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...init?.headers || {} },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init
    });
  }
  function idFrom(input, fallback = "") {
    const raw = str(input, fallback);
    if (!raw)
      return fallback;
    try {
      const u = new URL(raw);
      return u.searchParams.get("book_id") || u.searchParams.get("bookId") || u.searchParams.get("id") || u.searchParams.get("chapterId") || u.pathname.split("/").filter(Boolean).pop() || raw;
    } catch {}
    const m = raw.match(/(?:book_id|bookId|id|chapterId|item_id|itemId)=([^&#]+)/);
    if (m)
      return decodeURIComponent(m[1]);
    return raw.replace(/^data:.*?base64,/, "").split(",")[0].slice(0, 80);
  }
  function stripHtml(input) {
    return str(input).replace(/<br\s*\/?\s*>/gi, `
`).replace(/<\/p\s*>/gi, `
`).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
  }
  function htmlToParagraphs(html) {
    const normalized = html.replace(/<img\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi, `
[[IMG:$2]]
`).replace(/<p\b[^>]*>/gi, `
`).replace(/<\/p>/gi, `
`).replace(/<br\s*\/?\s*>/gi, `
`);
    return normalized.split(/\n+/).map((line) => {
      const t = line.trim();
      if (!t)
        return null;
      const img = t.match(/^\[\[IMG:(.+)\]\]$/);
      if (img)
        return { type: "image", url: img[1] };
      return { type: "paragraph", text: stripHtml(t) };
    }).filter(Boolean);
  }
  function makeContent(ctx, title, raw) {
    const format = enumSetting(ctx, "contentFormat", "blocks");
    if (format === "html")
      return { title, format: "html", content: raw };
    if (format === "text")
      return { title, format: "text", content: stripHtml(raw) };
    return { title, format: "blocks", content: htmlToParagraphs(raw) };
  }
  function mapKind(...values) {
    const result = values.flatMap((v) => {
      if (Array.isArray(v))
        return v.map((x) => str(x)).filter(Boolean);
      return str(v).split(/[,，\n/|]+/).map((x) => x.trim()).filter(Boolean);
    });
    return result.length ? [...new Set(result)] : undefined;
  }
  function bookFromItem(sourceId, item, options) {
    const url = str(options.bookUrl || options.id || item?.bookUrl || item?.url || item?.book_id || item?.bookId || item?.id);
    return {
      id: idFrom(options.id || item?.book_id || item?.bookId || item?.id || url),
      sourceId,
      name: stripHtml(options.name ?? item?.name ?? item?.book_name ?? item?.bookName ?? item?.title ?? item?.articlename ?? "未命名"),
      author: stripHtml(options.author ?? item?.author ?? item?.original_author ?? "") || undefined,
      bookUrl: url,
      cover: str(options.cover ?? item?.src ?? item?.cover ?? item?.thumb_url ?? item?.thumbUri ?? item?.image_link ?? item?.imgUrl) || undefined,
      intro: stripHtml(options.intro ?? item?.intro ?? item?.abstract ?? "") || undefined,
      kind: mapKind(...options.kind || [item?.kind, item?.mmfl, item?.category, item?.tags, item?.ptags, item?.keywords]),
      wordCount: num(options.wordCount ?? item?.wordCount ?? item?.word_number ?? item?.words_num ?? item?.words),
      lastChapterName: stripHtml(options.lastChapterName ?? item?.last_chapter_title ?? item?.lastchapter ?? "") || undefined,
      status: options.status,
      extra: options.extra ?? item
    };
  }
  function chapterFromItem(sourceId, item, index, options) {
    const chapterUrl = str(options.chapterUrl ?? item?.chapterUrl ?? item?.url ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapterid);
    return {
      id: idFrom(options.id ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapter_id ?? item?.chapterid ?? chapterUrl),
      sourceId,
      name: stripHtml(options.name ?? item?.title ?? item?.name ?? item?.chaptername ?? `第 ${index + 1} 章`),
      chapterUrl,
      index,
      updateTime: num(options.updateTime ?? item?.updateTime ?? item?.first_pass_time ?? item?.firstPassTime),
      wordCount: num(options.wordCount ?? item?.wordCount ?? item?.chapter_word_number ?? item?.words),
      volumeName: str(options.volumeName ?? item?.volume_name ?? "") || undefined,
      extra: options.extra ?? item
    };
  }
  function rootCategories(names, section = "category") {
    return names.map((title) => ({
      type: "category",
      title,
      action: { type: "openExplore", sectionId: section, payload: { category: title } },
      layout: { basis: 0.25, grow: 1 }
    }));
  }
  function manifestBase(input) {
    return {
      schemaVersion: 1,
      entry: input.entry || `${input.id}.ts`,
      ...input
    };
  }
  function escapeHTML(value) {
    return str(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function flattenSettings(settings = []) {
    return settings.flatMap((setting) => setting.type === "group" ? flattenSettings(setting.children) : [setting]);
  }
  function settingDefaultValue(setting) {
    if ("defaultValue" in setting)
      return setting.defaultValue;
    if (setting.type === "switch")
      return false;
    return "";
  }
  function settingsPageURL(ctx, manifest, options = {}) {
    const title = options.title || manifest.settingsPage?.title || `${manifest.name}设置`;
    const fields = flattenSettings(manifest.settings).filter((setting) => setting.type !== "button");
    const fieldJSON = JSON.stringify(fields.map((setting) => ({
      key: setting.key,
      title: setting.title,
      type: setting.type,
      description: setting.description,
      placeholder: "placeholder" in setting ? setting.placeholder : undefined,
      options: "options" in setting ? setting.options : undefined,
      min: "min" in setting ? setting.min : undefined,
      max: "max" in setting ? setting.max : undefined,
      step: "step" in setting ? setting.step : undefined,
      value: ctx.source.settings[setting.key] ?? settingDefaultValue(setting),
      defaultValue: settingDefaultValue(setting)
    })));
    const loginLinks = (manifest.login?.methods || []).filter((method) => method.type === "browser").map((method) => ({ title: method.title, url: method.url }));
    const links = [...loginLinks, ...options.links || []];
    const linkHTML = links.length ? `
      <section>
        <h2>网页登录</h2>
        <div class="row">
          ${links.map((link) => `<a class="button ${link.secondary ? "secondary" : ""}" href="${escapeHTML(link.url)}">${escapeHTML(link.title)}</a>`).join("")}
        </div>
      </section>` : "";
    const description = options.description || "这里的配置由书源自己使用。保存后会通过 iTurn config 接口写入源配置，登录完成后点击宿主窗口的完成按钮保存 Cookie。";
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; background: Canvas; color: CanvasText; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    p { color: color-mix(in srgb, CanvasText 62%, transparent); line-height: 1.6; }
    label { display: block; font-weight: 700; margin: 18px 0 8px; }
    input, select { width: 100%; box-sizing: border-box; font: inherit; padding: 12px 14px; border-radius: 10px; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); background: Canvas; color: CanvasText; }
    input[type="checkbox"] { width: auto; transform: scale(1.15); margin-right: 8px; }
    .field-note { margin-top: -2px; font-size: 13px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    button, a.button { appearance: none; border: 0; border-radius: 999px; padding: 11px 18px; font: inherit; font-weight: 700; background: #0a84ff; color: white; text-decoration: none; cursor: pointer; }
    button.secondary, a.secondary { background: color-mix(in srgb, CanvasText 12%, transparent); color: CanvasText; }
    .status { min-height: 24px; margin-top: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHTML(title)}</h1>
    <p>${escapeHTML(description)}</p>
    ${linkHTML}
    <section>
      <h2>源配置</h2>
      <div id="fields"></div>
      <div class="row">
        <button id="save">保存配置</button>
        <button class="secondary" id="reset">清除配置</button>
      </div>
      <div class="status" id="status"></div>
    </section>
  </main>
  <script>
    const fields = ${fieldJSON};
    const container = document.getElementById('fields');
    const status = document.getElementById('status');
    function normalizeValue(field, value) {
      if (field.type === 'switch') return Boolean(value);
      if (field.type === 'number') return value === '' || value === null || value === undefined ? null : Number(value);
      return value == null ? '' : String(value);
    }
    function inputFor(field, value) {
      if (field.type === 'select') {
        const select = document.createElement('select');
        for (const option of field.options || []) {
          const node = document.createElement('option');
          node.value = String(option.value);
          node.textContent = option.title;
          select.appendChild(node);
        }
        select.value = String(value || field.defaultValue || '');
        return select;
      }
      const input = document.createElement('input');
      input.type = field.type === 'token' || field.type === 'password' ? 'password' : field.type === 'switch' ? 'checkbox' : field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text';
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.type === 'switch') input.checked = Boolean(value);
      else input.value = String(value ?? '');
      return input;
    }
    async function render() {
      for (const field of fields) {
        const stored = await window.iturn.config.get(field.key);
        const value = normalizeValue(field, stored === null ? field.value : stored);
        const label = document.createElement('label');
        label.textContent = field.title;
        const input = inputFor(field, value);
        input.dataset.key = field.key;
        input.dataset.type = field.type;
        container.appendChild(label);
        container.appendChild(input);
        if (field.description) {
          const note = document.createElement('p');
          note.className = 'field-note';
          note.textContent = field.description;
          container.appendChild(note);
        }
      }
    }
    document.getElementById('save').addEventListener('click', async () => {
      for (const input of container.querySelectorAll('input, select')) {
        const type = input.dataset.type;
        const value = type === 'switch' ? input.checked : type === 'number' ? (input.value ? Number(input.value) : null) : input.value;
        await window.iturn.config.set(input.dataset.key, value);
      }
      status.textContent = '已保存';
    });
    document.getElementById('reset').addEventListener('click', async () => {
      for (const field of fields) await window.iturn.config.remove(field.key);
      status.textContent = '已清除';
    });
    render();
  </script>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }
  async function openSettingsPage(ctx, manifest, options) {
    const title = options?.title || manifest.settingsPage?.title || `${manifest.name}设置`;
    const result = await ctx.browser.open({ url: settingsPageURL(ctx, manifest, options), title, waitForClose: true });
    const config = result.data?.config || {};
    for (const [key, value] of Object.entries(config)) {
      if (value === null)
        await ctx.config.remove(key);
      else
        await ctx.config.set(key, value);
    }
    return { success: true, message: "设置已保存" };
  }
  var SOURCE_SETTINGS_COMMON = [
    { key: "contentFormat", title: "正文格式", type: "select", defaultValue: "blocks", options: [{ title: "Blocks", value: "blocks" }, { title: "Text", value: "text" }, { title: "HTML", value: "html" }] }
  ];

  // src/sources/guangyu.ts
  var HOSTS = ["https://v1.gyks.cf", "https://v2.gyks.cf", "https://v3.gyks.cf", "https://v4.gyks.cf", "https://v5.gyks.cf", "https://v6.gyks.cf", "https://v7.gyks.cf", "http://101.35.133.34:8888"];
  var manifest = manifestBase({
    id: "legado.3.guangyu.aggregate",
    name: "\uD83D\uDD05光遇聚合（迁移版）",
    version: "0.2.0",
    icon: "https://v1.gyks.cf/static/favicon.png",
    type: "mixed",
    groups: ["Legado", "聚合", "番茄", "七猫", "书旗"],
    baseUrl: HOSTS[0],
    entry: "guangyu.ts",
    permissions: { network: { domains: ["*.gyks.cf", "101.35.133.34", "fanqienovel.com"] }, cookie: { domains: ["*.gyks.cf", "101.35.133.34", "fanqienovel.com"] }, storage: true, secret: true, browser: true },
    settings: [
      { key: "line", title: "线路", type: "select", defaultValue: HOSTS[0], options: HOSTS.map((x) => ({ title: x, value: x })) },
      { key: "tab", title: "类型", type: "select", defaultValue: "小说", options: ["小说", "听书", "漫画", "短剧"].map((x) => ({ title: x, value: x })) },
      { key: "source", title: "平台", type: "text", defaultValue: "全部" },
      { key: "accessKey", title: "光遇密钥 / key", type: "token" },
      ...SOURCE_SETTINGS_COMMON
    ],
    settingsPage: { title: "光遇聚合设置" },
    login: { methods: [{ type: "browser", id: "guangyu", title: "晴天聚合网页登录", url: `${HOSTS[0]}/login`, cookieDomains: ["*.gyks.cf"] }], checkOnStartup: false },
    limits: { timeoutMs: 180000, concurrent: 4 }
  });
  function api(ctx) {
    return str(ctx.source.settings.line || HOSTS[0]).replace(/\/+$/, "");
  }
  function tab(ctx) {
    return str(ctx.source.settings.tab || "小说");
  }
  function sourceKey(ctx) {
    return str(ctx.source.settings.source || "全部");
  }
  function statusOf(value) {
    const text = str(value);
    if (/完结|已完|completed/i.test(text))
      return "completed";
    if (/连载|ongoing|更新/i.test(text))
      return "ongoing";
    if (/暂停|paused/i.test(text))
      return "paused";
    if (/下架|removed/i.test(text))
      return "removed";
    return;
  }
  function toBook(ctx, item) {
    const opaque = { book_id: item?.book_id, sources: item?.source, source: item?.source, tab: item?.tab || tab(ctx), url: item?.toc_url || "", detail_url: item?.detail_url || "", book_name: item?.book_name, author: item?.author, abstract: item?.abstract, thumb_url: item?.thumb_url };
    return bookFromItem(ctx.source.id, item, { id: `${opaque.sources || "unknown"}:${opaque.book_id}`, bookUrl: JSON.stringify(opaque), name: item?.book_name, author: item?.author, cover: item?.thumb_url, intro: item?.abstract, kind: [item?.category, item?.tags], status: statusOf(item?.status), wordCount: item?.word_number, lastChapterName: item?.last_chapter_title, extra: item });
  }
  async function cookieHeader(ctx, domain) {
    const cookies = await ctx.cookie.getAll(domain);
    return (cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }
  function hostname(input) {
    try {
      return new URL(input).hostname;
    } catch {
      return input;
    }
  }
  async function fanqieReaderHTML(ctx, itemId) {
    if (!itemId)
      return "";
    const cookie = await cookieHeader(ctx, "fanqienovel.com");
    const headers = {
      "user-agent": "Mozilla/5.0",
      referer: "https://fanqienovel.com/"
    };
    if (cookie)
      headers.cookie = cookie;
    const response = await fetch(`https://fanqienovel.com/reader/${itemId}`, { headers });
    return response.ok ? response.text() : "";
  }
  var module = {
    async search(ctx) {
      const { keyword, page } = ctx.args;
      const pageSize = ctx.args.pageSize || 32;
      const json = await fetchJson(withQuery(joinUrl(api(ctx), "/search"), { title: keyword, tab: tab(ctx), source: sourceKey(ctx), page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize, disabled_sources: 0 }));
      const books = (json?.data || []).map((x) => toBook(ctx, x));
      return { books, page, hasMore: books.length > 0 };
    },
    async explore(ctx) {
      const { sectionId, payload, page } = ctx.args;
      if (!sectionId)
        return { items: rootCategories(["番茄", "七猫", "书旗", "QQ阅读", "塔读", "玄幻", "都市", "历史", "漫画", "听书"]) };
      const out = await module.search({ ...ctx, args: { keyword: str(payload?.category), page, pageSize: ctx.args.pageSize } });
      return { items: out.books.map((book) => ({ type: "book", book })), page, hasMore: out.hasMore };
    },
    async bookInfo(ctx) {
      const book = ctx.args.book;
      const data = JSON.parse(book.bookUrl);
      return { ...book, tocUrl: book.bookUrl, extra: { ...book.extra, ...data } };
    },
    async toc(ctx) {
      const data = JSON.parse(str(ctx.args.book.tocUrl || ctx.args.book.bookUrl));
      const variable = JSON.stringify({ custom: "" });
      const json = await postJson(withQuery(joinUrl(api(ctx), "/catalog"), { book_id: data.book_id, source: data.sources || data.source, tab: data.tab || tab(ctx), variable }), { html: "" });
      const chapters = (json?.data || []).map((x, i) => chapterFromItem(ctx.source.id, x, i, { id: x?.item_id, name: x?.title, chapterUrl: JSON.stringify({ book_id: data.book_id, item_id: x?.item_id, title: x?.title, sources: x?.source || data.sources || data.source, tab: data.tab || tab(ctx), url: x?.toc_url || "", content_url: x?.content_url || "" }), updateTime: x?.first_pass_time, wordCount: x?.chapter_word_number, extra: x }));
      return { chapters };
    },
    async content(ctx) {
      const info = JSON.parse(ctx.args.chapter.chapterUrl);
      const qttoken = str(ctx.source.settings.accessKey);
      const backendCookie = await cookieHeader(ctx, hostname(api(ctx)));
      const cookie = backendCookie || (qttoken ? `qttoken=${qttoken};deviceId=iturn;` : "");
      const headers = {
        "content-type": "application/json",
        ...cookie ? { cookie } : {}
      };
      const source = str(info.sources || info.source);
      const tabName = str(info.tab || tab(ctx));
      const itemId = str(info.item_id);
      const html = source === "番茄" ? await fanqieReaderHTML(ctx, itemId) : "";
      const hasReview = ["番茄", "七猫", "塔读", "QQ阅读", "svip_QQ阅读"].includes(source) && tabName === "小说";
      const url = joinUrl(api(ctx), hasReview ? "/content?review=1" : "/content");
      const json = await postJson(url, {
        html,
        item_id: itemId,
        source,
        tab: tabName,
        tone_id: "4",
        variable: JSON.stringify({ custom: "" }),
        version: "26.6.9"
      }, { headers });
      return makeContent(ctx, info.title || ctx.args.chapter.name, str(json?.content || json?.data?.content || ""));
    },
    async login(ctx) {
      await ctx.browser.open({ url: joinUrl(api(ctx), "/login"), title: "晴天聚合登录", waitForClose: true });
      const status = await module.checkLogin(ctx);
      return { success: status.loggedIn, message: status.message };
    },
    async checkLogin(ctx) {
      const token = await ctx.cookie.get(hostname(api(ctx)), "qttoken");
      const fanqie = await ctx.cookie.get("fanqienovel.com", "sessionid");
      const key = str(ctx.source.settings.accessKey);
      return { loggedIn: !!(token || fanqie || key), message: token ? "已登录晴天聚合" : fanqie ? "已发现番茄 sessionid" : key ? "已填写光遇密钥" : "未登录" };
    },
    async settingsPage(ctx) {
      await openSettingsPage(ctx, manifest, {
        links: [{ title: "打开用户中心", url: joinUrl(api(ctx), "/user"), secondary: true }]
      });
      const status = await module.checkLogin(ctx);
      return { success: true, loggedIn: status.loggedIn, message: status.message };
    }
  };
  var source = {
    ...manifest,
    module
  };
  var guangyu_default = source;

  // .source-build/guangyu.ts
  var { module: sourceModule, ...manifest2 } = guangyu_default;
  var runtimeModule = {
    ...sourceModule,
    manifest: {
      ...manifest2,
      entry: "guangyu.js"
    }
  };
  globalThis.__sourceModule = runtimeModule;
})();
