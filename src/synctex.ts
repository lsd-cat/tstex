// The SyncTeX controller: texk/web2c/synctexdir/synctex.c (spec/synctex.c, pdftex build: synctex-pdftex.h), the C side of
// the synctex-*.ch hooks. It writes \jobname.synctex(.gz); the coordinates are sp (unit 1). Functions keep synctex.c's names.
import type { Engine } from './engine.ts'
import type { Node, BoxNode, RuleNode, GlueNode, KernNode, MathNode } from './nodes.ts'
import { int_base, batch_mode } from './types.ts'
import { synctex_code } from './eqtb.ts'
import { crc32 } from './backend/images.ts'

const NO_OPTION = 2147483647 // SYNCTEX_NO_OPTION = INT_MAX: no -synctex on the command line
type Synced = BoxNode | RuleNode | GlueNode | KernNode | MathNode

export function synctex_state() {
  return {
    option: NO_OPTION, // synctexoption, from -synctex=N
    out: null as string[] | null, // the open file (SYNCTEX_FILE); chars are bytes
    root_name: null as string | null, count: 0, node: null as Node | null, recorder: false, // a kern record is pending (the only recorder synctex.c ever leaves set)
    tag: 0, line: 0, curh: 0, curv: 0, magnification: 0, total_length: 0, options: 0, lastv: -1, form_depth: 0, tag_counter: 0,
    option_read: false, content_ready: false, off: false, no_gz: false, not_void: false, warn: false,
  }
}

const value = (e: Engine) => e.equiv[int_base + synctex_code]! // SYNCTEX_VALUE
const with_forms = (e: Engine) => (e.stx.options & 4) !== 0

// SYNCTEX_fprintf: returns the byte count, which feeds total_length (the "!" anchors)
function out(e: Engine, s: string): number { e.stx.out!.push(s); return s.length }
function rec(e: Engine, s: string): void { const x = e.stx; x.total_length += out(e, s); x.count++ } // SYNCTEX_RECORD_LEN_AND_RETURN
// "h,v", or "h,=" when option 8 is set and lastv equals cmp (SYNCTEX_SHOULD_COMPRESS_V compares the context's v)
function hv(e: Engine, h: number, v: number, cmp = v): string {
  if ((e.stx.options & 8) !== 0 && e.stx.lastv === cmp) return `${h},=`
  e.stx.lastv = v; return `${h},${v}`
}

// _synctex_read_command_line_option, one shot
function read_command_line_option(e: Engine): void {
  const x = e.stx
  if (x.option_read) return
  if (x.option === NO_OPTION) e.equiv[int_base + synctex_code] = 0
  else if (x.option === 0) { x.off = true; e.equiv[int_base + synctex_code] = 0 }
  else {
    if (x.option < 0) { x.no_gz = true; x.options = -x.option } else { x.no_gz = false; x.options = x.option }
    x.option |= 1
    e.equiv[int_base + synctex_code] = x.option
  }
  x.option_read = true
}

// synctexinitcommand, at `history:=spotless'
export function synctex_init_command(e: Engine): void { read_command_line_option(e) }

// synctexabort: close and remove the file, disable synctex
export function synctex_abort(e: Engine): void {
  e.stx.out = null; e.stx.root_name = null; e.stx.off = true
}

// synctex_dot_open
function dot_open(e: Engine): string[] | null {
  const x = e.stx
  if (x.off || value(e) === 0) return null
  if (x.out) return x.out
  read_command_line_option(e)
  if (e.job_name === '') { e.terminal += '\nSyncTeX information: no synchronization with keyboard input\n'; synctex_abort(e); return null }
  x.out = []
  x.total_length = out(e, `SyncTeX Version:${x.options > 1 ? x.options : 1}\n`) // synctex_record_preamble
  if (x.magnification === 0) x.magnification = 1000
  if (x.root_name !== null) { record_input(e, 1, x.root_name); x.root_name = null }
  x.count = 0
  return x.out
}

// synctex_prepare_content: the settings need pdf or dvi, known at the first sheet or form
function prepare_content(e: Engine, pdf: boolean): string[] | null {
  const x = e.stx
  if (x.content_ready) return x.out
  if (dot_open(e) !== null) {
    x.total_length += out(e, `Output:${pdf ? 'pdf' : 'dvi'}\nMagnification:${x.magnification}\nUnit:1\nX Offset:${pdf ? 0 : 4736287}\nY Offset:${pdf ? 0 : 4736287}\n`)
    x.total_length += out(e, 'Content:\n')
    x.content_ready = true
    return x.out
  }
  synctex_abort(e)
  return null
}

