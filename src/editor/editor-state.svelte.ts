import { ACSF_FONTS, ACSF_LICENCE } from '../lib/font/acsf.ts';
import { parseBdf } from '../lib/font/bdf.ts';
import {
  deleteCustomFont,
  listCustomFonts,
  newCustomId,
  putCustomFont,
  requestPersistentStorage,
  type CustomFontRecord,
} from '../lib/font/custom-store.ts';
import { loadFont, type Font, type Glyph } from '../lib/font/font.ts';
import { serializeFont } from '../lib/font/normalise.ts';
import { BUILTIN_FONTS, loadMotifLibrary } from '../lib/font/registry.ts';
import {
  DEFAULT_SYMBOLS,
  DEFAULT_THREADS,
  FONT_SCHEMA,
  FONT_VERSION,
  spaceKey,
  type FontFile,
  type GlyphDef,
  type GlyphType,
} from '../lib/font/schema.ts';
import { validateFont } from '../lib/font/validate.ts';

export type Tool = 'X' | 'O' | 'o' | '/' | 'N' | 'erase' | 'line' | 'knot';

interface Patch {
  key: string;
  before: GlyphDef | undefined;
  after: GlyphDef | undefined;
}

const clone = <T>(v: T): T => structuredClone(v);

export function blankFont(id: string, name: string): FontFile {
  const glyphs: Record<string, GlyphDef> = {};
  for (let n = 1; n <= 4; n++) glyphs[spaceKey(n)] = { type: 'space', width: n - 1 };
  return {
    schema: FONT_SCHEMA,
    version: FONT_VERSION,
    id,
    name,
    kind: 'cross',
    metrics: { ascent: 8, descent: 3, xHeight: 5, letterSpacing: 1, lineGap: 0 },
    threads: [...DEFAULT_THREADS],
    symbols: { ...DEFAULT_SYMBOLS },
    glyphs,
    source: { origin: 'handmade', licence: 'All rights reserved by the author of the font.' },
  };
}

/** The font kind from the glyphs: cross, backstitch or mixed. */
function kindOf(file: FontFile): FontFile['kind'] {
  const defs = Object.values(file.glyphs).filter((g) => g.type === 'char');
  const cells = defs.some((d) => d.rows?.length);
  const lines = defs.some((d) => d.lines?.length);
  return cells && lines ? 'mixed' : lines ? 'backstitch' : 'cross';
}

export class EditorState {
  records = $state.raw<CustomFontRecord[]>([]);
  fontId = $state<string | null>(null);
  /** The open font when it is editable (JSON). */
  file = $state<FontFile | null>(null);
  /** The open font when it is a TTF font (not editable). */
  ttf = $state.raw<Extract<CustomFontRecord, { type: 'ttf' }> | null>(null);
  glyphKey = $state<string | null>(null);
  tool = $state<Tool>('X');
  sample = $state('The quick brown fox jumps over the lazy dog');
  neighbours = $state('n');
  motifs = $state.raw<ReadonlyMap<string, Glyph>>(new Map());
  status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  message = $state<string | null>(null);

  private undoStack: Patch[] = [];
  private redoStack: Patch[] = [];
  private strokeBefore: { key: string; def: GlyphDef | undefined } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  canUndo = $state(false);
  canRedo = $state(false);

  /** The runtime font of the open file, for the previews. */
  font = $derived.by((): Font | null => {
    if (!this.file) return null;
    const snap = $state.snapshot(this.file) as FontFile;
    return validateFont(snap).length ? null : loadFont(snap);
  });

  glyph = $derived(this.file && this.glyphKey ? (this.file.glyphs[this.glyphKey] ?? null) : null);

  async init(): Promise<void> {
    this.motifs = await loadMotifLibrary();
    await this.refresh();
    const want = new URLSearchParams(location.hash.slice(1)).get('font');
    const first = this.records.find((r) => r.id === want) ?? this.records[0];
    if (first) this.open(first.id);
    void requestPersistentStorage();
  }

  async refresh(): Promise<void> {
    this.records = await listCustomFonts();
  }

