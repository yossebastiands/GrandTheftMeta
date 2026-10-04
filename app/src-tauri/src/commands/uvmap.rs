//! Creator Tools — RSC7 resource reader + drawable/fragment UV extraction.
//!
//! Supports the **GTA V gen8 / FiveM legacy** container (RSC7 with the gen8 page
//! flags — `version` 165 for `.ydr`/`.ydd`, 162 for `.yft`). Gen9/"Enhanced"
//! resources (version 154/159) use a different vertex layout and are reported as
//! unsupported rather than mis-parsed.
//!
//! Layout reference: the RAGE resource structures as documented by **CodeWalker**
//! (dexyfex): `ResourceDataReader` (system/graphics virtual pointers),
//! `RpfResourceFileEntry` (page flags -> block sizes), `DrawableBase`, `Drawable`,
//! `DrawableModelsBlock`, `DrawableModel`, `DrawableGeometry` (= `grcGeometry`),
//! `VertexBuffer`, `VertexData`, `VertexDeclaration`, `IndexBuffer`.
//!
//! Everything here is read-only: the file is never modified.
//!
//! Pointer model: every `*Pointer` field is a 64-bit *virtual* address that encodes
//! which decompressed block it lives in — `0x5xxxxxxx` = system, `0x6xxxxxxx` =
//! graphics — plus the byte offset inside that block.

use std::fs;
use std::io::Read;
use std::path::Path;

use flate2::read::{DeflateDecoder, ZlibDecoder};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// `RSC7` little-endian magic.
const RSC7_MAGIC: u32 = 0x3743_5352;
/// Virtual base of the "system" block (structured data).
const SYSTEM_BASE: u64 = 0x5000_0000;
/// Virtual base of the "graphics" block (bulk vertex/texture data).
const GRAPHICS_BASE: u64 = 0x6000_0000;
/// The resource root block always starts at the system base.
const ROOT: u64 = SYSTEM_BASE;

/// Sanity caps — a corrupt file must produce an error, never an OOM/hang.
const MAX_VERTICES: usize = 4_000_000;
const MAX_INDICES: usize = 24_000_000;
const MAX_MESHES: usize = 1024;
const MAX_BLOCK_BYTES: usize = 256 * 1024 * 1024;

/// `VertexSemantics` — the bit index used by `VertexDeclaration::flags`.
const SEM_POSITION: u32 = 0;
const SEM_TEXCOORD0: u32 = 6;
const SEM_TEXCOORD7: u32 = 13;

/// `VertexComponentType` — the 4-bit code stored per semantic in `types`.
const VT_HALF2: u32 = 1;
/// Single-precision float component (`VT_FLOAT`); kept for reference — the drawables we read use
/// the half/vector variants below, so nothing matches on it today.
#[allow(dead_code)]
const VT_FLOAT: u32 = 2;
const VT_HALF4: u32 = 3;
const VT_FLOAT2: u32 = 5;
const VT_FLOAT3: u32 = 6;
const VT_FLOAT4: u32 = 7;

/// `GetSizeInBytes(VertexComponentType)` (CodeWalker `VertexComponentTypes`).
fn component_size(t: u32) -> usize {
    match t {
        1 => 4,  // Half2
        2 => 4,  // Float
        3 => 8,  // Half4
        5 => 8,  // Float2
        6 => 12, // Float3
        7 => 16, // Float4
        8 | 9 | 10 => 4,
        _ => 0,
    }
}

/// IEEE-754 binary16 -> binary32 (GTA V stores many UVs as `f16x2`).
fn half_to_f32(h: u16) -> f32 {
    let sign = (h >> 15) & 1;
    let exp = ((h >> 10) & 0x1F) as i32;
    let man = (h & 0x3FF) as u32;
    let bits: u32 = if exp == 0 {
        if man == 0 {
            (sign as u32) << 31
        } else {
            // subnormal: renormalise into f32. A half subnormal is
            // mantissa * 2^-24, so start the exponent at the smallest normal
            // half exponent (-14) and count the shifts.
            let mut e = -14i32;
            let mut m = man;
            while m & 0x400 == 0 {
                m <<= 1;
                e -= 1;
            }
            let m = (m & 0x3FF) as u32;
            let exp32 = (e + 127) as u32;
            ((sign as u32) << 31) | (exp32 << 23) | (m << 13)
        }
    } else if exp == 0x1F {
        ((sign as u32) << 31) | 0x7F80_0000 | (man << 13)
    } else {
        ((sign as u32) << 31) | (((exp - 15 + 127) as u32) << 23) | (man << 13)
    };
    f32::from_bits(bits)
}

fn round5(v: f32) -> f32 {
    if !v.is_finite() {
        return 0.0;
    }
    (v * 100_000.0).round() / 100_000.0
}

// ---------------------------------------------------------------------------
// Shader (material) names
// ---------------------------------------------------------------------------

/// RAGE's Jenkins one-at-a-time hash (`joaat`), lowercased — the same function the
/// game uses for every `MetaHash`, including shader/material names.
fn joaat(s: &str) -> u32 {
    let mut h: u32 = 0;
    for b in s.bytes() {
        h = h.wrapping_add((b as char).to_ascii_lowercase() as u32);
        h = h.wrapping_add(h << 10);
        h ^= h >> 6;
    }
    h = h.wrapping_add(h << 3);
    h ^= h >> 11;
    h = h.wrapping_add(h << 15);
    h
}

