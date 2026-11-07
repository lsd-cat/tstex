// §982–983 \pagegoal \pagetotal \pagestretch \pagefilstretch \pagefillstretch \pagefilllstretch \pageshrink \pagedepth,
// §1245 alter_page_so_far (fetched by §421 in scan.ts)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_normal_dimen } from '../scan.ts'

const names = ['pagegoal', 'pagetotal', 'pagestretch', 'pagefilstretch', 'pagefillstretch', 'pagefilllstretch', 'pageshrink', 'pagedepth']
export const cmd = Cmd.set_page_dimen
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'pagedepth') }
export function assign(e: Engine, _a: number): void {
  const c = e.cur_chr
  scan_optional_equals(e); scan_normal_dimen(e)
  e.page_so_far[c] = e.cur_val
}
