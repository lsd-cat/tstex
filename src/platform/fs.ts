// The only runtime-specific surface: file lookup and reading
export interface TexFS {
  find(name: string, kind: string): Promise<Uint8Array | null>
}
