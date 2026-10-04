// Dev-only fixture for the UV Map Generator (`?uvdemo`).
//
// A plain browser cannot call the Rust backend, so this synthesises a document
// shaped exactly like the real `load_uv_document` payload. It is a **test
// pattern, not a model**: blocky islands by construction, so it can never be
// mistaken for a real asset's UV layout. What it does exercise is the renderer,
// the material grouping, the chart filter, tiled UVs and the warning path.
import type { UvDocument, UvMesh } from "../../../shared/models";

/** Shader descriptors mirroring what the Rust side resolves. */
const SHADERS = [
  { hash: 0xe029bf8e, name: "vehicle_paint3" },
  { hash: 0xd963b58b, name: "vehicle_mesh" },
  { hash: 0x38dd00df, name: "normal_spec" },
  { hash: 0x1fa3ecee, name: null },
];

interface Builder {
  uvs: number[];
  indices: number[];
}

function quad(b: Builder, u0: number, v0: number, u1: number, v1: number): void {
  const base = b.uvs.length / 2;
  b.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function bounds(uvs: number[]): number[] {
  if (!uvs.length) return [];
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uvs.length; i += 2) {
    minU = Math.min(minU, uvs[i]);
    maxU = Math.max(maxU, uvs[i]);
    minV = Math.min(minV, uvs[i + 1]);
    maxV = Math.max(maxV, uvs[i + 1]);
  }
  return [minU, minV, maxU, maxV];
}

function mesh(
  id: number,
  lod: string,
  shader: number,
  b: Builder,
  warning: string | null = null
): UvMesh {
  const vertexCount = b.uvs.length / 2;
  const indexCount = b.indices.length;
  const descriptor = SHADERS[shader] ?? { hash: 0, name: null };
  return {
    id,
    lod,
    drawable: 0,
    shader,
    shader_hash: descriptor.hash,
    shader_name: descriptor.name,
    uv_set: 0,
    vertex_count: vertexCount,
    index_count: indexCount,
    triangle_count: Math.floor(indexCount / 3),
    uvs: b.uvs.map((v) => Math.round(v * 100_000) / 100_000),
    indices: b.indices,
    uv_bounds: warning ? [] : bounds(b.uvs),
    warning,
  };
}

export function demoUvDocument(): UvDocument {
  const meshes: UvMesh[] = [];

  // 0 — a 5x5 sheet grid: 25 separate islands, like unwrapped panel pieces.
  {
    const b: Builder = { uvs: [], indices: [] };
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const u = 0.04 + x * 0.09;
        const v = 0.04 + y * 0.09;
        quad(b, u, v, u + 0.07, v + 0.07);
      }
    }
    meshes.push(mesh(0, "high", 0, b));
  }

  // 1 — a ring: 32 segments, plus a hub island.
  {
    const b: Builder = { uvs: [], indices: [] };
    const cx = 0.75;
    const cy = 0.75;
    for (let i = 0; i < 32; i++) {
      const a0 = (i / 32) * Math.PI * 2;
      const a1 = ((i + 1) / 32) * Math.PI * 2;
      const r0 = 0.06;
      const r1 = 0.14;
      const base = b.uvs.length / 2;
      b.uvs.push(
        cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0,
        cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0,
        cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1,
        cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1
      );
      b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    quad(b, 0.72, 0.72, 0.78, 0.78);
    meshes.push(mesh(1, "high", 1, b));
  }

  // 2 — the same material on the medium LOD (one material, several meshes), plus
  // a deliberately tiny island so "hide tiny islands" has something to remove.
  {
    const b: Builder = { uvs: [], indices: [] };
    for (let i = 0; i < 8; i++) {
      quad(b, 0.04 + i * 0.11, 0.62, 0.13 + i * 0.11, 0.72);
    }
    quad(b, 0.5, 0.52, 0.506, 0.526); // rivet-sized island
    meshes.push(mesh(2, "medium", 1, b));
  }

  // 3 — a tiled strip (u 0..4): exercises "UV 0-1" vs "Fit all".
  {
    const b: Builder = { uvs: [], indices: [] };
    for (let i = 0; i < 16; i++) {
      quad(b, i * 0.25, 0.06, i * 0.25 + 0.24, 0.2);
    }
    meshes.push(mesh(3, "high", 2, b));
  }

  // 4 — a low-LOD copy of the ring (hidden by "High LOD only").
  {
    const b: Builder = { uvs: [], indices: [] };
    const cx = 0.3;
    const cy = 0.3;
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = ((i + 1) / 12) * Math.PI * 2;
      const base = b.uvs.length / 2;
      b.uvs.push(
        cx + Math.cos(a0) * 0.05, cy + Math.sin(a0) * 0.05,
        cx + Math.cos(a1) * 0.05, cy + Math.sin(a1) * 0.05,
        cx + Math.cos(a1) * 0.12, cy + Math.sin(a1) * 0.12,
        cx + Math.cos(a0) * 0.12, cy + Math.sin(a0) * 0.12
      );
      b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    meshes.push(mesh(4, "low", 3, b));
  }

  // 5 — a geometry with no texture coordinates at all (warning path).
  meshes.push(
    mesh(5, "low", 3, { uvs: [], indices: [] }, "geometry has no texture-coordinate channel")
  );

  const totalVertices = meshes.reduce((s, m) => s + m.vertex_count, 0);
  const totalTriangles = meshes.reduce((s, m) => s + m.triangle_count, 0);

  return {
    path: "[demo] synthetic UV test pattern",
    file_name: "uv_test_pattern.ydr",
    kind: "ydr",
    version: 0xa5,
    gen9: false,
    system_size: 524288,
    graphics_size: 0,
    drawable_count: 1,
    meshes,
    total_vertices: totalVertices,
    total_triangles: totalTriangles,
    shader_count: SHADERS.length,
    warnings: ["dev test pattern — blocky by design, not a real GTA V resource (?uvdemo)"],
  };
}