/// Shader names we can reverse a hash back to.
///
/// **This is a partial dictionary by design**: hashes are one-way, so a name can
/// only be recovered by hashing candidates. Anything not listed here is shown as
/// its hash (`#A9218C5D`) rather than guessed. Verified against real assets:
/// `vehicle_mesh`, `vehicle_paint3` (sabre GT) and `normal_spec` (pistol) resolve.
const SHADER_NAMES: &[&str] = &[
    "default",
    "normal",
    "normal_spec",
    "normal_um",
    "spec",
    "cutout",
    "alpha",
    "decal",
    "decal_glue",
    "emissive",
    "vehicle_basic",
    "vehicle_mesh",
    "vehicle_paint1",
    "vehicle_paint2",
    "vehicle_paint3",
    "vehicle_paint4",
    "vehicle_paint5",
    "vehicle_paint6",
    "vehicle_paint1_lvr",
    "vehicle_paint2_lvr",
    "vehicle_paint3_lvr",
    "vehicle_paint4_lvr",
    "vehicle_paint5_lvr",
    "vehicle_paint6_lvr",
    "vehicle_paint1_enveff",
    "vehicle_paint2_enveff",
    "vehicle_paint3_enveff",
    "vehicle_paint4_enveff",
    "vehicle_paint5_enveff",
    "vehicle_paint6_enveff",
    "vehicle_paint1_emissive",
    "vehicle_paint2_emissive",
    "vehicle_paint3_emissive",
    "vehicle_paint4_emissive",
    "vehicle_paint5_emissive",
    "vehicle_paint6_emissive",
    "vehicle_livery",
    "vehicle_sign_1",
    "vehicle_sign_2",
    "vehicle_licenseplate",
    "vehicle_badges",
    "vehicle_glass",
    "vehicle_shuts",
    "vehicle_detail",
    "vehicle_detail2",
    "vehicle_tyre",
    "vehicle_interior",
    "vehicle_interior2",
    "vehicle_trim",
    "vehicle_emis",
    "vehicle_emissive",
    "vehicle_license_plate",
    "vehicle_light",
    "vehicle_taillight",
    "vehicle_vehglass",
    "vehicle_vehglass_inner",
    "vehicle_dirt",
    "vehicle_badges2",
    "vehicle_vinyl",
];

/// Resolve `joaat(name)` back to a readable shader name, if it is in the table.
fn shader_name(hash: u32) -> Option<String> {
    SHADER_NAMES
        .iter()
        .find(|n| joaat(n) == hash)
        .map(|n| (*n).to_string())
}

// ---------------------------------------------------------------------------
// Frontend-facing shapes
// ---------------------------------------------------------------------------

/// One drawable geometry (`grcGeometry`) with its UV set and triangles.
#[derive(Serialize, Debug, Clone)]
pub struct UvMesh {
    pub id: usize,
    /// LOD list the model came from: `high` / `medium` / `low` / `verylow`.
    pub lod: String,
    /// Which drawable inside a `.yft` this came from (`0` = main drawable).
    pub drawable: usize,
    /// Shader index inside that drawable's shader group.
    pub shader: u16,
    /// Shader (material) name hash — `joaat` of the shader name.
    pub shader_hash: u32,
    /// Readable shader name when the hash is in the known-name table.
    pub shader_name: Option<String>,
    /// Which TexCoord semantic the UVs were read from (0..7).
    pub uv_set: u32,
    pub vertex_count: usize,
    pub index_count: usize,
    pub triangle_count: usize,
    /// Flat `[u, v, u, v, …]`, one pair per vertex.
    pub uvs: Vec<f32>,
    /// Flat triangle list (3 indices per triangle).
    pub indices: Vec<u32>,
    /// UV bounding box `[min_u, min_v, max_u, max_v]` (empty for no UV data).
    pub uv_bounds: Vec<f32>,
    /// Set when this geometry could not contribute UVs (reason).
    pub warning: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct UvDocument {
    pub path: String,
    pub file_name: String,
    /// `ydr` | `yft` | `ydd` (lowercase extension).
    pub kind: String,
    /// Packed resource version (`0xA2` = 162 yft, `0xA5` = 165 ydr).
    pub version: u32,
    /// True for gen9 / "Enhanced" resources (parsed layout differs — unsupported).
    pub gen9: bool,
    pub system_size: usize,
    pub graphics_size: usize,
    pub drawable_count: usize,
    pub meshes: Vec<UvMesh>,
    pub total_vertices: usize,
    pub total_triangles: usize,
    /// Distinct shader indices seen, for the material legend.
    pub shader_count: usize,
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Container: page flags -> block sizes
// ---------------------------------------------------------------------------

/// `RpfResourceFileEntry.GetSizeFromFlags` — decodes the byte size a page-flags
/// word describes (base size 512 << shift, times the sum of the page counts).
fn size_from_flags(flags: u32) -> usize {
    // NOTE: every term is parenthesised on purpose -- `+` binds tighter than
    // `<<` in Rust, so an unparenthesised sum silently shifts by `1 + rest`.
    let counts: u64 = (((flags >> 27) & 1) as u64)
        + ((((flags >> 26) & 1) as u64) << 1)
        + ((((flags >> 25) & 1) as u64) << 2)
        + ((((flags >> 24) & 1) as u64) << 3)
        + (((((flags >> 17) & 0x7F) as u64) << 4))
        + (((((flags >> 11) & 0x3F) as u64) << 5))
        + (((((flags >> 7) & 0xF) as u64) << 6))
        + (((((flags >> 5) & 3) as u64) << 7))
        + (((((flags >> 4) & 1) as u64) << 8));
    // 64-bit arithmetic then saturate: a corrupt flags word must not wrap.
    let base = 512u64.checked_shl(flags & 0xF).unwrap_or(u64::MAX);
    base.saturating_mul(counts).min(usize::MAX as u64) as usize
}

/// Version nibbles: `(system << 4) | graphics`. `GetVersionFromFlags`.
fn version_from_flags(sys: u32, gfx: u32) -> u32 {
    (((sys >> 28) & 0xF) << 4) + ((gfx >> 28) & 0xF)
}

/// Gen9 ("Enhanced") resources use a different vertex/index layout.
fn is_gen9_version(version: u32) -> bool {
    version == 154 || version == 159
}

fn inflate(payload: &[u8]) -> Result<Vec<u8>, String> {
    // RAGE gen8 payloads are raw RFC1951 deflate (no zlib wrapper); some tools
    // emit a zlib wrapper instead, so fall back to that before giving up.
    let mut out = Vec::new();
    if DeflateDecoder::new(payload).read_to_end(&mut out).is_ok() && !out.is_empty() {
        return Ok(out);
    }
    out.clear();
    if ZlibDecoder::new(payload).read_to_end(&mut out).is_ok() && !out.is_empty() {
        return Ok(out);
    }
    Err("decompression failed (not a deflate/zlib RSC7 payload)".to_string())
}

// ---------------------------------------------------------------------------
// Virtual-address reader
// ---------------------------------------------------------------------------

struct Resource {
    version: u32,
    system: Vec<u8>,
    graphics: Vec<u8>,
}

impl Resource {
    fn load(path: &Path) -> Result<Self, String> {
        let raw = fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
        if raw.len() < 16 {
            return Err("file is too small to be an RSC7 resource".to_string());
        }
        let magic = u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]);
        if magic != RSC7_MAGIC {
            return Err(format!(
                "not an RSC7 resource (magic 0x{magic:08X}; expected .ydr/.yft/.ydd, not a raw .meta/.xml)"
            ));
        }
        let sys_flags = u32::from_le_bytes([raw[8], raw[9], raw[10], raw[11]]);
        let gfx_flags = u32::from_le_bytes([raw[12], raw[13], raw[14], raw[15]]);
        let system_size = size_from_flags(sys_flags);
        let graphics_size = size_from_flags(gfx_flags);
        if system_size + graphics_size > MAX_BLOCK_BYTES {
            return Err(format!(
                "implausible resource size ({} MiB) — file is probably encrypted",
                (system_size + graphics_size) / (1024 * 1024)
            ));
        }
        let blob = inflate(&raw[16..])?;
        if blob.len() < system_size {
            return Err(format!(
                "decompressed data is short: {} bytes for a {} byte system block",
                blob.len(),
                system_size
            ));
        }
        let graphics = if graphics_size > 0 {
            let end = (system_size + graphics_size).min(blob.len());
            blob[system_size..end].to_vec()
        } else {
            Vec::new()
        };
        Ok(Self {
            version: version_from_flags(sys_flags, gfx_flags),
            system: blob[..system_size].to_vec(),
            graphics,
        })
    }