function record_input(e: Engine, tag: number, name: string): void { e.stx.total_length += out(e, `Input:${tag}:${name}\n`) }
function record_anchor(e: Engine): void { const x = e.stx; x.total_length = out(e, `!${x.total_length}\n`); x.count++ }

// synctexstartinput: a new tag for every file start_input opens; `name' is the name as found (fullnameoffile), made
// absolute with Engine.cwd as generic_synctex_get_current_name does (left relative when cwd is '')
export function synctex_start_input(e: Engine, name: string): void {
  const x = e.stx
  read_command_line_option(e)
  if (x.off) return
  x.tag_counter++
  e.cur_input.synctex_tag = x.tag_counter
  const full = name.startsWith('/') || e.cwd === '' ? name : e.cwd + '/' + name
  if (x.tag_counter === 1) { x.root_name = full || 'texput'; return }
  if (x.out || dot_open(e) !== null) record_input(e, x.tag_counter, full) // always, even when \synctex=0 now
}

// synctexterminate: the postamble, and the file becomes Engine.synctex when it holds a box
export function synctex_terminate(e: Engine, log_opened: boolean): void {
  const x = e.stx
  if (log_opened && x.out && x.not_void) {
    record_anchor(e); x.total_length += out(e, 'Postamble:\n')
    x.total_length += out(e, `Count:${x.count}\n`); record_anchor(e)
    x.total_length += out(e, 'Post scriptum:\n')
    const data = Uint8Array.from(x.out.join(''), c => c.charCodeAt(0))
    e.synctex = x.no_gz ? data : gzip(e, data)
    e.synctex_name = e.job_name + '.synctex' + (x.no_gz || (x.options & 2) !== 0 ? '' : '.gz')
    if (e.interaction > batch_mode) e.terminal += `\nSyncTeX written on ${e.synctex_name}.` // printf: stdout, not TeX's print
  }
  synctex_abort(e)
}

// gzopen(name, "wb"): a gzip member around zlib's deflate stream (level 6); mtime 0, OS 3
function gzip(e: Engine, d: Uint8Array): Uint8Array {
  if (!e.fs.compress) throw new Error('tstex: \\synctex>0 needs TexFS.compress (gzip); use -synctex=-1')
  const z = e.fs.compress(d, 6), body = z.subarray(2, z.length - 4)
  const r = new Uint8Array(10 + body.length + 8)
  r.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3]); r.set(body, 10)
  const t = new DataView(r.buffer, 10 + body.length)
  t.setUint32(0, crc32(d), true); t.setUint32(4, d.length >>> 0, true)
  return r
}

const disabled_warning = (e: Engine) => {
  if (value(e) !== 0 && !e.stx.warn) {
    e.stx.warn = true
    e.terminal += '\nSyncTeX warning: Synchronization was disabled from\nthe command line with -synctex=0\nChanging the value of \\synctex has no effect.'
  }
}

// synctexsheet, at the start of ship_out (pdf: pdf_output_value>0)
export function synctex_sheet(e: Engine, mag: number, pdf: boolean): void {
  const x = e.stx
  if (x.off) { disabled_warning(e); return }
  if (e.total_pages === 0 && mag > 0) x.magnification = mag
  if (prepare_content(e, pdf) !== null) { record_anchor(e); rec(e, `{${e.total_pages + 1}\n`) }
}

// synctexteehs, at the end of ship_out
export function synctex_teehs(e: Engine): void {
  const x = e.stx
  if (x.off || !x.out) return
  record_anchor(e); rec(e, `}${e.total_pages}\n`)
}

// first SYNCTEX_IGNORE
const ignore = (e: Engine) => e.stx.off || value(e) === 0 || !e.stx.out || (e.stx.form_depth > 0 && !with_forms(e))

// synctexpdfxform: a form ships out (cur_form its object number)
export function synctex_pdfxform(e: Engine, cur_form: number): void {
  const x = e.stx
  if (x.off) { disabled_warning(e); return }
  if (prepare_content(e, true) !== null) {
    if (ignore(e)) return
    x.form_depth++
    if (with_forms(e)) rec(e, `<${cur_form}\n`)
  }
}

// synctexmrofxfdp: the form did ship out
export function synctex_mrofxfdp(e: Engine): void {
  const x = e.stx
  if (!x.out) return
  record_anchor(e); x.form_depth--
  if (with_forms(e)) rec(e, '>\n')
}

// synctexpdfrefxform, in out_form
export function synctex_pdfrefxform(e: Engine, objnum: number): void {
  const x = e.stx
  if (!x.out) return
  x.curh = e.cur_h; x.curv = e.cur_v
  if (ignore(e)) return
  rec(e, `f${objnum}:${hv(e, e.cur_h, e.cur_v)}\n`)
}

