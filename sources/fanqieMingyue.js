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
  function asArray(value) {
    if (!value)
      return [];
    if (Array.isArray(value))
      return value;
    if (typeof value === "object")
      return Object.values(value).flatMap((x) => Array.isArray(x) ? x : [x]);
    return [];
  }
  function collectArraysByKey(obj, key) {
    const out = [];
    const visit = (value) => {
      if (!value || typeof value !== "object")
        return;
      if (Array.isArray(value[key]))
        out.push(...value[key]);
      if (Array.isArray(value))
        value.forEach(visit);
      else
        Object.values(value).forEach(visit);
    };
    visit(obj);
    return out;
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

  // src/sources/fanqieMingyue.ts
  var FANQIE = "https://fanqienovel.com";
  var CONTENT_ROUTES = [
    "https://gofq.52dns.cc/content",
    "https://pyfq.52dns.cc/content",
    "https://fqxs.ns114.cc/content"
  ];
  var manifest = manifestBase({
    id: "legado.7.fanqie.mingyue",
    name: "番茄-明月（迁移版）",
    version: "0.2.3",
    icon: "https://p1-tt.byteimg.com/origin/novel-static/a3621391ca2e537045168afda6722ee9",
    type: "mixed",
    groups: ["Legado", "番茄", "明月"],
    baseUrl: FANQIE,
    entry: "fanqieMingyue.ts",
    permissions: {
      network: {
        domains: [
          "fanqienovel.com",
          "*.snssdk.com",
          "*.fqnovel.com",
          "gofq.52dns.cc",
          "pyfq.52dns.cc",
          "fqxs.ns114.cc"
        ]
      },
      cookie: { domains: ["fanqienovel.com"] },
      storage: true,
      secret: true,
      browser: true
    },
    settings: [...SOURCE_SETTINGS_COMMON],
    settingsPage: { title: "番茄明月设置" },
    limits: { timeoutMs: 180000, concurrent: 4 },
    match: { bookUrl: "https?://(.*(fqnovel|snssdk|fanqienovel|changdunovel)\\.com|skybook.1113355.xyz)/.*[0-9]{19}.*" }
  });
  var WEB_HEADERS = {
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    referer: "https://fanqienovel.com/"
  };
  function replaceCover(u) {
    const s = str(u);
    return s ? s.replace(/(\d+)-tt/, "6-novel") : undefined;
  }
  function rawBook(item) {
    return item?.book_info || item?.bookInfo || item?.raw_book_info || item;
  }
  function toBook(ctx, item) {
    const raw = rawBook(item);
    const id = str(raw?.book_id || raw?.bookId || raw?.mixed_data?.post_data?.post_id);
    const genre = raw?.genre ?? raw?.book_type;
    return bookFromItem(ctx.source.id, raw, {
      id,
      bookUrl: JSON.stringify({ id, genre }),
      name: raw?.book_name || raw?.bookName || raw?.title || raw?.mixed_data?.post_data?.title,
      author: raw?.author || raw?.mixed_data?.post_data?.user_info?.user_name,
      cover: replaceCover(raw?.audio_thumb_uri || raw?.thumb_url || raw?.thumbUri || raw?.mixed_data?.post_data?.user_info?.user_avatar),
      intro: raw?.abstract || raw?.mixed_data?.post_data?.pure_content,
      kind: [raw?.category, genreName(genre)].filter(Boolean),
      wordCount: raw?.word_number || raw?.wordNumber,
      lastChapterName: raw?.last_chapter_title || raw?.lastChapterTitle,
      status: statusName(raw?.creation_status || raw?.creationStatus),
      extra: raw
    });
  }
  function genreName(value) {
    const n = Number(value);
    if (n === 1)
      return "漫画";
    if (n === 4)
      return "有声书";
    return;
  }
  function parseInitialState(html) {
    const markers = ["window.__INITIAL_STATE__=", "window.__INITIAL_STATE__ = "];
    let jsonStart = -1;
    for (const marker of markers) {
      const start = html.indexOf(marker);
      if (start >= 0) {
        jsonStart = start + marker.length;
        break;
      }
    }
    if (jsonStart < 0)
      throw new Error("Fanqie initial state not found");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let objectStart = -1;
    for (let i = jsonStart;i < html.length; i++) {
      const ch = html[i];
      if (objectStart < 0) {
        if (ch === "{")
          objectStart = i;
        else
          continue;
      }
      if (inString) {
        if (escaped)
          escaped = false;
        else if (ch === "\\")
          escaped = true;
        else if (ch === '"')
          inString = false;
        continue;
      }
      if (ch === '"')
        inString = true;
      else if (ch === "{")
        depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0)
          return JSON.parse(html.slice(objectStart, i + 1));
      }
    }
    throw new Error("Fanqie initial state is incomplete");
  }
  async function fanqieHTML(path, cookie) {
    const headers = { ...WEB_HEADERS };
    if (cookie)
      headers.cookie = cookie;
    return fetchText(`${FANQIE}${path}`, { headers });
  }
  async function fanqieState(path, cookie) {
    return parseInitialState(await fanqieHTML(path, cookie));
  }
  async function fanqieBookPage(id) {
    return (await fanqieState(`/page/${id}`))?.page || {};
  }
  function categoryNames(value) {
    try {
      const parsed = JSON.parse(str(value));
      return asArray(parsed).map((x) => str(x?.Name)).filter(Boolean);
    } catch {
      return [];
    }
  }
  function statusName(value) {
    const n = Number(value);
    if (n === 0)
      return "completed";
    if (n === 1)
      return "ongoing";
    return "unknown";
  }
  function decodeBase64Utf8(input) {
    const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of input.replace(/=+$/g, "")) {
      const value = table.indexOf(ch);
      if (value < 0)
        continue;
      buffer = buffer << 6 | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push(buffer >> bits & 255);
      }
    }
    let out = "";
    for (let i = 0;i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 128)
        out += String.fromCharCode(b);
      else if ((b & 224) === 192 && i + 1 < bytes.length) {
        out += String.fromCharCode((b & 31) << 6 | bytes[++i] & 63);
      } else if ((b & 240) === 224 && i + 2 < bytes.length) {
        out += String.fromCharCode((b & 15) << 12 | (bytes[++i] & 63) << 6 | bytes[++i] & 63);
      } else {
        out += String.fromCharCode(b);
      }
    }
    return out;
  }
  function dataURLPayload(value) {
    const match = value.match(/^data:.*?base64,([^,]+)/);
    return match ? decodeBase64Utf8(match[1]) : value;
  }
  function parseLooseObject(value) {
    if (value && typeof value === "object")
      return value;
    const raw = dataURLPayload(str(value));
    if (!raw)
      return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  function extractFanqieIds(value) {
    const object = parseLooseObject(value);
    const raw = dataURLPayload(str(value || object?.bookUrl || object?.chapterUrl));
    const urlId = (() => {
      try {
        const url = new URL(raw);
        return {
          id: str(url.searchParams.get("book_id") || url.searchParams.get("bookId") || url.searchParams.get("id")),
          itemId: str(url.searchParams.get("item_id") || url.searchParams.get("itemId") || url.searchParams.get("chapterId"))
        };
      } catch {
        return {};
      }
    })();
    const pair = raw.includes("#") ? raw.split("#") : [];
    const ids = [...raw.matchAll(/\d{10,}/g)].map((match) => match[0]);
    return {
      id: str(object?.id || object?.bookId || object?.book_id || object?.bid || urlId.id || pair[0] || ids[0]) || undefined,
      itemId: str(object?.itemId || object?.item_id || object?.chapterId || object?.chapter_id || urlId.itemId || pair[1] || ids[1] || ids[0]) || undefined,
      title: str(object?.title || object?.name) || undefined,
      genre: object?.genre
    };
  }
  function bookIdentity(book) {
    return extractFanqieIds(book?.bookUrl || book?.tocUrl || book?.id || book);
  }
  function chapterIdentity(chapter) {
    const ids = extractFanqieIds(chapter?.chapterUrl || chapter?.url || chapter?.id || chapter);
    return { ...ids, title: ids.title || str(chapter?.name || chapter?.title) || undefined };
  }
  function bookFromPage(ctx, page, fallback) {
    const id = str(page?.bookId || fallback?.id || fallback?.bookUrl);
    const genre = page?.genre ?? fallback?.extra?.genre ?? fallback?.genre;
    const info = {
      ...fallback,
      id,
      sourceId: ctx.source.id,
      name: str(page?.bookName || fallback?.name || fallback?.title),
      author: str(page?.author || fallback?.author) || undefined,
      bookUrl: JSON.stringify({ id, genre }),
      cover: replaceCover(page?.thumbUri || page?.thumbUrl || fallback?.cover || fallback?.coverUrl),
      intro: str(page?.abstract || fallback?.intro || fallback?.summary) || undefined,
      kind: [...categoryNames(page?.categoryV2), genreName(genre)].filter(Boolean),
      wordCount: Number(page?.wordNumber) || fallback?.wordCount,
      lastChapterName: str(page?.lastChapterTitle || fallback?.lastChapterName || fallback?.latestChapterTitle) || undefined,
      status: statusName(page?.creationStatus) || fallback?.status,
      tocUrl: JSON.stringify({ id, genre }),
      extra: page
    };
    ctx.log.info(`Fanqie book info: ${JSON.stringify(info)}`);
    return info;
  }
  async function cookieHeader(ctx, domain = "fanqienovel.com") {
    try {
      const cookies = await ctx.cookie.getAll(domain);
      return (cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    } catch {
      return "";
    }
  }
  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${url}
${text.slice(0, 160)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON: ${url}
${text.slice(0, 160)}`);
    }
  }
  function decodeHtmlEntities(value) {
    return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  }
  function stripHtml2(value) {
    return value.replace(/<[^>]+>/g, "");
  }
  function looksObfuscatedContent(value) {
    const text = stripHtml2(value).replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, "").trim();
    if (!text)
      return false;
    const bad = text.match(/[\uE000-\uF8FF\u25A0\u2588\uFFFD]/g)?.length || 0;
    if (bad >= 6)
      return true;
    if (bad > 0 && bad / Math.max(1, text.length) > 0.015)
      return true;
    return false;
  }
  function normalizeContent(value) {
    let content = str(value);
    if (!content)
      return "";
    try {
      if (/^"[\s\S]*"$/.test(content))
        content = JSON.parse(content);
    } catch {}
    content = decodeHtmlEntities(content).replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&").replace(/\\n/g, `
`).trim();
    if (!content)
      return "";
    if (looksObfuscatedContent(content))
      return "";
    if (/<(p|div|br|span|img|h\d)\b/i.test(content))
      return content;
    return content.split(/\n{1,}/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${line}</p>`).join(`
`);
  }
  function pickContent(json) {
    const candidates = [
      json?.data?.content,
      json?.data?.chapterData?.content,
      json?.data?.chapter_data?.content,
      json?.data?.chapter?.content,
      json?.content,
      json?.chapterData?.content,
      json?.reader?.chapterData?.content,
      json?.reader?.chapter_data?.content,
      json?.reader?.data?.content
    ];
    const titles = [
      json?.data?.title,
      json?.data?.chapterData?.title,
      json?.data?.chapter_data?.title,
      json?.data?.chapter?.title,
      json?.title,
      json?.chapterData?.title,
      json?.reader?.chapterData?.title,
      json?.reader?.chapter_data?.title
    ];
    for (let i = 0;i < candidates.length; i++) {
      const content = normalizeContent(candidates[i]);
      if (content)
        return { title: str(titles[i]) || undefined, content };
    }
    const seen = new Set;
    const stack = [json];
    while (stack.length) {
      const current = stack.pop();
      if (!current || typeof current !== "object" || seen.has(current))
        continue;
      seen.add(current);
      for (const [key, value] of Object.entries(current)) {
        if (/^(content|chapterContent|chapter_content|text)$/i.test(key)) {
          const content = normalizeContent(value);
          if (content && content.length > 20)
            return { title: str(current.title) || undefined, content };
        }
        if (value && typeof value === "object")
          stack.push(value);
      }
    }
    return {};
  }
  async function contentFromFanqiePage(itemId, cookie) {
    try {
      const state = await fanqieState(`/reader/${itemId}`, cookie);
      return pickContent(state);
    } catch {
      return {};
    }
  }
  async function contentFromFanqieApis(itemId, cookie) {
    const headers = { ...WEB_HEADERS };
    if (cookie)
      headers.cookie = cookie;
    const urls = [
      withQuery(`${FANQIE}/api/reader/full`, { itemId }),
      withQuery("https://reading.snssdk.com/reading/reader/full/v/", {
        aid: 1967,
        app_name: "novelapp",
        device_platform: "android",
        item_id: itemId
      })
    ];
    for (const url of urls) {
      try {
        const result = pickContent(await requestJson(url, { headers }));
        if (result.content)
          return result;
      } catch {}
    }
    return {};
  }
  async function contentFromRoute(itemId) {
    for (const route of CONTENT_ROUTES) {
      try {
        const json = await requestJson(withQuery(route, { item_id: itemId }), {
          headers: { "user-agent": "Mozilla/5.0", accept: "application/json,text/plain,*/*" }
        });
        const result = pickContent(json);
        if (result.content)
          return result;
      } catch {}
    }
    return {};
  }
  var module = {
    async search(ctx) {
      ctx.log.info(`Searching Fanqie for keyword: ${ctx.args.keyword}`);
      const key = ctx.args.keyword;
      const pageSize = ctx.args.pageSize || 32;
      let raw = [];
      if (/^\d{19}$/.test(key)) {
        raw = [await fanqieBookPage(key)];
      } else {
        const url = withQuery("https://novel.snssdk.com/api/novel/channel/homepage/search/search/v2/", {
          device_platform: "android",
          parent_enterfrom: "novel_channel_search.tab.",
          offset: (ctx.args.page - 1) * pageSize,
          count: pageSize,
          pageSize,
          page_size: pageSize,
          aid: 1967,
          q: key
        });
        const json = await fetchJson(url);
        raw = asArray(json?.data?.ret_data).concat(collectArraysByKey(json, "book_info"));
      }
      const books = raw.map((x) => toBook(ctx, x)).filter((x) => str(x?.id || x?.bookUrl));
      return { books, page: ctx.args.page, hasMore: books.length > 0 };
    },
    async explore(ctx) {
      ctx.log.info(`Exploring Fanqie category: ${ctx.args.payload?.category || "推荐"}`);
      if (!ctx.args.sectionId)
        return { items: rootCategories(["每周推荐", "男频精选", "女频精选", "巅峰榜单", "出版榜单", "短篇小说"]) };
      const out = await module.search({ ...ctx, args: { keyword: str(ctx.args.payload?.category || "推荐"), page: ctx.args.page, pageSize: ctx.args.pageSize } });
      return { items: out.books.map((book) => ({ type: "book", book })), page: out.page, hasMore: out.hasMore };
    },
    async bookInfo(ctx) {
      ctx.log.info(`Fetching Fanqie book info for book: ${ctx.args.book || ""}`);
      const { id } = bookIdentity(ctx.args.book);
      if (!id)
        throw new Error(`Missing Fanqie book id: ${ctx.args.book.bookUrl || ctx.args.book.name || ""}`);
      return bookFromPage(ctx, await fanqieBookPage(id), ctx.args.book);
    },
    async toc(ctx) {
      ctx.log.info(`Fetching Fanqie TOC for book: ${ctx.args.book.name || ctx.args.book.bookUrl || ""}`);
      const book = ctx.args.book;
      const { id, genre } = bookIdentity(book);
      if (!id)
        throw new Error(`Missing Fanqie book id: ${book.tocUrl || book.bookUrl || ""}`);
      const json = await fetchJson(withQuery(`${FANQIE}/api/reader/directory/detail`, { bookId: id }));
      const groups = json?.data?.chapterListWithVolume || [];
      const flat = asArray(groups).flatMap((x) => Array.isArray(x) ? x : asArray(x?.chapters || x?.chapterList || x?.itemDataList || x));
      const chapters = flat.filter((x) => x && !x?.isVolume).map((x, i) => {
        const itemId = str(x?.itemId || x?.item_id || x?.chapterId || x?.id);
        return chapterFromItem(ctx.source.id, x, i, {
          id: itemId,
          name: str(x?.title || x?.chapterName).replace("版权信息页", ""),
          chapterUrl: JSON.stringify({ bid: id, itemId, title: x?.title || x?.chapterName, genre }),
          updateTime: x?.firstPassTime || x?.first_pass_time,
          volumeName: x?.volume_name || x?.volumeName,
          extra: x
        });
      }).filter((x) => str(x?.id || x?.chapterUrl));
      return { chapters };
    },
    async content(ctx) {
      ctx.log.info(`Fetching Fanqie content for chapter: ${ctx.args.chapter.name || ctx.args.chapter.chapterUrl || ""}`);
      const info = chapterIdentity(ctx.args.chapter);
      const itemId = str(info.itemId);
      if (!itemId)
        throw new Error(`Missing Fanqie chapter id: ${ctx.args.chapter.chapterUrl || ctx.args.chapter.name || ""}`);
      const cookie = await cookieHeader(ctx);
      const title = info.title || ctx.args.chapter.name;
      const providers = [
        () => contentFromRoute(itemId),
        () => contentFromFanqieApis(itemId, cookie),
        () => contentFromFanqiePage(itemId, cookie)
      ];
      const errors = [];
      for (const provider of providers) {
        try {
          const result = await provider();
          if (result.content)
            return makeContent(ctx, str(result.title || title), result.content);
        } catch (e) {
          errors.push(String(e?.message || e));
        }
      }
      throw new Error(`Fanqie content empty: itemId=${itemId}${errors.length ? `
${errors.join(`
`)}` : ""}`);
    },
    async settingsPage(ctx) {
      return openSettingsPage(ctx, manifest);
    }
  };
  var source = {
    ...manifest,
    module
  };
  var fanqieMingyue_default = source;

  // .source-build/fanqieMingyue.ts
  var { module: sourceModule, ...manifest2 } = fanqieMingyue_default;
  var runtimeModule = {
    ...sourceModule,
    manifest: {
      ...manifest2,
      entry: "fanqieMingyue.js"
    }
  };
  globalThis.__sourceModule = runtimeModule;
})();