    /// Resolve a virtual pointer to `(block, byte offset)`.
    fn block(&self, ptr: u64) -> Result<(&[u8], usize), String> {
        let (block, off, name) = if ptr & 0x5000_0000 == SYSTEM_BASE {
            (&self.system, (ptr & 0x0FFF_FFFF) as usize, "system")
        } else if ptr & 0x6000_0000 == GRAPHICS_BASE {
            (&self.graphics, (ptr & 0x0FFF_FFFF) as usize, "graphics")
        } else {
            return Err(format!("illegal resource pointer 0x{ptr:016X}"));
        };
        if off >= block.len() {
            return Err(format!(
                "{name} pointer 0x{ptr:016X} is past the end of the block ({} bytes)",
                block.len()
            ));
        }
        Ok((block, off))
    }

    fn slice(&self, ptr: u64, len: usize) -> Result<&[u8], String> {
        if ptr == 0 {
            return Err("null pointer".to_string());
        }
        let (block, off) = self.block(ptr)?;
        let end = off
            .checked_add(len)
            .ok_or_else(|| "pointer+length overflow".to_string())?;
        if end > block.len() {
            return Err(format!(
                "read of {len} bytes at 0x{ptr:016X} runs past the block ({} available)",
                block.len() - off
            ));
        }
        Ok(&block[off..end])
    }

