/**
 * The shape of `meshes.json`: the geometry and the texts ripped from the
 * game's part prefabs. Its own file so the renderers that read it -- the SVG
 * one and the 3D scene -- can share the types without either importing the
 * other.
 */

export interface MeshData {
  vertices: number[];
  normals: number[];
  colors: string[];
  triangles: number[];
}
export interface RendererRef {
  name: string;
  mesh: string;
  material: string | null;
  position: number[];
  rotation: number[];
  scale: number[];
}
export interface TextRef {
  name: string;
  text: string;
  scale: number;
  position: number[];
  rotation: number[];
  alignment: number;
  /** CRPText3D.VerticalAlignment: 0 top, 1 centre, 2 bottom of the text sits on the anchor. */
  valign?: number;
  monospace?: boolean;
}
export interface MeshFile {
  cell: number;
  meshes: Record<string, MeshData>;
  parts: Record<string, { renderers: RendererRef[]; texts: TextRef[] }>;
}
