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

  // src/sources/fanqieFourInOne.ts
  var API = "https://fq.vv9v.cn";
  var TYPES = { 小说: "novel", 出版: "novel", 短篇: "novel", 听书: "audio", 听小说: "novel", 漫画: "comic", 短剧: "video" };
  var manifest = manifestBase({
    id: "legado.4.fanqie.zhiqiu4in1",
    name: "✿番茄四合一（知秋段评）迁移版✿",
    version: "0.2.0",
    icon: "https://p1-tt.byteimg.com/origin/novel-static/a3621391ca2e537045168afda6722ee9",
    type: "mixed",
    groups: ["Legado", "番茄", "四合一"],
    baseUrl: API,
    entry: "fanqieFourInOne.ts",
    permissions: { network: { domains: ["fq.vv9v.cn", "changdunovel.com"] }, cookie: { domains: ["fq.vv9v.cn", "changdunovel.com"] }, storage: true, secret: true, browser: true },
    settings: [
      { key: "sourceToken", title: "x-sec-token / 书源变量", type: "token" },
      { key: "androidId", title: "x-android-id", type: "text" },
      { key: "type", title: "搜索类型", type: "select", defaultValue: "小说", options: Object.keys(TYPES).map((x) => ({ title: x, value: x })) },
      ...SOURCE_SETTINGS_COMMON
    ],
    settingsPage: { title: "番茄四合一设置" },
    limits: { timeoutMs: 180000, concurrent: 4 }
  });
  function sourceType(ctx, keyword) {
    let type = str(ctx.source.settings.type || "小说");
    if (keyword && /^[nNcCaAvV]/.test(keyword)) {
      const m = keyword[0].toLowerCase();
      if (m === "n")
        type = "小说";
      if (m === "c")
        type = "漫画";
      if (m === "a")
        type = "听书";
      if (m === "v")
        type = "短剧";
    }
    return TYPES[type] || "novel";
  }
  function headers(ctx) {
    return { "x-sec-token": str(ctx.source.settings.sourceToken), "x-android-id": str(ctx.source.settings.androidId || "source-runtime-lab") };
  }
  function toBook(ctx, item, type = sourceType(ctx)) {
    const id = str(item?.bid || item?.book_id || item?.bookId || item?.id);
    return bookFromItem(ctx.source.id, item, { id, bookUrl: JSON.stringify({ type, id }), name: item?.book_name || item?.title || item?.name, author: item?.author, cover: item?.thumb_url || item?.cover || item?.thumbUri, intro: item?.abstract || item?.intro, kind: [item?.category, item?.tags], wordCount: item?.word_number, lastChapterName: item?.last_chapter_title });
  }
  var module = {
    async search(ctx) {
      let keyword = ctx.args.keyword;
      const type = sourceType(ctx, keyword);
      if (/^[nNcCaAvV]/.test(keyword))
        keyword = keyword.slice(1);
      const pageSize = ctx.args.pageSize || 32;
      const json = await fetchJson(withQuery(joinUrl(API, `/${type}/search`), { keyword, page: ctx.args.page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize }), { headers: headers(ctx) });
      const books = (json?.data?.list || json?.data || json?.list || []).map((x) => toBook(ctx, x, type));
      return { books, page: ctx.args.page, hasMore: books.length > 0 };
    },
    async explore(ctx) {
      if (!ctx.args.sectionId)
        return { items: rootCategories(["小说", "漫画", "听书", "短剧"], "type") };
      const fake = { ...ctx, source: { ...ctx.source, settings: { ...ctx.source.settings, type: str(ctx.args.payload?.category || "小说") } }, args: { keyword: str(ctx.args.payload?.category || "热门"), page: ctx.args.page, pageSize: ctx.args.pageSize } };
      const out = await module.search(fake);
      return { items: out.books.map((book) => ({ type: "book", book })), page: out.page, hasMore: out.hasMore };
    },
    async bookInfo(ctx) {
      const { type, id } = JSON.parse(ctx.args.book.bookUrl);
      const json = await fetchJson(withQuery(joinUrl(API, `/${type}/detail`), { bid: id, book_id: id }), { headers: headers(ctx) });
      const d = json?.data || json;
      return { ...toBook(ctx, d, type), tocUrl: JSON.stringify({ type, id }), extra: d };
    },
    async toc(ctx) {
      const { type, id } = JSON.parse(str(ctx.args.book.tocUrl || ctx.args.book.bookUrl));
      const json = await fetchJson(withQuery(joinUrl(API, `/${type}/catalog`), { bid: id, book_id: id }), { headers: headers(ctx) });
      const list = json?.data?.list || json?.data?.chapters || json?.data || [];
      const chapters = list.map((x, i) => chapterFromItem(ctx.source.id, x, i, { id: x?.cid || x?.chapter_id || x?.item_id || x?.id, name: x?.title || x?.chapter_title, chapterUrl: JSON.stringify({ type, bid: id, cid: x?.cid || x?.chapter_id || x?.item_id || x?.id, title: x?.title }), updateTime: x?.first_pass_time }));
      return { chapters };
    },
    async content(ctx) {
      const info = JSON.parse(ctx.args.chapter.chapterUrl);
      const json = await fetchJson(withQuery(joinUrl(API, `/${info.type}/content`), { bid: info.bid, book_id: info.bid, cid: info.cid, chapter_id: info.cid, item_id: info.cid }), { headers: headers(ctx) });
      return makeContent(ctx, info.title || ctx.args.chapter.name, str(json?.data?.content || json?.content || json?.data || ""));
    },
    async checkLogin(ctx) {
      return { loggedIn: !!str(ctx.source.settings.sourceToken), message: str(ctx.source.settings.sourceToken) ? "已填写 token" : "未填写 token" };
    },
    async settingsPage(ctx) {
      return openSettingsPage(ctx, manifest);
    }
  };
  var source = {
    ...manifest,
    module
  };
  var fanqieFourInOne_default = source;

  // .source-build/fanqieFourInOne.ts
  var { module: sourceModule, ...manifest2 } = fanqieFourInOne_default;
  var runtimeModule = {
    ...sourceModule,
    manifest: {
      ...manifest2,
      entry: "fanqieFourInOne.js"
    }
  };
  globalThis.__sourceModule = runtimeModule;
})();
