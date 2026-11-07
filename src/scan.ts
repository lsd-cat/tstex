// §402–440 basic scanning subroutines, §464–473 building token lists
import type { Engine } from './engine.ts'
import { Cmd, int_val, dimen_val, glue_val, ident_val, tok_val, new_string } from './types.ts'
import { print, print_int, print_esc } from './print.ts'
import { print_scaled } from './arith.ts'
import { error, print_err, help, int_error, fatal_error } from './error.ts'
import { math_code_base, count_base, active_base, single_base } from './eqtb.ts'
import { sprint_cs } from './hash.ts'
import { get_avail, flush_list, temp_head, backup_head } from './nodes.ts'
import { cs_token_flag, left_brace_token, left_brace_limit, right_brace_limit, other_token, letter_token, space_token, end_match_token, match_token, out_param_token, print_cmd_chr } from './tokens.ts'
import { get_token, get_next, back_input, back_error, back_list, defining, absorbing, normal } from './input.ts'
import { get_x_token, x_token, expand } from './expand.ts'

const zero_token = other_token + 48, alpha_token = other_token + 96, octal_token = other_token + 39,
  hex_token = other_token + 34, A_token = letter_token + 65, other_A_token = other_token + 65
export const infinity = 0o17777777777

// §403 scan_left_brace
export function scan_left_brace(e: Engine): void {
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
  if (e.cur_cmd !== Cmd.left_brace) {
    print_err(e, 'Missing { inserted')
    help(e, "A left brace was mandatory here, so I've put one in.", 'You might want to delete and/or insert some corrections',
      'so that I will find a matching right brace soon.', "(If you're confused by all this, try typing `I}' now.)")
    back_error(e); e.cur_tok = left_brace_token + 123; e.cur_cmd = Cmd.left_brace
    e.cur_chr = 123; e.align_state++
  }
}

// §405 scan_optional_equals
export function scan_optional_equals(e: Engine): void {
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
  if (e.cur_tok !== other_token + 61) back_input(e)
}

// §407 scan_keyword
export function scan_keyword(e: Engine, s: string): boolean {
  let p = backup_head, k = 0
  e.link[p] = 0
  while (k < s.length) {
    get_x_token(e)
    const c = s.charCodeAt(k)
    if (e.cur_cs === 0 && (e.cur_chr === c || e.cur_chr === c - 32)) {
      const q = get_avail(e); e.link[p] = q; e.info[q] = e.cur_tok; p = q; k++
    } else if (e.cur_cmd !== Cmd.spacer || p !== backup_head) {
      back_input(e)
      if (p !== backup_head) back_list(e, e.link[backup_head]!)
      return false
    }
  }
  flush_list(e, e.link[backup_head]!)
  return true
}

// §413 scan_something_internal
export function scan_something_internal(e: Engine, level: number, negative: boolean): void {
  const m = e.cur_chr
  switch (e.cur_cmd) {
    case Cmd.def_code: // §414 Fetch a character code from some table
      scan_char_num(e)
      if (m === math_code_base) { e.cur_val = e.equiv[math_code_base + e.cur_val]!; e.cur_val_level = int_val }
      else { e.cur_val = e.equiv[m + e.cur_val]!; e.cur_val_level = int_val }
      break
    case Cmd.assign_int: e.cur_val = e.equiv[m]!; e.cur_val_level = int_val; break
    case Cmd.register: // §420 Fetch a register (only \count exists so far)
      scan_eight_bit_int(e)
      e.cur_val = e.equiv[count_base + e.cur_val]!; e.cur_val_level = m
      break
    default: // §428 Complain that \the can't do this; give zero result
      if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) fatal_error(e, 'unsupported: internal quantity')
      print_err(e, "You can't use `"); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
      print(e, "' after "); print_esc(e, 'the')
      help(e, "I'm forgetting what you said and using zero instead.")
      error(e)
      e.cur_val = 0; e.cur_val_level = level !== tok_val ? dimen_val : int_val
  }
  // §429 Convert cur_val to a lower level (only dimen_val→int_val can arise so far)
  while (e.cur_val_level > level) e.cur_val_level--
  // §430 Fix the reference count, if any, and negate cur_val if negative
  if (negative) e.cur_val = -e.cur_val | 0
}

