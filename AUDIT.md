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

- `\pdfprimitive` of a non-expandable primitive backs up the token behind the frozen `\pdfprimitive` (an `ignore_spaces` command); inside `\edef` that frozen token is stored and the following control sequence is still expanded by its *current* meaning: `\def\relax{X}\edef\a{\pdfprimitive\relax}` gives `\a=macro:->\pdfprimitive X`. `\pdfprimitive` before a name that is not a primitive (or a character token) silently drops that token. (pdftex.web)
- pdftex.web alone puts `prim_eqtb_base=frozen_primitive+1` past `frozen_null_font`, so the primitives' eqtb copies would overlap the font identifiers; pdftex.ch moves `frozen_null_font` to `frozen_control_sequence+12+prim_size` (tex.ch's `frozen_special` takes +10). The port had `frozen_primitive` on font 1's identifier slot until M3 pass B.
- Test-author note: "Interwoven alignment preambles are not allowed" (§324, §782, §789, §791, §1131) is a fatal error that a clean file cannot reach without `\endtemplate` tricks; pinning it needs a deliberately broken alignment, so no oracle covers it.
- Test-author note: `\everycr{\message{..}}` without `\noalign` loops forever: after each `\cr` the first token of `\everycr` starts a new row (§785 `init_row`), whose `\cr` reinserts `\everycr`. Use `\everycr{\noalign{…}}`.
- A file whose `\par` typesets something loops forever at `\end` in horizontal mode (`head_for_vmode` keeps inserting `\par`); both pdftex and the port spin.

### e‑TeX (M4)

- `\showgroups` reads `saved(-2)` for an insert group, but pdftex's `begin_insert_or_adjust` pushes the `\vadjust pre` flag after the insertion number, so every `\insert n{` and every `\vadjust{` is shown as `\insert0{` (`\insert1` for `\vadjust pre`).
- `show_save_groups` steps through the semantic nest past `nest_ptr` when the bottom group is simple: `nest[1]` is read even at the outer level, i.e. whatever list state was last saved there (zero before any). The port keeps `Engine.nest` entries after `pop_nest` for this.
- `\readline` keeps the end-of-line character: with `\endlinechar=13` each line ends in a catcode-12 `^^M`.
- After the first `\aftergroup` token of a group, later ones are prepended to the same backed-up list (one `<to be read again>` level in error contexts, not one per token).
- `char_warning` with `\tracinglostchars>1` sets `\tracingonline:=1` for `begin_diagnostic` and restores it before `end_diagnostic`, so the message also reaches the terminal and `history` is not raised to `warning_issued`.
- `\interlinepenalties0` (and the other arrays at index 0) returns the number of entries; negative indexes give 0, indexes past the end the last entry.
- `\dump` zeroes `\TeXXeTstate` in the dumped eqtb; `\scantokens` input is flushed.
- An `\edef` of `\scantokens{…}` without `\everyeof{\noexpand}` reads past the pseudo file's end: "File ended while scanning definition".

## Known bugs in the original

- Signed 32-bit overflow in §100–108 is undefined behaviour in C; pdftex's binaries wrap, and we reproduce what they print (oracle `m1-review-int-wrap`, unit `arith.test.ts`). `xn_over_d`'s `u:=(x div @'100000)*n+…` wraps (`\count1=2147483647 \dimen0=0.99999\count1` gives `-0.5pt`, no error), and `x_over_n(-2^31, 2)` negates `-2^31` to itself (`\divide` gives `1073741824`). The compiler's UB optimisations are not uniform, so neither are we: in `xn_over_d` the negated `-2^31` behaves as unsigned `2^31`; in `mult_and_add` `-(-2^31)` does not wrap (`\multiply` by `-1` reports "Arithmetic overflow"); and §448's `abs(cur_val)>=@'10000000000` treats `abs(-2^31)` as large ("Dimension too large"). `half`'s `x+1` wraps (not observable yet). The same holds for the page builder, line breaker and shipout: `cur_height-h` (§975), `page_total-page_goal` (§1007), `height+r.height` and `dimen n-height` for insertions (§1008, §1010) and the huge-page sums `height+depth+v_offset`, `width+h_offset` (§641) wrap to 32 bits before the comparison (oracles `m2-review-page-wrap`, `m2-review-huge-page`). `abs` is again not uniform: `last_special_line:=abs(hang_after)` stores `-2^31` (§849, `\hangafter=-2^31` gives a full-width first line), while `abs(x)>=c` tests treat `abs(-2^31)` as large: `\penalty-2^31` in a paragraph is a forced break (§831), `\linepenalty=-2^31` gives `d=100000000` (§859), and `\adjdemerits=-2^31` takes the `awful_bad-1` branch (§836). Oracle `m2-review-abs-wrap`.