function set(e: Engine, p: Synced): void {
  const x = e.stx
  x.node = p; x.tag = p.sync_tag; x.line = p.sync_line; x.curh = e.cur_h; x.curv = e.cur_v; x.recorder = false
}
// "[tag,line:h,v:W,H,D" with the context's h and v
function box_record(e: Engine, c: string, p: BoxNode): void {
  const x = e.stx
  rec(e, `${c}${p.sync_tag},${p.sync_line}:${hv(e, x.curh, x.curv)}:${p.width},${p.height},${p.depth}\n`)
}

// synctexvlist / synctextsilv / synctexhlist / synctextsilh, at the start and end of (pdf_)vlist_out and (pdf_)hlist_out
export function synctex_vlist(e: Engine, b: BoxNode): void { if (ignore(e)) return; set(e, b); e.stx.not_void = true; box_record(e, '[', b) }
export function synctex_tsilv(e: Engine, b: BoxNode): void { if (ignore(e)) return; set(e, b); rec(e, ']\n') }
export function synctex_hlist(e: Engine, b: BoxNode): void { if (ignore(e)) return; set(e, b); e.stx.not_void = true; box_record(e, '(', b) }
export function synctex_tsilh(e: Engine, b: BoxNode): void { if (ignore(e)) return; set(e, b); rec(e, ')\n') }

// Record void list SyncTeX information: synctexvoidvlist / synctexvoidhlist (only the latter flushes a pending kern)
export function synctex_void(e: Engine, p: BoxNode): void {
  if (ignore(e)) return
  if (p.type !== 1 && e.stx.recorder) record_kern(e, e.stx.node!)
  set(e, p); box_record(e, p.type === 1 ? 'v' : 'h', p)
}

const changed = (e: Engine, p: Synced) => e.stx.node === null || p.sync_tag !== e.stx.tag || p.sync_line !== e.stx.line // SYNCTEX_CONTEXT_DID_CHANGE

// synctex_record_node_kern: the context's h and v, which synctexkern does not update
function record_kern(e: Engine, p: Node): void {
  const x = e.stx, k = p as KernNode
  rec(e, `k${k.sync_tag},${k.sync_line}:${hv(e, x.curh, x.curv)}:${k.width}\n`)
}

// synctexmath
export function synctex_math(e: Engine, p: MathNode): void {
  if (ignore(e)) return
  if (e.stx.recorder && changed(e, p)) record_kern(e, e.stx.node!)
  set(e, p)
  rec(e, `$${p.sync_tag},${p.sync_line}:${hv(e, e.stx.curh, e.stx.curv)}\n`)
}

// second SYNCTEX_IGNORE: no file or form test, but a positive tag and line
const ignore_node = (e: Engine, p: Synced) => e.stx.off || value(e) === 0 || p.sync_tag <= 0 || p.sync_line <= 0

// synctexhorizontalruleorglue, at move_past (p may be a kern now); rule_wd/ht/dp are hlist_out's (rule_ht is already height+depth)
export function synctex_horizontal_rule_or_glue(e: Engine, p: RuleNode | GlueNode, rule_wd: number, rule_ht: number, rule_dp: number): void {
  if (ignore_node(e, p)) return
  set(e, p)
  const x = e.stx
  if (p.type === 2) rec(e, `r${p.sync_tag},${p.sync_line}:${hv(e, x.curh, x.curv)}:${rule_wd},${rule_ht},${rule_dp}\n`)
  else if ((p as Node).type === 11) record_kern(e, p) // a glue node round_mixed_glue made a kern
  else rec(e, `g${p.sync_tag},${p.sync_line}:${hv(e, x.curh, x.curv)}\n`)
}

// synctexkern: record when the tag or line changes, but a list's first kern waits (and is dropped unless flushed)
export function synctex_kern(e: Engine, p: KernNode, this_box: BoxNode): void {
  if (ignore_node(e, p)) return
  const x = e.stx
  if (changed(e, p)) {
    if (x.recorder) record_kern(e, x.node!)
    const first = x.node === this_box
    x.node = p; x.tag = p.sync_tag; x.line = p.sync_line
    if (first) x.recorder = true
    else { x.recorder = false; record_kern(e, p) }
  } else { x.node = p; x.tag = p.sync_tag; x.line = p.sync_line; x.recorder = true }
}

// synctexcurrent, after a run of characters: the live h and v with the context's tag and line; not counted
export function synctex_current(e: Engine): void {
  const x = e.stx
  if (x.off || value(e) === 0 || !x.out) return
  x.total_length += out(e, `x${x.tag},${x.line}:${hv(e, e.cur_h, e.cur_v, x.curv)}\n`)
}