// §433 scan_eight_bit_int
export function scan_eight_bit_int(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 255) {
    print_err(e, 'Bad register code')
    help(e, 'A register number must be between 0 and 255.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §434 scan_char_num
export function scan_char_num(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 255) {
    print_err(e, 'Bad character code')
    help(e, 'A character number must be between 0 and 255.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §440 scan_int
export function scan_int(e: Engine): void {
  e.radix = 0
  let OK_so_far = true
  // §441 Get the next non-blank non-sign token; set negative appropriately
  let negative = false
  do {
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
    if (e.cur_tok === other_token + 45) { negative = !negative; e.cur_tok = other_token + 43 }
  } while (e.cur_tok === other_token + 43)
  if (e.cur_tok === alpha_token) {
    // §442 Scan an alphabetic character code into cur_val
    get_token(e)
    if (e.cur_tok < cs_token_flag) {
      e.cur_val = e.cur_chr
      if (e.cur_cmd <= Cmd.right_brace) {
        if (e.cur_cmd === Cmd.right_brace) e.align_state++
        else e.align_state--
      }
    } else if (e.cur_tok < cs_token_flag + single_base) e.cur_val = e.cur_tok - cs_token_flag - active_base
    else e.cur_val = e.cur_tok - cs_token_flag - single_base
    if (e.cur_val > 255) {
      print_err(e, 'Improper alphabetic constant')
      help(e, 'A one-character control sequence belongs after a ` mark.', "So I'm essentially inserting \\0 here.")
      e.cur_val = 48; back_error(e)
    } else { get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e) } // §443
  } else if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) scan_something_internal(e, int_val, false)
  else {
    // §444 Scan a numeric constant
    e.radix = 10; let m = 214748364
    if (e.cur_tok === octal_token) { e.radix = 8; m = 0o2000000000; get_x_token(e) }
    else if (e.cur_tok === hex_token) { e.radix = 16; m = 0o1000000000; get_x_token(e) }
    let vacuous = true; e.cur_val = 0
    // §445 Accumulate the constant until cur_tok is not a suitable digit
    for (;;) {
      let d: number
      if (e.cur_tok < zero_token + e.radix && e.cur_tok >= zero_token && e.cur_tok <= zero_token + 9) d = e.cur_tok - zero_token
      else if (e.radix === 16) {
        if (e.cur_tok <= A_token + 5 && e.cur_tok >= A_token) d = e.cur_tok - A_token + 10
        else if (e.cur_tok <= other_A_token + 5 && e.cur_tok >= other_A_token) d = e.cur_tok - other_A_token + 10
        else break
      } else break
      vacuous = false
      if (e.cur_val >= m && (e.cur_val > m || d > 7 || e.radix !== 10)) {
        if (OK_so_far) {
          print_err(e, 'Number too big')
          help(e, "I can only go up to 2147483647='17777777777=\"7FFFFFFF,", "so I'm using that number instead of yours.")
          error(e); e.cur_val = infinity; OK_so_far = false
        }
      } else e.cur_val = e.cur_val * e.radix + d
      get_x_token(e)
    }
    if (vacuous) { // §446 Express astonishment that no number was here
      print_err(e, 'Missing number, treated as zero')
      help(e, "A number should have been here; I inserted `0'.", "(If you can't figure out why I needed to see a number,",
        "look up `weird error' in the index to The TeXbook.)")
      back_error(e)
    } else if (e.cur_cmd !== Cmd.spacer) back_input(e)
  }
  if (negative) e.cur_val = -e.cur_val | 0
}

// §464 str_toks: converts the current string from position b to a token list at link(temp_head)
export function str_toks(e: Engine, b: number): number {
  let p = temp_head
  e.link[p] = 0
  for (let k = b; k < e.cur_str.length; k++) {
    const t = e.cur_str[k] === 32 ? space_token : other_token + e.cur_str[k]!
    const q = get_avail(e); e.link[p] = q; e.info[q] = t; p = q
  }
  e.cur_str.length = b
  return p
}

// §465 the_toks
export function the_toks(e: Engine): number {
  get_x_token(e); scan_something_internal(e, tok_val, false)
  if (e.cur_val_level >= ident_val) fatal_error(e, 'unsupported: \\the of a token list or font') // §466
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  if (e.cur_val_level === int_val) print_int(e, e.cur_val)
  else if (e.cur_val_level === dimen_val) { print_scaled(e, e.cur_val); print(e, 'pt') }
  else if (e.cur_val_level >= glue_val) fatal_error(e, 'unsupported: \\the of glue')
  e.selector = old_setting
  return str_toks(e, b)
}

// §473 scan_toks
export function scan_toks(e: Engine, macro_def: boolean, xpand: boolean): number {
  e.scanner_status = macro_def ? defining : absorbing
  e.warning_index = e.cur_cs; e.def_ref = get_avail(e); e.info[e.def_ref] = 0
  let p = e.def_ref, hash_brace = 0, t = zero_token, unbalance: number
  const store_new_token = (x: number) => { const q = get_avail(e); e.link[p] = q; e.info[q] = x; p = q }
  found: {
    if (macro_def) {
      // §474 Scan and build the parameter part of the macro definition
      done: {
        done1: for (;;) {
          get_token(e)
          if (e.cur_tok < right_brace_limit) break done1
          if (e.cur_cmd === Cmd.mac_param) {
            // §476 If the next character is a parameter number, make cur_tok a match token
            const s = match_token + e.cur_chr
            get_token(e)
            if (e.cur_tok < left_brace_limit) {
              hash_brace = e.cur_tok
              store_new_token(e.cur_tok); store_new_token(end_match_token)
              break done
            }
            if (t === zero_token + 9) {
              print_err(e, 'You already have nine parameters')
              help(e, "I'm going to ignore the # sign you just used,", 'as well as the token that followed it.'); error(e)
              continue done1
            }
            t++
            if (e.cur_tok !== t) {
              print_err(e, 'Parameters must be numbered consecutively')
              help(e, "I've inserted the digit you should have used after the #.", "Type `1' to delete what you did use."); back_error(e)
            }
            e.cur_tok = s
          }
          store_new_token(e.cur_tok)
        }
        store_new_token(end_match_token)
        if (e.cur_cmd === Cmd.right_brace) { // §475 Express shock at the missing left brace
          print_err(e, 'Missing { inserted'); e.align_state++
          help(e, "Where was the left brace? You said something like `\\def\\a}',", "which I'm going to interpret as `\\def\\a{}'."); error(e)
          break found
        }
      }
    } else scan_left_brace(e)
    // §477 Scan and build the body of the token list
    unbalance = 1
    for (;;) {
      if (xpand) {
        // §478 Expand the next part of the input
        for (;;) {
          get_next(e)
          if (e.cur_cmd <= Cmd.max_command) break
          if (e.cur_cmd !== Cmd.the) expand(e)
          else {
            const q = the_toks(e)
            if (e.link[temp_head] !== 0) { e.link[p] = e.link[temp_head]!; p = q }
          }
        }
        x_token(e)
      } else get_token(e)
      if (e.cur_tok < right_brace_limit) {
        if (e.cur_cmd < Cmd.right_brace) unbalance++
        else { unbalance--; if (unbalance === 0) break found }
      } else if (e.cur_cmd === Cmd.mac_param && macro_def) {
        // §479 Look for parameter number or ##
        const s = e.cur_tok
        if (xpand) get_x_token(e); else get_token(e)
        if (e.cur_cmd !== Cmd.mac_param) {
          if (e.cur_tok <= zero_token || e.cur_tok > t) {
            print_err(e, 'Illegal parameter number in definition of '); sprint_cs(e, e.warning_index)
            help(e, "You meant to type ## instead of #, right?", 'Or maybe a } was forgotten somewhere earlier, and things',
              "are all screwed up? I'm going to assume that you meant ##.")
            back_error(e); e.cur_tok = s
          } else e.cur_tok = out_param_token - 48 + e.cur_chr
        }
      }
      store_new_token(e.cur_tok)
    }
  }
  e.scanner_status = normal
  if (hash_brace !== 0) store_new_token(hash_brace)
  return p
}
