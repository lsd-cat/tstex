// The only runtime-specific surface: file lookup and reading
export interface TexFS {
  find(name: string, kind: string): Uint8Array | null
  path?(name: string, kind: string): string | null // the name as kpathsea would print it for a file `find' returns
  writable?(name: string): boolean // can \openout create `name' (its directory exists in the output directory)
  stat?(name: string, kind: string): { size: number, mtime: Date } | null // \pdffilemoddate
  compress?(data: Uint8Array, level: number): Uint8Array // zlib (RFC 1950) deflate for PDF streams with \pdfcompresslevel>0
  inflate?(data: Uint8Array, max: number): Uint8Array // zlib inflate of at most max bytes (PNG image data)
}
