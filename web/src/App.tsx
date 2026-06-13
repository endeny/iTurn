import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

type RuntimeOutput<T = any> = { result: T; trace: any }
type Manifest = { id: string; name: string; version: string; settings?: any[] }
type BookRef = { id?: string; sourceId: string; name: string; author?: string; bookUrl: string; cover?: string; intro?: string; kind?: string[]; extra?: any }
type Chapter = { id?: string; sourceId: string; name: string; chapterUrl: string; index?: number; volumeName?: string; extra?: any }
type ContentResult = { title?: string; format: 'text' | 'html' | 'blocks'; content: any }

function defaultSettings(manifest?: Manifest) {
  const result: Record<string, any> = {}
  for (const setting of manifest?.settings ?? []) {
    if ('defaultValue' in setting) result[setting.key] = setting.defaultValue
  }
  return result
}

function App() {
  const [sources, setSources] = useState<Manifest[]>([])
  const [sourceId, setSourceId] = useState('')
  const manifest = useMemo(() => sources.find((x) => x.id === sourceId) ?? sources[0], [sources, sourceId])
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [keyword, setKeyword] = useState('系统')
  const [category, setCategory] = useState('玄幻')
  const [page, setPage] = useState(1)
  const [books, setBooks] = useState<BookRef[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [selectedBook, setSelectedBook] = useState<BookRef | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null)
  const [content, setContent] = useState<ContentResult | null>(null)
  const [trace, setTrace] = useState<any>(null)
  const [sourceCode, setSourceCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sources').then((r) => r.json()).then((items) => {
      setSources(items)
      setSourceId(items[0]?.id ?? '')
      setSettings(defaultSettings(items[0]))
    }).catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!manifest) return
    setSettings(defaultSettings(manifest))
    setBooks([]); setChapters([]); setSelectedBook(null); setSelectedChapter(null); setContent(null); setTrace(null)
    fetch(`/api/source?sourceId=${encodeURIComponent(manifest.id)}`).then((r) => r.text()).then(setSourceCode).catch(() => setSourceCode(''))
  }, [manifest?.id])

  async function call<T = any>(name: string, args: any): Promise<RuntimeOutput<T>> {
    if (!manifest) throw new Error('No source selected')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceId: manifest.id, name, args, settings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setTrace(json.trace)
      if (json.trace?.error) setError(json.trace.error.message || String(json.trace.error))
      return json
    } finally {
      setLoading(false)
    }
  }

  async function runSearch() {
    const output = await call<{ books: BookRef[] }>('search', { keyword, page })
    setBooks(output.result?.books ?? [])
    setChapters([]); setContent(null); setSelectedBook(null); setSelectedChapter(null)
  }

  async function runExploreRoot() {
    const output = await call<{ items: any[] }>('explore', { page: 1 })
    setTrace(output.trace)
  }

  async function runExploreCategory() {
    const output = await call<{ items: any[] }>('explore', { page, sectionId: 'category', payload: { category } })
    const nextBooks = (output.result?.items ?? []).filter((x) => x.type === 'book').map((x) => x.book)
    setBooks(nextBooks)
    setChapters([]); setContent(null); setSelectedBook(null); setSelectedChapter(null)
  }

  async function loadToc(book: BookRef) {
    setSelectedBook(book); setSelectedChapter(null); setContent(null)
    const info = await call<BookRef>('bookInfo', { book })
    const output = await call<{ chapters: Chapter[] }>('toc', { book: info.result })
    setSelectedBook(info.result as BookRef)
    setChapters(output.result?.chapters ?? [])
  }

  async function loadContent(chapter: Chapter) {
    if (!selectedBook) return
    setSelectedChapter(chapter)
    const output = await call<ContentResult>('content', { book: selectedBook, chapter })
    setContent(output.result ?? null)
  }

  function renderSetting(setting: any) {
    const value = settings[setting.key]
    if (setting.type === 'select') {
      return <select value={value ?? ''} onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.value })}>{(setting.options ?? []).map((o: any) => <option key={o.value} value={o.value}>{o.title}</option>)}</select>
    }
    if (setting.type === 'switch') {
      return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.checked })} /> 开启</label>
    }
    return <input type={setting.type === 'password' || setting.type === 'token' ? 'password' : setting.type === 'number' ? 'number' : setting.type === 'color' ? 'color' : 'text'} value={value ?? ''} placeholder={setting.placeholder ?? ''} onChange={(e) => setSettings({ ...settings, [setting.key]: e.target.value })} />
  }

  const can = (name: string) => !!manifest && ['search', 'explore', 'bookInfo', 'toc', 'content'].includes(name)

  return <div className="app">
    <div className="header">
      <div>
        <h1 className="title">Source Runtime Lab</h1>
        <p className="subtitle">Bun 后端执行新协议书源，React 只做测试 UI。当前实现了你提供的 9 个 Legado 源。</p>
      </div>
      <div className="badge">{manifest?.version}</div>
    </div>

    <div className="grid">
      <aside className="panel">
        <h2>书源</h2>
        <div className="field"><label>选择源</label><select value={manifest?.id ?? ''} onChange={(e) => setSourceId(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="mini"><b>ID:</b> {manifest?.id}</div>

        <h2>参数</h2>
        <div className="field"><label>关键词</label><input value={keyword} onChange={(e) => setKeyword(e.target.value)} /></div>
        <div className="field"><label>分类/发现关键词</label><input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        <div className="field"><label>页码</label><input type="number" value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} /></div>

        <h2>Settings</h2>
        {(manifest?.settings ?? []).map((setting) => <div className="field" key={setting.key}><label>{setting.title}</label>{renderSetting(setting)}</div>)}

        <div className="row">
          <button className="btn primary" disabled={loading || !can('search')} onClick={runSearch}>Search</button>
          <button className="btn" disabled={loading || !can('explore')} onClick={runExploreRoot}>Explore Root</button>
          <button className="btn" disabled={loading || !can('explore')} onClick={runExploreCategory}>Explore Category</button>
        </div>
      </aside>

      <main className="stack">
        {error && <div className="error">{error}</div>}
        <div className="split">
          <section className="panel"><h2>Books</h2><div className="list">{books.map((book, i) => <button key={`${book.sourceId}-${book.id}-${i}`} className={'item ' + (selectedBook === book ? 'selected' : '')} onClick={() => loadToc(book)}><div className="item-title">{book.name}</div><div className="item-sub">{book.author || '未知作者'} · {book.id}</div><div className="item-sub">{book.intro}</div></button>)}</div></section>
          <section className="panel"><h2>Chapters</h2><div className="list">{chapters.map((chapter, i) => <button key={`${chapter.id}-${i}`} className={'item ' + (selectedChapter === chapter ? 'selected' : '')} onClick={() => loadContent(chapter)}><div className="item-title">{chapter.name}</div><div className="item-sub">{chapter.id} {chapter.volumeName ? `· ${chapter.volumeName}` : ''}</div></button>)}</div></section>
        </div>
        <section className="panel"><h2>Content</h2><div className="content">{content ? renderContent(content) : <span className="muted">选择章节后显示正文</span>}</div></section>
        <div className="split">
          <section className="panel"><h2>Trace</h2><pre>{JSON.stringify(trace, null, 2)}</pre></section>
          <section className="panel"><h2>Source Code</h2><pre>{sourceCode}</pre></section>
        </div>
      </main>
    </div>
  </div>
}

function renderContent(content: ContentResult) {
  if (content.format === 'html') return <div dangerouslySetInnerHTML={{ __html: String(content.content) }} />
  if (content.format === 'text') return <pre>{String(content.content)}</pre>
  return <>{(content.content ?? []).map((block: any, i: number) => {
    if (block.type === 'image') return <img key={i} src={block.url} style={{ maxWidth: '100%' }} />
    if (block.type === 'audio') return <audio key={i} src={block.url} controls />
    return <p key={i} className="paragraph">{block.text || block.html || block.message || JSON.stringify(block)}</p>
  })}</>
}

createRoot(document.getElementById('root')!).render(<App />)
