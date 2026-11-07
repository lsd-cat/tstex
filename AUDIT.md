# AUDIT

Findings from porting. The port reproduces TeX's behaviour, bugs included; entries here are documentation, not a fix list. See PLAN.md → Auditing the original.

## Quirks (behaviour macros depend on)

- `\expandafter`/`\csname`: an undefined name inside `\csname…\endcsname` becomes `\relax` silently; no "Undefined control sequence". (§372)
- `\divide` rounds toward zero on negative operands; `x_over_n` keeps the remainder's sign separately. (§106)
- `scan_keyword` in pdftex restores `cur_cs` when the keyword does not match; tex.web does not. Affects `\show` context after a failed unit keyword. (pdftex.web)
- `\pdfoptionpdfminorversion` is a synonym sharing `\pdfminorversion`'s code; `\show` prints `\pdfminorversion`.
- `\expanded` and `\ifpdfprimitive` exist in plain `-ini`; `\ifpdfabsnum`/`\ifpdfabsdim`, `\predisplaydirection`, `\unexpanded`, `\detokenize` only in e‑TeX mode.
- The frozen `\pdfprimitive` entry has `eq_type = ignore_spaces`, `chr = 1`; the real `\pdfprimitive` is `no_expand`, `chr = 1`.
- INITEX already sets `\pdfhorigin`, `\pdfvorigin`, `\pdfpxdimen` (1bp), `\pdfcompresslevel=9`, `\pdfminorversion=4` etc. (pdftex.web §32a); a `-ini` log therefore depends on pdftex defaults, not only tex.web's.
- `input_ln` (web2c): a line ends at LF, CR or CRLF; trailing spaces are stripped, tabs kept.
- `show_context` (pdftex/e‑TeX): the "bottom line" test is `name > 19`, and non‑top levels use `line_stack[index+1]`.
- `show_context` stops at the innermost *file* level: an error inside a file `\input` from another file shows only the inner `l.N` line, never the outer file's line. (§311)
- `\endinput` only sets `force_eof`; the rest of the current line is still read, including tokens after `\endinput`. (§362, §378)
- `\read` from a closed or out-of-range stream (n<0 or n>15 → `<read *>`) is a terminal read and a fatal error in batch/nonstop mode, after `begin_file_reading` has pushed the `<read n>` level, so the context shows an empty `<read n>` line. (§483–484)
- `\read` at end of file with unbalanced braces: "Runaway definition?" (scanner_status is `defining`), then "File ended within \read"; the stream closes, `limit:=0` is immediately overwritten by `limit:=last`. (§486)
- `\openin16`: "Bad number (16)" then the file opens on stream 0. (§1275)
- `\errmessage` long help is shown once per job (`long_help_seen`); with a non-empty `\errhelp` the help is the token list, printed after a `print_ln`, and `\newlinechar` applies. (§1283, §90)
- `\the\ignorespaces` (pdftex's `ignore_spaces:` trap in `scan_something_internal`, §413): with `chr=0` nothing happens, no error, and `cur_val`/`cur_val_level` keep whatever the previous scan left (`\count0=42 \showthe\ignorespaces` shows `42`).
- `line_break` turns a final glue node into the `\penalty10000` in place (§816): the penalty keeps the glue's subtype byte (invisible in `\showbox`).
- The page builder and `fire_up` write eqtb directly, outside the save stack: `\splittopskip` is set to each split insertion's `split_top_ptr` and restored, `\vbadness`/`\vfuzz` are forced to 10000/`\maxdimen` while `\box255` is packed, and `\leftskip`/`\rightskip` with infinite shrink are replaced in eqtb by their finite copies (§827, §1014, §1017, §1021).
- `\box n` for an insertion class starts as an empty *hbox* (`new_null_box`) while it acts as a queue, and is repacked as a vbox only when its last insertion is wrapped up (§1018, §1021).
- `\pagegoal` reads `\maxdimen` and the other page dimensions read 0 while the page is empty and no output is active (§421); `\pagedepth`=… etc. assign `page_so_far` even then, and the next box overwrites it.
- DVI font numbers above 256 use `fnt_def2`/`fnt2` (`fnt_def1+1`/`fnt1+1`) with a two-byte number (tex.ch [32.602], [32.621]). Oracle `m2-review-dvi-fonts`.
- `\font\x=name scaled n` whose size would reach 2048pt (or overflow `xn_over_d`) gives "Font \x=name scaled n scaled to 2048pt or higher" and keeps the design size; the "already loaded" test treats an `arith_error` as no match (tex.ch [30.568], [49.1260]). Oracle `m2-review-font-2048` (uses `test/texmf/big100.tfm`).

## Known bugs in the original

- Signed 32-bit overflow in §100–108 is undefined behaviour in C; pdftex's binaries wrap, and we reproduce what they print (oracle `m1-review-int-wrap`, unit `arith.test.ts`). `xn_over_d`'s `u:=(x div @'100000)*n+…` wraps (`\count1=2147483647 \dimen0=0.99999\count1` gives `-0.5pt`, no error), and `x_over_n(-2^31, 2)` negates `-2^31` to itself (`\divide` gives `1073741824`). The compiler's UB optimisations are not uniform, so neither are we: in `xn_over_d` the negated `-2^31` behaves as unsigned `2^31`; in `mult_and_add` `-(-2^31)` does not wrap (`\multiply` by `-1` reports "Arithmetic overflow"); and §448's `abs(cur_val)>=@'10000000000` treats `abs(-2^31)` as large ("Dimension too large"). `half`'s `x+1` wraps (not observable yet). The same holds for the page builder, line breaker and shipout: `cur_height-h` (§975), `page_total-page_goal` (§1007), `height+r.height` and `dimen n-height` for insertions (§1008, §1010) and the huge-page sums `height+depth+v_offset`, `width+h_offset` (§641) wrap to 32 bits before the comparison (oracles `m2-review-page-wrap`, `m2-review-huge-page`). `abs` is again not uniform: `last_special_line:=abs(hang_after)` stores `-2^31` (§849, `\hangafter=-2^31` gives a full-width first line), while `abs(x)>=c` tests treat `abs(-2^31)` as large: `\penalty-2^31` in a paragraph is a forced break (§831), `\linepenalty=-2^31` gives `d=100000000` (§859), and `\adjdemerits=-2^31` takes the `awful_bad-1` branch (§836). Oracle `m2-review-abs-wrap`.

## pdftex vs tex.web

- Command codes and the eqtb layout follow pdftex.web: `max_command = 102`, which shifts every expandable command code relative to tex.web. pdftex's integer/dimen/token parameters and e‑TeX's slots have real eqtb places.
- `undefined_control_sequence = frozen_null_font + 257` in tex.web; pdftex uses `font_max`. We follow pdftex's layout.
- `hash_size` is tex.ch's 15000 plus TeX Live's `hash_extra = 600000`, kept as one block. No hash function is replicated: names live in two `Map`s.
- `\ifeof18` (tex.ch) is `not shellenabledp`. pdftex runs with restricted shell escape, so it is false; we report shell escape as enabled for log compatibility although no `\write18` exists.
- `print` (§59) of an unprintable character: the pdftex binary does not set `new_line_char:=-1` while printing the `^^` form, so each of its characters can become a line break (`\newlinechar=`Z \message{^^Z}` prints `^^` and a newline), although pdftex.web still shows the `nl` save/restore. We follow the binary.
- Expansion depth limit of 10000 (`expand_depth`, tex.ch) is enforced. Capacities printed in overflow messages and the stats block follow TeX Live's texmf.cnf: `stack_size=10000`, `param_size=20000`, `save_size=200000`, `buf_size=200000`, `max_in_open=15`, `nest_size=1000`, hash `15000+600000`.

- TeX Live builds pdftex with `unbalanced-braces.ch` (David Fuchs, 2024; not in `pdftex.web`, not applied to Knuth's `tex`). `back_input` (§325) and the macro-body feed (§390) never pop an exhausted `output_text` level, so after a scan inside `\output` backs up the routine's closing `}`, error contexts show the finished `<output> {…}` line (and any exhausted levels below it, e.g. a macro that triggered the page break). `end_token_list` on an `output_text` level is `fatal_error("Unbalanced output routine")` unless §1026 allows it (`output_can_end`); §1026 first pops exhausted `backed_up` levels and then insists on a finished `output_text` level. The changefile's `\write` half (`end_write` while scanning a write text is fatal; §1371's `mode:=old_mode` moved before the final `get_token`) is not ported. Oracles `m2-review-output-level`, `m2-review-output-unbalanced`.

## Port deviations (deliberate; each has a `// §NNN` or `shortcut:` comment in code)

- Token memory is numeric `info`/`link` arrays with a free list; `null = 0`, fixed heads `temp_head=1, hold_head=2, backup_head=3, garbage=4`. `get_avail` zeroes `info` (TeX does not; harmless).
- No string pool. `print_cs` on an empty slot prints `^^@` as TeX's `text = 0` would. `new_string` selector writes into `Engine.cur_str`.
- Glue specs are TS objects in `Engine.spec[]` addressed by integer; `zero_glue = 0 = null`, as in tex.web.
- Interaction is always batch mode: no dialog, `term_input`, interrupts or `pause_for_instructions`.
- `jump_out` is a thrown exception caught by `run()`, which then calls `close_files_and_terminate` (as tex.ch).
- `\pdftexversion` returns 140.
- `scan_register_num` is `scan_eight_bit_int`; no sparse (e‑TeX) registers.
- e‑TeX‑mode‑only machinery not ported yet: `group_warning`, `if_warning`, `grp_stack`/`if_stack`, `\tracingassigns`/`\tracinggroups`/`\tracingifs` hooks. Registered via `etex_primitives` only when `init_prim(e, true)` runs (M4).
- `handle_right_brace` calls `confusion` for align, no_align, math, vcenter and math_choice groups (none can be opened before M3).
- `ignore_spaces` with `chr = 1` (frozen `\pdfprimitive`) inside `scan_something_internal` is unsupported; pdftex resets the token and rescans.
- `nodeFS` refuses names containing `..` (no path escape from the roots).
- File names (tex.ch): `scan_file_name` keeps `cur_name/cur_area/cur_ext` as JS strings; `"` toggles quoting and is dropped; area ends at the last `/`, extension starts at the last `.` after it. Braced names (`\input{...}`, `scan_file_name_braced`) are unsupported. Lookup tries `name.tex` then `name` unless the extension is `.tex` (kpathsea order); the name printed after `(` is `./` + the name found (`shortcut:` every `nodeFS` root is treated as the cwd, as kpathsea prints a cwd hit; an ls-R texmf root (M5) must report the real path, which changes the 79-column wrap positions). `in_name_ok` (openin_any) is not checked beyond `nodeFS`'s `..` rule.
- `prompt_file_name` and terminal `\read` always end in `fatal_error`; in scroll/errorstop mode that would be a terminal prompt, which is `unsupported: terminal input`.
- The command-line file goes through the real `start_input`/`scan_file_name` on the `**` line; a missing main file now gives TeX's "I can't find file" + fatal error instead of a JS exception.
- `\csname` does not track `is_in_csname` (only `\ifincsname`, e‑TeX, reads it). `\pdfprimitive`, `\scantokens`, `\readline` remain unsupported.
- Expansion depth: the JS stack runs out after roughly 1500 nested `expand` calls (node's default stack), far below `expand_depth=10000`. Past depth 100 `expand` probes for JS stack headroom and reports `TeX capacity exceeded, sorry [expansion depth=10000]` in the same state pdftex would, so the log matches pdftex's for runaway recursion; legitimate nestings between ~1500 and 9999 levels (e.g. `\message{` + 2000×`\number` + `1}`) fail where pdftex succeeds. `Engine.run` also maps any stray `RangeError` stack overflow to that message.
- `\tracingstats>0` at the end prints §1334's memory block (pdftex/tex.ch form, `15000+600000` hash) with this engine's own figures: 0 strings and string characters (no pool), token-memory high water for "words of memory", `cs_count`, and the real `max_in_stack`/`max_param_stack`/`max_buf_stack`/`max_save_stack` against TeX Live's sizes; nest is 0 until M2. `tools/normalize-log.ts` drops the block (from "Here is how much…" to "… stack positions out of …") on both sides since the figures depend on mem/pool sizes.
- `\pdfoutput>0` at the end (pdftex `close_files_and_terminate`): after a fatal error `!  ==> Fatal error occurred, no output PDF file produced!`; otherwise "No pages of output." plus the four-line "PDF statistics" block, whose figures are constant while no page or PDF object can exist (not normalised). `fix_pdfoutput` is implicit: nothing can be shipped yet, so `\pdfoutput` is read at the end.
- Banner is `This is tstex, Version 3.141592653 (INITEX)  <date>`; no `restricted \write18` line, no `SOURCE_DATE_EPOCH`.

### M2 pass 1 (nodes, TFM, packaging, main loop, DVI)

- `\font` drops a `.tfm` extension from the name; TFM names longer than 255 characters give "file name too long"; a truncated TFM is a bad metric file.
- `\tracinglostchars>2` makes a missing character an error (TeX Live), with no help text.
- `\pdfignoreddimen` replaces `ignore_depth` everywhere `prev_depth` is tested (pdftex).
- The `?.?` glue-set display (§186) reads the high 32 bits of the double, as web2c's `mem[p+glue_offset].int` does on little-endian machines.
- `character(tail)` in the main loop (§1034) reads the subtype byte of a non-char tail, as TeX's memory layout does.
- `\special shipout{…}` (pdftex) delays expansion to shipout.
- `\closeout`/`\write` use `scan_int` and map out-of-range streams to 16/17, `\openout` uses `scan_four_bit_int`; `\write18` is its own stream and always logs `runsystem(…)...disabled (restricted).`
- DVI output simulates TeX Live's 16384-byte half-buffered `dvi_buf`, because the `y`/`z` movement optimisation (§611) depends on `dvi_gone`.
- `undefined_control_sequence = frozen_null_font + 9001` (tex.ch's `max_font_max+1`).
- Box registers (and every node pointer kept in eqtb or on the save stack) are integer handles into `Engine.nodes[]`; list heads are char nodes so `is_char_node(head)` holds as in tex.web.
- `\openout` names are checked with an approximation of `openout_any=p`.
- `\tracingstats>1` at shipout prints zero memory figures (no `mem` array).

### M2 pass 2 (line breaking, hyphenation, page builder)

- Active, passive and delta nodes of `line_break` are TS objects (a delta node keeps its six differences in `w[1..6]`); `temp_head`, `hold_head` and the active-list sentinel are per-call objects. `page_head` is a glue-typed object so an initial page glue is not a breakpoint (§988).
- `\parshape` values live in `Engine.shapes[]` as `[n, i1, l1, …]`; `par_shape_loc` holds a handle (0 = null). Handles are not reused (`shortcut:` grows by one array per `\parshape` assignment; reuse freed slots if a document assigns it in a loop).
- `\pdfadjustspacing` or `\pdfprotrudechars` non-zero at a paragraph end stops with `unsupported:`; `\pdfeachlineheight` and friends are honoured (§888). e-TeX's `\lastlinefit`, `\interlinepenalties`/`\clubpenalties`/`\widowpenalties` arrays, `\savinghyphcodes` (so `hyph_index` is always 0), `\savingvdiscards`, `\marks` classes and `\interactionmode` are not ported (e-TeX mode, M4).
- Hyphenation exceptions are a `Map` keyed by the word plus language: tex.ch's `hyph_link` chaining only decides where an entry sits, so lookups and `hyph_count` (repeated words replace and do not count, tex.ch §940) are unaffected; the `hyph_size=8191` overflow is kept.
- `\patterns`: `new_trie_op`'s and `trie_node`'s open-addressing hash tables are `Map`s (both return the first equal entry, so op codes and the compressed trie are identical); `first_fit`, `trie_pack`, `trie_fix` and the op sort are ported as is, with `trie_size=1000000`, `trie_op_size=35111`, 65535 ops per language and `max_op_used` (printed only by `\dump`, M5). web2c stores `trie_back` in `trie_op`; here it has its own array (holes are cleared before use, so this is invisible).
- `\patterns` is always INITEX: pdftex's "Patterns can be loaded only by INITEX" path is unreachable; after the first paragraph that needs hyphenation it gives "Too late for \patterns".
- `Engine.terminal` collects what TeX prints to the terminal; under the forced batch mode that is next to nothing (the log is complete).

## Harness

- `.gitignore` ignored `*.dvi`, so the `.expected.dvi` files the harness compares were never committed and a fresh checkout skipped every DVI comparison; `!*.expected.dvi` now keeps them.

## Security

- `nodeFS.find` rejects any path component `..`; roots are the only readable directories. Test: pending (`test/unit/security.test.ts`, M5).
- No `\write18`, no shell escape primitive registered as functional.