## pdftex vs tex.web

- Command codes and the eqtb layout follow pdftex.web: `max_command = 102`, which shifts every expandable command code relative to tex.web. pdftex's integer/dimen/token parameters and e‑TeX's slots have real eqtb places.
- `undefined_control_sequence = frozen_null_font + 257` in tex.web; pdftex uses `font_max`. We follow pdftex's layout.
- `hash_size` is tex.ch's 15000 plus TeX Live's `hash_extra = 600000`, kept as one block. No hash function is replicated: names live in two `Map`s.
- `\ifeof18` (tex.ch) is `not shellenabledp`. pdftex runs with restricted shell escape, so it is false; we report shell escape as enabled for log compatibility although no `\write18` exists.
- `print` (§59) of an unprintable character disables `\newlinechar` while printing the `^^` form (`\show^^Y` with `\newlinechar=`Y` shows `the character ^^Y`). `\message`/`\errmessage` differ through enctex (enctex1.ch, enctex2.ch): the text is built under `message_printing`, which makes `print` store the `^^` form in the string (and a raw new-line character), and the string is then printed with `print`, i.e. `print_char` per character, so `\newlinechar=`Z \message{^^Z}` prints `^^` and a line break, and the 79-column test counts `^^Z` as three characters. Oracles `m1-review-print-newline`, `m3-trip-newlinechar` (an earlier entry here blamed the binary; trip's `\show^^Y` disproved it).
- trip under TeX Live differs from Knuth's logs only in the ways listed in `test/trip-diffs.md`: `\openout` is logged (tex.ch [53.1374]), §459's help names `nd, nc` (pdftex.web), a repeated `\hyphenation` word does not count in `hyph_count` (tex.ch [42.941]), the §1334 hash line reads `out of 2100+0` (tex.ch), `\dump` prints `words of pdfTeX memory` and `indirect objects` (pdftex.web), and pdftex has more primitives (500 multiletter control sequences at trip's `\dump`, Knuth 341). `unbalanced-braces.ch`'s fatal `Unbalanced write command` is not reached by trip: its write text's extra `}` ends `scan_toks` before `\endwrite` is read, so the old §1372 error and recovery apply (same message, not fatal).
- Expansion depth limit of 10000 (`expand_depth`, tex.ch) is enforced. Capacities printed in overflow messages and the stats block follow TeX Live's texmf.cnf: `stack_size=10000`, `param_size=20000`, `save_size=200000`, `buf_size=200000`, `max_in_open=15`, `nest_size=1000`, hash `15000+600000`.

- TeX Live builds pdftex with `unbalanced-braces.ch` (David Fuchs, 2024; not in `pdftex.web`, not applied to Knuth's `tex`). `back_input` (§325) and the macro-body feed (§390) never pop an exhausted `output_text` level, so after a scan inside `\output` backs up the routine's closing `}`, error contexts show the finished `<output> {…}` line (and any exhausted levels below it, e.g. a macro that triggered the page break). `end_token_list` on an `output_text` level is `fatal_error("Unbalanced output routine")` unless §1026 allows it (`output_can_end`); §1026 first pops exhausted `backed_up` levels and then insists on a finished `output_text` level. The changefile's `\write` half is ported too: reading `\endwrite` from a token list while `mode=0` (still inside the write text's `scan_toks`) is `fatal_error("Unbalanced write command")`, and §1371 restores `mode` before the final `get_token`, so a write text with too many `}`s still gets the old §1372 error and recovery. Oracles `m2-review-output-level`, `m2-review-output-unbalanced`, `m2-ch-write-unbalanced`.

### TeX Live change-file chain (texk/web2c/pdftexdir/am/pdftex.am), one line per file

- `tex.ch0`: reorders tex.ch's integer-parameter block and banner so tex.ch applies to pdftex.web. No behaviour.
- `tex.ch`: web2c system glue; consulted since M1 (file names, capacities, `\ifeof18`, `fnt_def2`, 2048pt font check, …).
- `tracingstacklevels.ch`: `\tracingstacklevels` (int par 58). With it >0, `\tracingmacros` lines get a `~` plus one `.` per `input_ptr` level, and at or beyond the limit only `~~\cs` is printed and the `#n<-` lines are dropped; every `\input` logs `~..INPUT name.ext`. Quirk: a *negative* value suppresses the `#n<-` lines (the test is `tracing_stack_levels=0 or input_ptr<tracing_stack_levels`) but keeps the full macro line. Needed tex.ch's `make_name_string` side effect: after `\input` opens a file, `cur_area`/`cur_name`/`cur_ext` describe the file found (`.tex` included), which also feeds `job_name`. Ported; oracle `m2-ch-tracingstacklevels`.
- `partoken-102.ch`, `partoken.ch`: new command code `partoken_name=103` (`max_command=103`, every expandable code shifts by one) and `\partokencontext` (int par 59). `\partokenname\cs` sets `par_loc`/`par_token` globally (a non-cs token is ignored); the new token is what empty lines emit and what non-`\long` macros reject. `\partokencontext>0` makes `}` of `\vbox`/`\vtop`/`\vcenter` in hmode back up `}` and insert the par token instead of calling `end_graf`; `>1` does the same for `\insert`/`\vadjust`/`\output`/`\noalign` (and `\valign`'s endv). Quirk: the ch adds no `prefixed_command` case, so `\global\partokenname` is `This can't happen (prefix)`. Ported (the align/vcenter/endv cases stay unreachable until M3); oracle `m2-ch-partoken`. The format-file `undump_int(par_loc)` change is M5.
- `locnull-optimize.ch`: drops the redundant `state=token_list` test from `back_input` and §390 (`loc=null` implies it). No observable change; our tests are equivalent.
- `showstream.ch`: `\showstream` (int par 60, initial −1). If it names an open `\openout` stream, `\show`, `\showbox`, `\showthe`, `\showlists` (and e‑TeX's `\showgroups`/`\showifs`/`\showtokens`) print into that file instead, with no `error` call: `common_ending` prints a newline and resets `selector` from `interaction` (+2 if the log is open). `print_nl` always starts a new line on a write stream, so the file starts with an empty line, and `print_err("OK")` lands in the file as `! OK`. Closed/out-of-range streams fall back to the log. Ported; oracle `m2-ch-showstream` (the harness now compares `\jobname.out` with `.expected.out`).
- `zlib-fmt.ch`: gzip-compressed format files. M5 (`\dump`) only.
- `enctex1.ch`, `enctex-pdftex.ch`, `enctex2.ch`: three eqtb slots `xord/xchr/xprn_code_base` after `cur_font_loc` (followed: `math_font_base=cur_font_loc+4`), four int pars 61–64 (`\mubytein`, `\mubyteout`, `\mubytelog`, `\specialout`). Every primitive (`\mubyte`, `\noconvert`, `\endmubyte`, `\xordcode`, …) is created only `if enctex_p`, i.e. with `-enc`; without it they are undefined (`\show\mubyte` → `undefined`, checked against the binary). The always-on code paths (`read_buffer`, `print_buffer`, the `print` and `\message` changes, `write_mubyte`/`mubyte_zero` in write/special nodes) reduce to TeX's behaviour while every mubyte table is empty and the parameters are 0, which they always are without `-enc`. Nothing else ported.
- `unbalanced-braces.ch`: both halves ported (see the entry above).
- synctex set (`synctex-def.ch0`, `-mem.ch0`, `-e-mem.ch0/1`, `-rec.ch0/1`, `-e-rec.ch0`, `-pdf-rec.ch2`): `\synctex` int par, always defined, at `etex_int_pars` (113, after e‑TeX's state); extra node fields (memory statistics only) and recording hooks in `ship_out`/`hlist_out`/`vlist_out` that do nothing while `\synctex=0`. pdftex writes no log line for synctex; with `\synctex≠0` at a shipout it writes `\jobname.synctex.gz`, so we stop with `unsupported: synctex` there. Oracle `m2-ch-synctex`.
- `pdftex.ch`: build glue (pdfTeX banner, array allocation, dump of pdfTeX's font arrays, `-etex` switch). Log-visible only through MLTeX (not enabled in `pdftex -ini`: a missing character in `hlist_out` would now be skipped without warning, unreachable without MLTeX) and the `\font` "already loaded" check being skipped when `pdf_font_step[f]≠0` (font expansion, unsupported). The `\pdfstrcmp`/`\pdffilesize`/`\pdfmdfivesum` etc. implementations live in C (`utils.c`), not here. Ported: the `-etex` switch is `run({ mode: 'etex' })` (`etex_p`), and a first line starting `*` enters e‑TeX mode too (the `*` is skipped).
- `char-warning-pdftex.ch`: `\tracinglostchars>2` makes the missing-character message an error with the hex code and no `!`; ours already matched. Oracle `m2-ch-char-warning` (levels 1–4).
- `tex-binpool.ch`: the string pool is compiled into the binary instead of read from `tex.pool`. No behaviour.
- eqtb integer parameters follow the chain's final order: TeX 0–54, web2c 55–64 (`\charsubdefmin`, `\charsubdefmax`, `\tracingcharsubdef` (MLTeX, never registered in pdftex), `\tracingstacklevels`, `\partokencontext`, `\showstream`, enctex's four), pdfTeX 65–101, e‑TeX 102–112, `\synctex` 113. Only `\dump` (M5) can see the order.

## Port deviations (deliberate; each has a `// §NNN` or `shortcut:` comment in code)

- Token memory is numeric `info`/`link` arrays with a free list; `null = 0`, fixed heads `temp_head=1, hold_head=2, backup_head=3, garbage=4`. `get_avail` zeroes `info` (TeX does not; harmless).
- No string pool. `print_cs` on an empty slot prints `^^@` as TeX's `text = 0` would. `new_string` selector writes into `Engine.cur_str`.
- Glue specs are TS objects in `Engine.spec[]` addressed by integer; `zero_glue = 0 = null`, as in tex.web.
- Terminal: `run({ terminal: string[] })` supplies the lines a user would type. `init_terminal` (§37: `**`, `Please type the name of your input file.`), `term_input` (§71, echoing into the log), the `*` prompt (§360) and terminal `\read` (§484) take them in order; the typed text is appended to `Engine.terminal` as a terminal echoes it, and running out is TeX's `End of file on the terminal!`. The §83 error dialogue ports only the empty answer (return); any other answer is `fatal_error("unsupported: terminal dialogue response X")`. With `terminal` the run starts in `\errorstopmode` as tex.web does; without it, it starts in batch mode and every terminal read stops with `unsupported: terminal input`, as before. No interrupts, `pause_for_instructions` or `prompt_file_name` input (`unsupported: terminal input`). The §61 banner (`This is tstex, Version 3.141592653 (INITEX)`) is always written to `Engine.terminal`.
- Limits: `new Engine({ fs, limits })` overrides `error_line`, `half_error_line`, `max_print_line`, `stack_size`, `max_in_open`, `buf_size`, `param_size`, `nest_size`, `save_size`, `font_max`, `font_mem_size`, `hash_size`/`hash_extra`, `hyph_size`, `trie_size`, `trie_op_size`, `dvi_buf_size`, `expand_depth`; defaults are TeX Live's texmf.cnf values. eqtb's layout stays fixed at TeX Live's (`hash_size` only bounds how many control sequences can be made; `font_max` only the font count), so a format is independent of the limits. `mem`/pool sizes have no counterpart.
- Format: `\dump` (§1302–1328) prints the format identification and the statistics lines with this engine's figures (0 strings, token-memory words, `cs_count`, fonts, hyphenation exceptions and trie ops, pdftex's two lines) and stores a `structuredClone` snapshot of the dumped tables in `Engine.fmt_file` (`src/format.ts` lists the fields: token memory, nodes, glue specs, `\parshape` arrays, eqtb, `par_loc`/`write_loc`, hash and primitive tables, fonts, hyphenation state, `interaction`, `format_ident`). `new Engine({ fs, format })` plus a first line starting `&name` loads it (§524 skips the name; the supplied format is used whatever the name; no format given is a JS error). No bytes yet (M5). The date comes from `run({ date })` when given (tools/trip.ts uses Knuth's 4 JUL 1776 12:00).
- Files written by `\openout` in this run are found by `\input`/`\openin` (their current contents) before the `TexFS`, as TeX would find the flushed file on disk.
- `jump_out` is a thrown exception caught by `run()`, which then calls `close_files_and_terminate` (as tex.ch).
- `\pdftexversion` returns 140.
- `handle_right_brace` calls `confusion` only for groups that never reach it (TeX's `othercases`).
- `nodeFS` refuses names containing `..` (no path escape from the roots).
- File names (tex.ch): `scan_file_name` keeps `cur_name/cur_area/cur_ext` as JS strings; `"` toggles quoting and is dropped; area ends at the last `/`, extension starts at the last `.` after it. Braced names (`\input{...}`, `scan_file_name_braced`) are unsupported. Lookup tries `name.tex` then `name` unless the extension is `.tex` (kpathsea order); the name printed after `(` is `./` + the name found (`shortcut:` every `nodeFS` root is treated as the cwd, as kpathsea prints a cwd hit; an ls-R texmf root (M5) must report the real path, which changes the 79-column wrap positions). `in_name_ok` (openin_any) is not checked beyond `nodeFS`'s `..` rule.
- `prompt_file_name` always ends in `fatal_error`; in scroll/errorstop mode that would be a terminal prompt, which is `unsupported: terminal input`.
- The command-line file goes through the real `start_input`/`scan_file_name` on the `**` line; a missing main file now gives TeX's "I can't find file" + fatal error instead of a JS exception.
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
- `\pdfadjustspacing` or `\pdfprotrudechars` non-zero at a paragraph end stops with `unsupported:`; `\pdfeachlineheight` and friends are honoured (§888). (The e‑TeX parts of line breaking are ported in M4.)
- Hyphenation exceptions are a `Map` keyed by the word plus language: tex.ch's `hyph_link` chaining only decides where an entry sits, so lookups and `hyph_count` (repeated words replace and do not count, tex.ch §940) are unaffected; the `hyph_size=8191` overflow is kept.
- `\patterns`: `new_trie_op`'s and `trie_node`'s open-addressing hash tables are `Map`s (both return the first equal entry, so op codes and the compressed trie are identical); `first_fit`, `trie_pack`, `trie_fix` and the op sort are ported as is, with `trie_size=1000000`, `trie_op_size=35111`, 65535 ops per language and `max_op_used` (printed only by `\dump`, M5). web2c stores `trie_back` in `trie_op`; here it has its own array (holes are cleared before use, so this is invisible).
- `\patterns` is always INITEX: pdftex's "Patterns can be loaded only by INITEX" path is unreachable; after the first paragraph that needs hyphenation it gives "Too late for \patterns".
- `Engine.terminal` collects what TeX prints to the terminal; under the forced batch mode that is next to nothing (the log is complete).

### M3 pass A (math)

- Noad fields are objects `{math_type, fam, character, info}` (TeX overlays `info` on fam/character); `new_hlist` is its own field; left/right noads keep `delimiter` in `left_delimiter`.
- The §1153 `saved(0)` noad-field pointer is a handle in `Engine.nodes`, released at §1186; `scan_delimiter`'s `garbage` is a throwaway object.
- `mlist_to_hlist` returns the hlist instead of leaving it in `link(temp_head)`; `copy_node_list` calls `confusion` on noads as TeX does.
- TeX's `aux` word is split into `prev_depth`/`space_factor`/`incompleat_noad` (so `vrule.ts` writing `space_factor` in math mode is harmless); e‑TeX's `eTeX_aux` is cleared by `push_nest`, `LR_box` is always null.
- TeXXeT parts of §1145–1146 are not ported (see e‑TeX below). `set_box_lr(dlist)` sets subtype 2 (shown only in e‑TeX mode).
- `sub_sup`/`math_limit_switch` guard a char-node tail (never happens).
- Quirks: §219 prints `this will begin denominator of:`; `var_delimiter` builds the extensible from the last probed `char_info` and follows `list_tag` chains without re-checking `font_bc`/`font_ec`; `clean_box` on a `math_text_char` field returns an empty box; a missing math char resets the field to empty after the warning; only pdftex's §1146–1148 form exists (no glue_set float arithmetic in `\predisplaysize`); `-\hangafter` in §1149 wraps at −2³¹.

### M3 pass B (alignment, leftovers)

- An alignrecord is a null box object with extra fields `info` (span list), `u_part`, `v_part`, `extra_info`; a span node is `{span_n, width, info}` (`span_n` is TeX's `link`). `end_span` is a module constant whose `info` is set to an alignrecord only inside §803's merge loop.
- `align_ptr`'s stack nodes are an array of saved states (`Engine.align_stack`); `cur_head`/`cur_pre_head` are fresh list-head objects per alignment; `align_head` is an Engine object whose `link` is the preamble; §808 uses a local list head where TeX reuses `hold_head`.
- `omit_template` is fixed token memory location 6 (after `null_list`), holding `\endtemplate`.
- §812's `aux_save` restores `prev_depth`, `space_factor` and `clang` (TeX copies the whole `aux` word).
- The primitives table of `\pdfprimitive`/`\ifpdfprimitive` is a `Map` by name with sequential indices instead of `prim_prime` hashing (indices are never printed). `prim_lookup_cs(null_cs)` answers undefined_primitive (`shortcut:`; pdftex looks up pool string 256).
- `unsupported.ts` now holds only `\letterspacefont` and `\pdfcopyfont` (font expansion).

### M4 e‑TeX

- Extended mode is `Engine.eTeX_mode` (`eTeX_ex` is a getter); `run({ mode: 'etex' })` sets pdftex.ch's `etex_p`. `init_prim(e, true)` generates only the `etex_primitives` lists, after the first line is read (etex.ch's place), so compatibility mode never sees them.
- Sparse arrays: TeX's 16-ary tree of index nodes is a `Map` per type (`Engine.sa_root[t]`, number → handle); elements are objects in `Engine.sa[]` (handles from 4 up, so a `register`/`toks_register` chr code 0..3 is still a primitive and anything larger a sparse element). `do_marks` walks the mark classes in ascending order, as the tree walk does; freeing index nodes has no counterpart. A sparse box element holds the `Node` itself, not a `nodes[]` handle. `sa_chain` is a linked list of saved values; the `restore_sa` save-stack entry keeps the previous chain on `Engine.sa_chain_stack` instead of in `save_index`.
- `\interlinepenalties` etc. live in `Engine.shapes` as `[n, p1, …, pn]`, so `penalty(q+r)` is `shapes[h][r]`.
- Pseudo files (`\scantokens`) are arrays of lines (byte arrays) on `Engine.pseudo_files`; `pseudo_input` still pads each line to whole four-byte words for the buffer-size check and `max_buf_stack`, then strips the trailing spaces as TeX does.
- TeXXeT is not ported. `\TeXXeTstate` can be read and assigned and `\beginL`…`\endR` are registered; with the state ≤0 they give e‑TeX's "Improper \beginL" error, with it >0 they stop with `unsupported: TeXXeT`, as do `hpack`, `line_break`, `init_math` and `after_math` whenever `TeXXeT_en` holds (etex.ch branches on it there). `hlist_out`'s mixed-direction code (glue-to-kern conversion, the LR stack, `reverse`) changes nothing visible without TeXXeT nodes and is not ported; `LR_save` and `LR_ptr` are always null, so `\predisplaydirection` is set to 0 on entering a display. `app_display` and the display prototype box are ported.
- `\pdfstrcmp` (pdftex.web `compare_strings`) is ported ahead of M6 because e‑TeX-era format probes use it.
- A format dumped in e‑TeX mode stores `eTeX_mode` and the sparse arrays (`format.ts` keys `eTeX_mode`, `sa`, `sa_free`, `sa_root`) and loads in e‑TeX mode; `\TeXXeTstate` is zeroed before dumping, as etex.ch does.
- Conformance: Breitenlohner's etrip (spec/etrip.tex) with every `\TeXXeTstate=1` changed to 0 gives a log identical to `pdftex -ini -etex`'s (both passes, after normalisation) except the memory-usage lines, and identical DVI and `etrip.out`. The unmodified etrip stops at its first TeXXeT paragraph (line 195).

## Harness

- `tools/trip.ts` runs Knuth's trip test with tripman's capacities and also both passes through the real `pdftex -ini` (TeX Live capacities, `SOURCE_DATE_EPOCH=0`) against this engine with the same capacities; pdftex reads trip fine with TeX Live's sizes, so that pair is a direct oracle for the whole of trip.tex. Remaining Knuth differences are in `test/trip-diffs.md`.

- `.gitignore` ignored `*.dvi`, so the `.expected.dvi` files the harness compares were never committed and a fresh checkout skipped every DVI comparison; `!*.expected.dvi` now keeps them.

## Security

- `nodeFS.find` rejects any path component `..`; roots are the only readable directories. Test: pending (`test/unit/security.test.ts`, M5).
- No `\write18`, no shell escape primitive registered as functional.
