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
- `\ifvoid`/`\ifhbox`/`\ifvbox` and `\showlists` only see empty/void state until M2.

## Known bugs in the original

(none recorded yet; see `spec/tex82.bug` and the 2021 tune‑up when relevant sections are ported)

## pdftex vs tex.web

- Command codes and the eqtb layout follow pdftex.web: `max_command = 102`, which shifts every expandable command code relative to tex.web. pdftex's integer/dimen/token parameters and e‑TeX's slots have real eqtb places.
- `undefined_control_sequence = frozen_null_font + 257` in tex.web; pdftex uses `font_max`. We follow pdftex's layout.
- `hash_size` is tex.ch's 15000 plus TeX Live's `hash_extra = 600000`, kept as one block. No hash function is replicated: names live in two `Map`s.
- Expansion depth limit of 10000 (`expand_depth`, tex.ch) is enforced.

## Port deviations (deliberate; each has a `// §NNN` or `shortcut:` comment in code)

- Token memory is numeric `info`/`link` arrays with a free list; `null = 0`, fixed heads `temp_head=1, hold_head=2, backup_head=3, garbage=4`. `get_avail` zeroes `info` (TeX does not; harmless).
- No string pool. `print_cs` on an empty slot prints `^^@` as TeX's `text = 0` would. `new_string` selector writes into `Engine.cur_str`.
- Glue specs are TS objects in `Engine.spec[]` addressed by integer; `zero_glue = 0 = null`, as in tex.web.
- Interaction is always batch mode: no dialog, `term_input`, interrupts or `pause_for_instructions`.
- `jump_out` is a thrown exception caught by `run()`, which then calls `close_files_and_terminate` (as tex.ch).
- Only `\nullfont` exists until M2: `em`/`ex` give 0; `\fontname`, font dimens unsupported.
- `\lastpenalty`, `\lastkern`, `\lastskip`, `\badness` return 0/`zero_glue`; `\pdftexversion` returns 140. Revisit when lists exist (M2).
- `scan_register_num` is `scan_eight_bit_int`; no sparse (e‑TeX) registers.
- e‑TeX‑mode‑only machinery not ported yet: `group_warning`, `if_warning`, `grp_stack`/`if_stack`, `\tracingassigns`/`\tracinggroups`/`\tracingifs` hooks. Registered via `etex_primitives` only when `init_prim(e, true)` runs (M4).
- `handle_right_brace` calls `confusion` for box/insert/align/output/math groups (none can be opened yet).
- `ignore_spaces` with `chr = 1` (frozen `\pdfprimitive`) inside `scan_something_internal` is unsupported; pdftex resets the token and rescans.
- `nodeFS` refuses names containing `..` (no path escape from the roots).
- File names (tex.ch): `scan_file_name` keeps `cur_name/cur_area/cur_ext` as JS strings; `"` toggles quoting and is dropped; area ends at the last `/`, extension starts at the last `.` after it. Braced names (`\input{...}`, `scan_file_name_braced`) are unsupported. Lookup tries `name.tex` then `name` unless the extension is `.tex` (kpathsea order); the name printed after `(` is the one found, without `./`. `in_name_ok` (openin_any) is not checked beyond `nodeFS`'s `..` rule.
- `prompt_file_name` and terminal `\read` always end in `fatal_error`; in scroll/errorstop mode that would be a terminal prompt, which is `unsupported: terminal input`.
- The command-line file goes through the real `start_input`/`scan_file_name` on the `**` line; a missing main file now gives TeX's "I can't find file" + fatal error instead of a JS exception.
- `\csname` does not track `is_in_csname` (only `\ifincsname`, e‑TeX, reads it). `\pdfprimitive`, `\scantokens`, `\readline` remain unsupported.
- Expansion depth: the JS stack runs out after roughly 1500 nested `expand` calls (node's default stack), far below `expand_depth=10000`. Past depth 100 `expand` probes for JS stack headroom and reports `TeX capacity exceeded, sorry [expansion depth=10000]` in the same state pdftex would, so the log matches pdftex's for runaway recursion; legitimate nestings between ~1500 and 9999 levels (e.g. `\message{` + 2000×`\number` + `1}`) fail where pdftex succeeds. `Engine.run` also maps any stray `RangeError` stack overflow to that message.
- Banner is `This is tstex, Version 3.141592653 (INITEX)  <date>`; no `restricted \write18` line, no `SOURCE_DATE_EPOCH`.

## Security

- `nodeFS.find` rejects any path component `..`; roots are the only readable directories. Test: pending (`test/unit/security.test.ts`, M5).
- No `\write18`, no shell escape primitive registered as functional.