  open(id: string): void {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) return;
    this.flushSave();
    this.fontId = id;
    this.undoStack = [];
    this.redoStack = [];
    this.syncUndo();
    if (rec.type === 'json') {
      this.file = clone(rec.file);
      this.ttf = null;
      const keys = Object.keys(rec.file.glyphs);
      this.glyphKey =
        keys.find((k) => k === 'a') ?? keys.find((k) => rec.file.glyphs[k]!.type !== 'space') ?? null;
    } else {
      this.file = null;
      this.ttf = rec;
      this.glyphKey = null;
    }
    history.replaceState(null, '', `#font=${encodeURIComponent(id)}`);
  }

  private async addRecord(rec: CustomFontRecord): Promise<void> {
    await putCustomFont(rec);
    await this.refresh();
    this.open(rec.id);
  }

  async newFont(): Promise<void> {
    const id = newCustomId();
    await this.addRecord({
      type: 'json',
      id,
      name: 'My font',
      file: blankFont(id, 'My font'),
      updatedAt: Date.now(),
    });
    this.glyphKey = null;
  }

  /** Copies a built-in font into an editable font. A TTF font loses its joins and ligatures. */
  async duplicate(entryId: string): Promise<void> {
    const entry = BUILTIN_FONTS.find((f) => f.id === entryId);
    if (!entry) return;
    const id = newCustomId();
    const acsf = ACSF_FONTS.find((f) => f.id === entryId);
    let file: FontFile;
    if (acsf) {
      const [{ ttfToFontFile }, bytes] = await Promise.all([
        import('../lib/font/ttf.ts'),
        fetch(new URL(acsf.file, document.baseURI)).then((r) => r.arrayBuffer()),
      ]);
      // The SIL OFL does not allow the reserved font name on a changed font: the copy gets another name.
      const name = `${acsf.name.replace(/^ACSF /, '')} (my copy)`;
      file = ttfToFontFile(new Uint8Array(bytes), { id, name, licence: `${ACSF_LICENCE} Changed copy.` });
      file.source = {
        origin: 'handmade',
        basedOn: `${acsf.name} (SIL Open Font License 1.1)`,
        licence: `SIL Open Font License 1.1. Based on ${acsf.name}. ${ACSF_LICENCE}`,
      };
    } else {
      const font = await entry.load();
      file = clone(font.file);
      file.name = `${font.name} (my copy)`;
      file.source = { origin: 'handmade', basedOn: font.name, licence: font.licence };
    }
    file.id = id;
    file.kind = kindOf(file);
    await this.addRecord({ type: 'json', id, name: file.name, file, updatedAt: Date.now() });
    this.message = acsf
      ? 'The copy has the basic form of each letter. The joins and the ligatures of the TTF font are not in the copy.'
      : null;
  }

  /** Imports a .font.json, .bdf or .ttf/.otf file. */
  async importFile(f: File): Promise<void> {
    const id = newCustomId();
    const lower = f.name.toLowerCase();
    const base = f.name.replace(/\.(font\.json|json|bdf|ttf|otf)$/i, '');
    try {
      if (lower.endsWith('.json')) {
        const raw = JSON.parse(await f.text()) as unknown;
        const issues = validateFont(raw);
        if (issues.length)
          throw new Error(
            issues
              .slice(0, 5)
              .map((i) => `${i.path}: ${i.message}`)
              .join('\n'),
          );
        const file = raw as FontFile;
        file.id = id;
        await this.addRecord({ type: 'json', id, name: file.name, file, updatedAt: Date.now() });
      } else if (lower.endsWith('.bdf')) {
        const file = parseBdf(await f.text(), { id, name: base });
        await this.addRecord({ type: 'json', id, name: file.name, file, updatedAt: Date.now() });
      } else if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const [{ detectTtfGrid }, { openFont }] = await Promise.all([
          import('../lib/font/ttf.ts'),
          import('../lib/font/fontkit.ts'),
        ]);
        const fk = openFont(bytes);
        detectTtfGrid(fk);
        const licence = fk.copyright ?? 'See the licence of the font file.';
        await this.addRecord({
          type: 'ttf',
          id,
          name: fk.familyName || base,
          bytes,
          licence,
          updatedAt: Date.now(),
        });
      } else {
        throw new Error('Use a .font.json, .bdf, .ttf or .otf file.');
      }
      this.message = `Imported ${f.name}.`;
    } catch (e) {
      this.message = `Could not import ${f.name}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Converts the open TTF font into an editable font (without its joins and ligatures). */
  async convertTtf(): Promise<void> {
    const rec = this.ttf;
    if (!rec) return;
    const { ttfToFontFile } = await import('../lib/font/ttf.ts');
    const id = newCustomId();
    const file = ttfToFontFile(rec.bytes, { id, name: `${rec.name} (editable)`, licence: rec.licence });
    file.source = { origin: 'handmade', basedOn: rec.name, licence: rec.licence };
    await this.addRecord({ type: 'json', id, name: file.name, file, updatedAt: Date.now() });
  }

  exportJson(): { name: string; text: string } | null {
    if (!this.file) return null;
    const snap = $state.snapshot(this.file) as FontFile;
    return {
      name: `${snap.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'font'}.font.json`,
      text: serializeFont(snap),
    };
  }

  async deleteCurrent(): Promise<void> {
    if (!this.fontId) return;
    clearTimeout(this.saveTimer);
    await deleteCustomFont(this.fontId);
    this.fontId = null;
    this.file = null;
    this.ttf = null;
    await this.refresh();
    const next = this.records[0];
    if (next) this.open(next.id);
    else history.replaceState(null, '', location.pathname);
  }

  // Glyph edits, with undo.

  beginStroke(): void {
    if (!this.file || !this.glyphKey) return;
    this.strokeBefore = {
      key: this.glyphKey,
      def: clone($state.snapshot(this.file.glyphs[this.glyphKey])) as GlyphDef | undefined,
    };
  }

  /** Applies an edit to the selected glyph. Inside a stroke, the undo entry is made at the end. */
  edit(fn: (def: GlyphDef) => GlyphDef): void {
    if (!this.file || !this.glyphKey) return;
    const key = this.glyphKey;
    const before = this.file.glyphs[key];
    if (!before) return;
    const prev = clone($state.snapshot(before)) as GlyphDef;
    const next = fn(prev);
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    this.file.glyphs[key] = next;
    if (!this.strokeBefore) this.push({ key, before: prev, after: clone(next) });
    this.touch();
  }

  endStroke(): void {
    const s = this.strokeBefore;
    this.strokeBefore = null;
    if (!s || !this.file) return;
    const after = clone($state.snapshot(this.file.glyphs[s.key])) as GlyphDef | undefined;
    if (JSON.stringify(after) !== JSON.stringify(s.def)) this.push({ key: s.key, before: s.def, after });
  }

  addGlyph(key: string, type: GlyphType = 'char'): boolean {
    if (!this.file || !key) return false;
    if (!this.file.glyphs[key]) {
      const def: GlyphDef = {
        type,
        width: type === 'motif' ? 7 : Math.max(1, this.file.metrics.xHeight - 1),
      };
      this.file.glyphs[key] = def;
      this.push({ key, before: undefined, after: clone(def) });
      this.touch();
    }
    this.glyphKey = key;
    return true;
  }

  removeGlyph(key: string): void {
    if (!this.file?.glyphs[key]) return;
    const before = clone($state.snapshot(this.file.glyphs[key])) as GlyphDef;
    delete this.file.glyphs[key];
    this.push({ key, before, after: undefined });
    if (this.glyphKey === key) this.glyphKey = null;
    this.touch();
  }

  private apply(key: string, def: GlyphDef | undefined): void {
    if (!this.file) return;
    if (def) this.file.glyphs[key] = clone(def);
    else delete this.file.glyphs[key];
    this.glyphKey = def ? key : this.glyphKey === key ? null : this.glyphKey;
    this.touch();
  }

  undo(): void {
    const p = this.undoStack.pop();
    if (!p) return;
    this.redoStack.push(p);
    this.apply(p.key, p.before);
    this.syncUndo();
  }

  redo(): void {
    const p = this.redoStack.pop();
    if (!p) return;
    this.undoStack.push(p);
    this.apply(p.key, p.after);
    this.syncUndo();
  }

  private push(p: Patch): void {
    this.undoStack.push(p);
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.syncUndo();
  }

  private syncUndo(): void {
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
  }

  /** Marks the font as changed and saves it after a short delay. */
  touch(): void {
    if (!this.file) return;
    this.file.kind = kindOf(this.file);
    this.status = 'saving';
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 600);
  }

  flushSave(): void {
    if (this.status === 'saving') {
      clearTimeout(this.saveTimer);
      void this.save();
    }
  }

  private async save(): Promise<void> {
    if (!this.file || !this.fontId) return;
    const file = $state.snapshot(this.file) as FontFile;
    const issues = validateFont(file);
    if (issues.length) {
      this.status = 'error';
      this.message = issues
        .slice(0, 3)
        .map((i) => `${i.path}: ${i.message}`)
        .join('\n');
      return;
    }
    try {
      await putCustomFont({ type: 'json', id: this.fontId, name: file.name, file, updatedAt: Date.now() });
      this.status = 'saved';
      this.records = this.records.map((r) => (r.id === this.fontId ? { ...r, name: file.name } : r));
    } catch (e) {
      this.status = 'error';
      this.message = e instanceof Error ? e.message : String(e);
    }
  }
}