    fn u16_at(&self, ptr: u64) -> Result<u16, String> {
        let b = self.slice(ptr, 2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }
    fn u32_at(&self, ptr: u64) -> Result<u32, String> {
        let b = self.slice(ptr, 4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn u64_at(&self, ptr: u64) -> Result<u64, String> {
        let b = self.slice(ptr, 8)?;
        Ok(u64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    /// Read `count` u16 values (index buffers, shader maps, bone ids).
    fn u16s(&self, ptr: u64, count: usize) -> Result<Vec<u16>, String> {
        if ptr == 0 || count == 0 {
            return Ok(Vec::new());
        }
        if count > MAX_INDICES {
            return Err(format!("implausible list length {count}"));
        }
        let bytes = self.slice(ptr, count * 2)?;
        let mut out = Vec::with_capacity(count);
        for c in bytes.chunks_exact(2) {
            out.push(u16::from_le_bytes([c[0], c[1]]));
        }
        Ok(out)
    }

    /// Read `count` u64 values (pointer arrays).
    fn u64s(&self, ptr: u64, count: usize) -> Result<Vec<u64>, String> {
        if ptr == 0 || count == 0 {
            return Ok(Vec::new());
        }
        if count > 65_536 {
            return Err(format!("implausible pointer-array length {count}"));
        }
        let bytes = self.slice(ptr, count * 8)?;
        let mut out = Vec::with_capacity(count);
        for c in bytes.chunks_exact(8) {
            out.push(u64::from_le_bytes([
                c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7],
            ]));
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Vertex declaration
// ---------------------------------------------------------------------------

struct Declaration {
    flags: u32,
    /// Vertex stride in bytes. Read from the file and kept as part of the parsed declaration; the
    /// UV reader works from the component offsets, not from the stride.
    #[allow(dead_code)]
    stride: u16,
    types: u64,
}

impl Declaration {
    /// `VertexDeclaration.Read` (16 bytes).
    fn read(res: &Resource, ptr: u64) -> Result<Self, String> {
        Ok(Self {
            flags: res.u32_at(ptr)?,
            stride: res.u16_at(ptr + 4)?,
            types: res.u64_at(ptr + 8)?,
        })
    }

    fn has(&self, semantic: u32) -> bool {
        (self.flags >> semantic) & 1 == 1
    }

    fn component_type(&self, semantic: u32) -> u32 {
        ((self.types >> (semantic * 4)) & 0xF) as u32
    }

    /// `VertexDeclaration.GetComponentOffset` — byte offset of a semantic inside
    /// the vertex, accumulated over every *present* semantic before it.
    fn offset_of(&self, semantic: u32) -> usize {
        let mut off = 0;
        for i in 0..semantic {
            if self.has(i) {
                off += component_size(self.component_type(i));
            }
        }
        off
    }

    /// First present TexCoord semantic (UV0 preferred).
    fn uv_semantic(&self) -> Option<u32> {
        (SEM_TEXCOORD0..=SEM_TEXCOORD7).find(|s| self.has(*s))
    }

    /// Position semantic — decoded for the orthographic guide (`VertexComponentType`
    /// for positions is Float3 in every legacy asset seen so far; Float4/Half4 are
    /// accepted because a few packs pad it).
    fn position_type(&self) -> Option<u32> {
        if !self.has(SEM_POSITION) {
            return None;
        }
        match self.component_type(SEM_POSITION) {
            t @ (VT_FLOAT3 | VT_FLOAT4 | VT_HALF4) => Some(t),
            _ => None,
        }
    }

    #[allow(dead_code)]
    fn has_positions(&self) -> bool {
        self.position_type().is_some()
    }
}

// ---------------------------------------------------------------------------
// Drawable -> geometries -> UVs
// ---------------------------------------------------------------------------

/// Shader name hashes of a drawable, in shader-index order.
///
/// `DrawableBase+16` -> `ShaderGroup`; `+16` -> `ResourcePointerArray64<ShaderFX>`
/// (+24 = entry count) -> `ShaderFX+8` = the shader name hash.
fn read_shader_hashes(res: &Resource, drawable_ptr: u64) -> Vec<u32> {
    let out = (|| -> Result<Vec<u32>, String> {
        let group = res.u64_at(drawable_ptr + 16)?;
        if group == 0 {
            return Ok(Vec::new());
        }
        let array_ptr = res.u64_at(group + 16)?;
        let count = res.u16_at(group + 24)? as usize;
        if array_ptr == 0 || count == 0 || count > 512 {
            return Ok(Vec::new());
        }
        let mut hashes = Vec::with_capacity(count);
        for ptr in res.u64s(array_ptr, count)? {
            if ptr == 0 {
                hashes.push(0);
                continue;
            }
            hashes.push(res.u32_at(ptr + 8).unwrap_or(0));
        }
        Ok(hashes)
    })();
    out.unwrap_or_default()
}

/// LOD pointers live at these offsets in `DrawableBase`.
const LOD_POINTER_OFFSETS: [(u64, &str); 4] = [
    (80, "high"),
    (88, "medium"),
    (96, "low"),
    (104, "verylow"),
];

struct Sink<'a> {
    res: &'a Resource,
    meshes: Vec<UvMesh>,
    warnings: Vec<String>,
    shaders: Vec<u16>,
    /// Shader name hashes of the drawable currently being walked.
    shader_hashes: Vec<u32>,
    /// Vertex positions (xyz per vertex) — only filled when `want_positions`, and
    /// aligned with `meshes` by index. Kept out of `UvMesh` so the common import
    /// path does not pay for (or serialise) MB of coordinates it will not draw.
    want_positions: bool,
    positions: Vec<Vec<f32>>,
}

impl<'a> Sink<'a> {
    fn warn(&mut self, msg: String) {
        if self.warnings.len() < 40 {
            self.warnings.push(msg);
        }
    }

    /// One `DrawableGeometry` (`grcGeometry`) -> UV mesh.
    fn geometry(
        &mut self,
        geo_ptr: u64,
        lod: &str,
        drawable: usize,
        shader: u16,
        label: &str,
    ) {
        if self.meshes.len() >= MAX_MESHES {
            return;
        }
        let shader_hash = self.shader_hashes.get(shader as usize).copied().unwrap_or(0);
        let mut mesh = UvMesh {
            id: self.meshes.len(),
            lod: lod.to_string(),
            drawable,
            shader,
            shader_hash,
            shader_name: if shader_hash == 0 {
                None
            } else {
                shader_name(shader_hash)
            },
            uv_set: 0,
            vertex_count: 0,
            index_count: 0,
            triangle_count: 0,
            uvs: Vec::new(),
            indices: Vec::new(),
            uv_bounds: Vec::new(),
            warning: None,
        };

        // --- index buffer (96 B legacy): +8 count:u32, +16 indices ptr:u64 ---
        let ib_ptr = self.res.u64_at(geo_ptr + 56).unwrap_or(0);
        if ib_ptr != 0 {
            match (|| -> Result<Vec<u32>, String> {
                let count = self.res.u32_at(ib_ptr + 8)? as usize;
                if count > MAX_INDICES {
                    return Err(format!("implausible index count {count}"));
                }
                let ptr = self.res.u64_at(ib_ptr + 16)?;
                Ok(self
                    .res
                    .u16s(ptr, count)?
                    .into_iter()
                    .map(|v| v as u32)
                    .collect())
            })() {
                Ok(idx) => {
                    mesh.index_count = idx.len();
                    mesh.triangle_count = idx.len() / 3;
                    mesh.indices = idx;
                }
                Err(e) => mesh.warning = Some(format!("index buffer: {e}")),
            }
        }

        // --- vertex buffer (128 B legacy): +8 stride:u16, +16 data ptr:u64,
        //     +24 vertex count:u32, +48 declaration ptr:u64 ---
        let vb_ptr = self.res.u64_at(geo_ptr + 24).unwrap_or(0);
        if vb_ptr == 0 {
            if mesh.warning.is_none() {
                mesh.warning = Some("no vertex buffer".to_string());
            }
            self.positions.push(Vec::new());
            self.meshes.push(mesh);
            return;
        }

        let want_positions = self.want_positions;
        let mut positions: Vec<f32> = Vec::new();
        let read = (|| -> Result<(), String> {
            let stride = self.res.u16_at(vb_ptr + 8)? as usize;
            let data_ptr = self.res.u64_at(vb_ptr + 16)?;
            let vert_count = self.res.u32_at(vb_ptr + 24)? as usize;
            let decl_ptr = self.res.u64_at(vb_ptr + 48)?;
            if stride == 0 {
                return Err("vertex stride is 0".to_string());
            }
            if vert_count == 0 {
                mesh.warning = Some("vertex buffer is empty".to_string());
                return Ok(());
            }
            if vert_count > MAX_VERTICES {
                return Err(format!("implausible vertex count {vert_count}"));
            }
            let decl = Declaration::read(self.res, decl_ptr)?;
            // Positions first: the guide needs them even for a geometry whose UV
            // channel is missing (and it keeps the two walks independent).
            if want_positions {
                if let Some(pt) = decl.position_type() {
                    let psize = component_size(pt);
                    let poff = decl.offset_of(SEM_POSITION);
                    if poff + psize <= stride {
                        let raw = self.res.slice(data_ptr, vert_count * stride)?;
                        positions.reserve(vert_count * 3);
                        for v in 0..vert_count {
                            let b = v * stride + poff;
                            let f = |i: usize| -> f32 {
                                match pt {
                                    VT_FLOAT3 | VT_FLOAT4 => f32::from_le_bytes([
                                        raw[b + 4 * i],
                                        raw[b + 4 * i + 1],
                                        raw[b + 4 * i + 2],
                                        raw[b + 4 * i + 3],
                                    ]),
                                    _ => half_to_f32(u16::from_le_bytes([
                                        raw[b + 2 * i],
                                        raw[b + 2 * i + 1],
                                    ])),
                                }
                            };
                            positions.push(round5(f(0)));
                            positions.push(round5(f(1)));
                            positions.push(round5(f(2)));
                        }
                    }
                }
            }
            let semantic = match decl.uv_semantic() {
                Some(s) => s,
                None => {
                    mesh.vertex_count = vert_count;
                    mesh.warning = Some("geometry has no texture-coordinate channel".to_string());
                    return Ok(());
                }
            };
            mesh.uv_set = semantic - SEM_TEXCOORD0;
            let comp = decl.component_type(semantic);
            let comp_size = component_size(comp);
            if comp_size == 0 {
                return Err(format!("unsupported UV component type {comp}"));
            }
            let off = decl.offset_of(semantic);
            if off + comp_size > stride {
                return Err(format!(
                    "UV offset {off}+{comp_size} exceeds the vertex stride {stride}"
                ));
            }
            let raw = self.res.slice(data_ptr, vert_count * stride)?;
            let mut uvs = Vec::with_capacity(vert_count * 2);
            let mut min = (f32::MAX, f32::MAX);
            let mut max = (f32::MIN, f32::MIN);
            for v in 0..vert_count {
                let base = v * stride + off;
                let (u, w) = match comp {
                    VT_HALF2 => (
                        half_to_f32(u16::from_le_bytes([raw[base], raw[base + 1]])),
                        half_to_f32(u16::from_le_bytes([raw[base + 2], raw[base + 3]])),
                    ),
                    VT_FLOAT2 => (
                        f32::from_le_bytes([
                            raw[base],
                            raw[base + 1],
                            raw[base + 2],
                            raw[base + 3],
                        ]),
                        f32::from_le_bytes([
                            raw[base + 4],
                            raw[base + 5],
                            raw[base + 6],
                            raw[base + 7],
                        ]),
                    ),
                    other => return Err(format!("unsupported UV component type {other}")),
                };
                let (u, w) = (round5(u), round5(w));
                min.0 = min.0.min(u);
                min.1 = min.1.min(w);
                max.0 = max.0.max(u);
                max.1 = max.1.max(w);
                uvs.push(u);
                uvs.push(w);
            }
            mesh.vertex_count = vert_count;
            mesh.uvs = uvs;
            mesh.uv_bounds = vec![min.0, min.1, max.0, max.1];
            Ok(())
        })();

        if let Err(e) = read {
            mesh.warning = Some(e.clone());
            self.warn(format!("{label}: {e}"));
        }
        self.shaders.push(shader);
        self.positions.push(positions);
        self.meshes.push(mesh);
    }

    /// Every `DrawableModel` of every LOD list -> its geometries.
    fn drawable(&mut self, drawable_ptr: u64, index: usize, label: &str) {
        self.shader_hashes = read_shader_hashes(self.res, drawable_ptr);
        for (off, lod) in LOD_POINTER_OFFSETS {
            let header = match self.res.u64_at(drawable_ptr + off) {
                Ok(v) => v,
                Err(e) => {
                    self.warn(format!("{label}: {lod} LOD pointer: {e}"));
                    continue;
                }
            };
            if header == 0 {
                continue;
            }
            // ResourcePointerListHeader: +0 pointer:u64, +8 count:u16,
            // +10 capacity:u16 — CodeWalker walks `capacity` entries.
            let list = self.res.u64_at(header).unwrap_or(0);
            let capacity = self.res.u16_at(header + 10).unwrap_or(0) as usize;
            if list == 0 || capacity == 0 {
                continue;
            }
            let model_ptrs = match self.res.u64s(list, capacity) {
                Ok(v) => v,
                Err(e) => {
                    self.warn(format!("{label}: {lod} model list: {e}"));
                    continue;
                }
            };
            for (mi, model) in model_ptrs.into_iter().enumerate() {
                if model == 0 {
                    continue;
                }
                let geo_count = self.res.u16_at(model + 16).unwrap_or(0) as usize;
                let geo_list = self.res.u64_at(model + 8).unwrap_or(0);
                let shader_map_ptr = self.res.u64_at(model + 32).unwrap_or(0);
                if geo_count == 0 || geo_list == 0 {
                    continue;
                }
                let shader_map = self.res.u16s(shader_map_ptr, geo_count).unwrap_or_default();
                let geo_ptrs = match self.res.u64s(geo_list, geo_count) {
                    Ok(v) => v,
                    Err(e) => {
                        self.warn(format!("{label}: {lod} geometry list: {e}"));
                        continue;
                    }
                };
                for (gi, geo) in geo_ptrs.into_iter().enumerate() {
                    if geo == 0 {
                        continue;
                    }
                    let shader = shader_map.get(gi).copied().unwrap_or(0);
                    let lbl = format!("{label} {lod}[{mi}] geometry {gi}");
                    self.geometry(geo, lod, index, shader, &lbl);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Vertex positions of one geometry, for the orthographic guide.
#[derive(Serialize)]
pub struct PositionMesh {
    /// Index into `PositionDocument::meshes` — matches `UvDocument::meshes` order.
    pub id: usize,
    pub lod: String,
    pub shader: u16,
    pub vertex_count: usize,
    /// `xyz` triples, in the same vertex order as the UVs of that mesh.
    pub positions: Vec<f32>,
}

/// Positions-only payload. Sent on demand (the guide view) because the
/// coordinates roughly double the size of a parsed asset.
#[derive(Serialize)]
pub struct PositionDocument {
    pub path: String,
    pub file_name: String,
    pub meshes: Vec<PositionMesh>,
    pub total_vertices: usize,
}

/// Parse one `.ydr` / `.yft` / `.ydd` and return every geometry's UV set.
pub fn parse_uv_document(path: &str) -> Result<UvDocument, String> {
    parse_internal(path, false).map(|(doc, _)| doc)
}

/// Parse the same asset again, keeping vertex positions this time.
pub fn load_drawable_positions(path: &str) -> Result<PositionDocument, String> {
    let (doc, positions) = parse_internal(path, true)?;
    let mut meshes = Vec::with_capacity(doc.meshes.len());
    let mut total_vertices = 0;
    for (mesh, pos) in doc.meshes.iter().zip(positions.into_iter()) {
        total_vertices += mesh.vertex_count;
        meshes.push(PositionMesh {
            id: mesh.id,
            lod: mesh.lod.clone(),
            shader: mesh.shader,
            vertex_count: mesh.vertex_count,
            positions: pos,
        });
    }
    Ok(PositionDocument {
        path: doc.path,
        file_name: doc.file_name,
        meshes,
        total_vertices,
    })
}

fn parse_internal(path: &str, want_positions: bool) -> Result<(UvDocument, Vec<Vec<f32>>), String> {
    let p = Path::new(path);
    if !p.is_file() {
        return Err(format!("file not found: {path}"));
    }
    let kind = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let res = Resource::load(p)?;
    let gen9 = is_gen9_version(res.version);

    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string();

    let mut doc = UvDocument {
        path: path.to_string(),
        file_name,
        kind: kind.clone(),
        version: res.version,
        gen9,
        system_size: res.system.len(),
        graphics_size: res.graphics.len(),
        drawable_count: 0,
        meshes: Vec::new(),
        total_vertices: 0,
        total_triangles: 0,
        shader_count: 0,
        warnings: Vec::new(),
    };

    // Drawable roots: a `.yft` is a fragment (fragType) whose high LOD drawable is
    // a pointer inside the root block, with further LODs in `DrawableArray`. A
    // `.ydr` *is* the drawable. `.ydd` (drawable dictionary) is not supported yet.
    let mut drawables: Vec<(u64, String)> = Vec::new();
    match kind.as_str() {
        "yft" => {
            if res.u32_at(ROOT + 0x38).unwrap_or(0) != 0 {
                doc.warnings.push(
                    "fragment physics data is present — only the drawable geometry is mapped"
                        .to_string(),
                );
            }
            let main = res.u64_at(ROOT + 48).unwrap_or(0);
            if main != 0 {
                drawables.push((main, "Drawable".to_string()));
            }
            let arr_ptr = res.u64_at(ROOT + 56).unwrap_or(0);
            let arr_count = res.u32_at(ROOT + 72).unwrap_or(0) as usize;
            if arr_ptr != 0 && arr_count > 0 && arr_count <= 64 {
                match res.u64s(arr_ptr, arr_count) {
                    Ok(ptrs) => {
                        for (i, ptr) in ptrs.into_iter().enumerate() {
                            if ptr != 0 {
                                drawables.push((ptr, format!("LOD drawable {i}")));
                            }
                        }
                    }
                    Err(e) => doc.warnings.push(format!("drawable array: {e}")),
                }
            }
        }
        "ydr" => drawables.push((ROOT, "Drawable".to_string())),
        "ydd" => {
            doc.warnings.push(
                ".ydd drawable dictionaries are not supported yet — use the single .ydr/.yft files"
                    .to_string(),
            );
        }
        other => {
            return Err(format!(
                "unsupported file type '.{other}' — expected .ydr (drawable) or .yft (fragment)"
            ))
        }
    }

    if gen9 {
        doc.warnings.insert(
            0,
            format!(
                "this is a gen9 / GTA V Enhanced resource (version {}) — the vertex layout differs and is not supported yet",
                res.version
            ),
        );
    }
    if drawables.is_empty() {
        doc.warnings
            .push("no drawable found in this resource".to_string());
    }

    let positions_out: Vec<Vec<f32>>;
    {
        let mut sink = Sink {
            res: &res,
            meshes: Vec::new(),
            warnings: Vec::new(),
            shaders: Vec::new(),
            shader_hashes: Vec::new(),
            want_positions,
            positions: Vec::new(),
        };
        for (i, (ptr, label)) in drawables.iter().enumerate() {
            sink.drawable(*ptr, i, label);
        }
        sink.shaders.sort_unstable();
        sink.shaders.dedup();
        doc.shader_count = sink.shaders.len();
        doc.total_vertices = sink.meshes.iter().map(|m| m.vertex_count).sum();
        doc.total_triangles = sink.meshes.iter().map(|m| m.triangle_count).sum();
        doc.meshes = sink.meshes;
        doc.warnings.extend(sink.warnings);
        positions_out = sink.positions;
    }
    doc.drawable_count = drawables.len();
    Ok((doc, positions_out))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

use tauri_plugin_dialog::DialogExt;

/// Open the native file picker filtered to RAGE drawable/fragment resources.
#[tauri::command]
pub fn pick_resource_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("GTA V drawable / fragment", &["ydr", "yft", "ydd"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();
    Ok(picked.map(|p| p.to_string()))
}

/// Parse one resource and return its UV geometry for the map generator.
#[tauri::command]
pub fn load_uv_document(path: String) -> Result<UvDocument, String> {
    parse_uv_document(&path)
}

/// Parse one resource and return vertex positions, for the orthographic guide.
#[tauri::command]
pub fn load_vertex_positions(path: String) -> Result<PositionDocument, String> {
    load_drawable_positions(&path)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_flags_round_trip() {
        // A 128 KiB system block = two 64 KiB pages, packed with a 512 base.
        assert_eq!(size_from_flags(0xA000_0040), 131_072);
        // 0x20000000 has no page counts -> zero bytes.
        assert_eq!(size_from_flags(0x2000_0000), 0);
        assert_eq!(version_from_flags(0xA000_0040, 0x2000_0000), 0xA2);
        assert_eq!(version_from_flags(0xA000_0040, 0x5000_0000), 0xA5);
    }

    /// The shader-name table only works if `joaat` matches the game's hash, so
    /// pin it to values read straight out of real `ShaderFX` records.
    #[test]
    fn shader_names_resolve_from_real_hashes() {
        assert_eq!(joaat("vehicle_mesh"), 0xD963_B58B);
        assert_eq!(joaat("vehicle_paint3"), 0xE029_BF8E);
        assert_eq!(joaat("normal_spec"), 0x38DD_00DF);
        // Case-insensitive: RAGE hashes lowercased names.
        assert_eq!(joaat("Vehicle_Mesh"), joaat("vehicle_mesh"));
        assert_eq!(shader_name(0xD963_B58B).as_deref(), Some("vehicle_mesh"));
        assert_eq!(shader_name(0x1234_5678), None);
    }

    #[test]
    fn half_floats_match_ieee754() {
        assert_eq!(half_to_f32(0x0000), 0.0);
        assert_eq!(half_to_f32(0x3C00), 1.0);
        assert_eq!(half_to_f32(0xBC00), -1.0);
        assert!((half_to_f32(0x3555) - 0.333_251_95).abs() < 1e-6);
        assert_eq!(half_to_f32(0x7C00).is_infinite(), true);
        // subnormal 0x0001 = 5.96e-8
        assert!((half_to_f32(0x0001) - 5.960_464_5e-8).abs() < 1e-12);
    }

    #[test]
    fn declaration_offsets_accumulate_present_semantics() {
        // Position=Float3, Normal (semantic 3)=Float3, TexCoord0=Half2 -- a very
        // common GTA V layout.  TexCoord0 sits after both 12-byte attributes.
        let decl = Declaration {
            flags: (1 << 0) | (1 << 3) | (1 << 6),
            stride: 28,
            types: (VT_FLOAT3 as u64) | ((VT_FLOAT3 as u64) << 12) | ((VT_HALF2 as u64) << 24),
        };
        assert_eq!(decl.uv_semantic(), Some(6));
        assert_eq!(decl.offset_of(6), 24);
        assert_eq!(component_size(decl.component_type(6)), 4);
        assert_eq!(decl.offset_of(0), 0);
        assert_eq!(decl.offset_of(3), 12);
        assert!(decl.has_positions());
        assert_eq!(decl.stride as usize, decl.offset_of(6) + component_size(decl.component_type(6)));
    }

    #[test]
    fn rejects_non_resource_input() {
        let err = parse_uv_document("definitely-not-here.ydr").unwrap_err();
        assert!(err.contains("file not found"), "{err}");
    }

    #[test]
    fn position_type_accepts_padded_positions_only() {
        // flags bit 0 (Position) + bit 6 (TexCoord0), stride 24.
        let decl = |t: u64| Declaration {
            flags: (1 << 0) | (1 << 6),
            stride: 24,
            types: t,
        };
        assert_eq!(decl(VT_FLOAT3 as u64).position_type(), Some(VT_FLOAT3));
        assert_eq!(decl(VT_FLOAT4 as u64).position_type(), Some(VT_FLOAT4));
        assert_eq!(decl(VT_HALF4 as u64).position_type(), Some(VT_HALF4));
        // Half2 / Float2 are not positions, and an absent bit is not either.
        assert_eq!(decl(VT_HALF2 as u64).position_type(), None);
        assert_eq!(Declaration { flags: 1 << 6, ..decl(0) }.position_type(), None);
        // TexCoord0 still starts after the position it accumulates.
        assert_eq!(decl(VT_FLOAT3 as u64).offset_of(6), 12);
    }

    /// Real-asset check. Point `GT_TEST_RESOURCES` at a folder (or a `;`/newline
    /// separated list of folders) holding .ydr/.yft files.
    ///
    /// ```text
    /// $env:GT_TEST_RESOURCES="<pack>\stream"; cargo test -- --ignored uv_
    /// ```
    #[test]
    #[ignore]
    fn uv_real_resources_parse() {
        let spec = std::env::var("GT_TEST_RESOURCES").expect("set GT_TEST_RESOURCES");
        let mut files: Vec<std::path::PathBuf> = Vec::new();
        for part in spec.split([';', '\n']) {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let path = Path::new(part);
            if path.is_dir() {
                for entry in walkdir::WalkDir::new(path).max_depth(2) {
                    let entry = entry.expect("walk");
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let ext = entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if ext == "ydr" || ext == "yft" {
                        files.push(entry.path().to_path_buf());
                    }
                }
            } else if path.is_file() {
                files.push(path.to_path_buf());
            }
        }
        assert!(!files.is_empty(), "no .ydr/.yft files found in GT_TEST_RESOURCES");
        files.sort();
        let mut parsed = 0;
        let mut with_uv = 0;
        for (i, file) in files.iter().enumerate() {
            let doc = match parse_uv_document(&file.to_string_lossy()) {
                Ok(d) => d,
                Err(e) => panic!("{}: {e}", file.display()),
            };
            // The frontend mirrors this struct by hand (shared/models.ts), so print
            // the real serialized shape once for a manual key/type comparison.
            if i == 0 {
                let json = serde_json::to_value(&doc).expect("serialise");
                let top: Vec<&str> = json.as_object().unwrap().keys().map(|k| k.as_str()).collect();
                let mesh = json["meshes"].get(0).cloned().unwrap_or_default();
                println!("json top-level keys: {top:?}");
                println!(
                    "json mesh keys: {:?}",
                    mesh.as_object()
                        .map(|m| m.keys().map(|k| k.as_str()).collect::<Vec<_>>())
                        .unwrap_or_default()
                );
            }
            // `GT_DUMP_JSON=<dir>` writes the parsed document per file, so the
            // renderer can be exercised against real data in a browser. `?uvfile=`
            // loads the UV document, `?uvposfile=` the positions one.
            if let Ok(dir) = std::env::var("GT_DUMP_JSON") {
                let name = file
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("doc{i}"));
                let dir = std::path::PathBuf::from(&dir);
                let write = |suffix: &str, bytes: Vec<u8>| {
                    let out = dir.join(format!("{name}{suffix}.json"));
                    std::fs::write(&out, bytes).expect("write dump");
                    println!("dumped {}", out.display());
                };
                write("", serde_json::to_vec(&doc).expect("serialise"));
                let pos = load_drawable_positions(&file.to_string_lossy()).expect("positions");
                write(".pos", serde_json::to_vec(&pos).expect("serialise"));
            }
            parsed += 1;
            // Positions are loaded by a second pass (`load_vertex_positions`) and
            // must line up with the UV meshes vertex-for-vertex.
            let pos_doc = load_drawable_positions(&file.to_string_lossy())
                .unwrap_or_else(|e| panic!("{}: {e}", file.display()));
            assert_eq!(
                pos_doc.meshes.len(),
                doc.meshes.len(),
                "{}: position mesh count",
                file.display()
            );
            let mut with_pos = 0;
            for (i, (mesh, pm)) in doc.meshes.iter().zip(pos_doc.meshes.iter()).enumerate() {
                assert_eq!(pm.id, i);
                assert_eq!(pm.id, mesh.id);
                if pm.positions.is_empty() {
                    continue;
                }
                with_pos += 1;
                assert_eq!(
                    pm.positions.len(),
                    mesh.vertex_count * 3,
                    "{} mesh {i}: positions must be xyz per vertex",
                    file.display()
                );
                // GTA V is metres: a whole map is a few km across, so anything
                // past 1e5 means the declaration walk read the wrong bytes.
                for c in &pm.positions {
                    assert!(c.is_finite() && c.abs() < 100_000.0, "bad coordinate {c}");
                }
                // `GT_POS_REPORT=1` prints the same summary as the CodeWalker probe
                // (`Dev-Notes/03-Test-Field/prototypes/cwprobe`) for a numeric diff.
                if std::env::var("GT_POS_REPORT").is_ok() {
                    let (mut mn, mut mx) = ([f32::MAX; 3], [f32::MIN; 3]);
                    let mut sum = [0f64; 3];
                    let n = pm.positions.len() / 3;
                    for v in 0..n {
                        for a in 0..3 {
                            let c = pm.positions[v * 3 + a];
                            mn[a] = mn[a].min(c);
                            mx[a] = mx[a].max(c);
                            sum[a] += c as f64;
                        }
                    }
                    println!(
                        "  mesh[{i:3}] n={n} pos=[{:.3}..{:.3}]x[{:.3}..{:.3}]x[{:.3}..{:.3}] suma=({:.2},{:.2},{:.2})",
                        mn[0], mx[0], mn[1], mx[1], mn[2], mx[2], sum[0], sum[1], sum[2]
                    );
                }
            }
            println!(
                "  {}: {} meshes with positions of {}",
                file.file_name().unwrap_or_default().to_string_lossy(),
                with_pos,
                doc.meshes.len()
            );            let uv_verts: usize = doc
                .meshes
                .iter()
                .map(|m| m.uvs.len() / 2)
                .sum();
            if uv_verts > 0 {
                with_uv += 1;
                for mesh in &doc.meshes {
                    // UVs must be finite numbers and every index must be in range
                    // of the vertex it addresses -- the two cheapest proofs the
                    // declaration walk and the buffers were decoded correctly.
                    for &v in &mesh.uvs {
                        assert!(v.is_finite(), "{}: non-finite UV", file.display());
                    }
                    for &idx in &mesh.indices {
                        assert!(
                            (idx as usize) < mesh.vertex_count,
                            "{}: index {idx} past vertex_count {}",
                            file.display(),
                            mesh.vertex_count
                        );
                    }
                }
            }
            println!(
                "{}: {} meshes, {} verts, {} tris, {} warn",
                file.file_name().unwrap().to_string_lossy(),
                doc.meshes.len(),
                doc.total_vertices,
                doc.total_triangles,
                doc.warnings.len()
            );
        }
        println!("parsed {parsed} files, {with_uv} with UV data");
    }
}
