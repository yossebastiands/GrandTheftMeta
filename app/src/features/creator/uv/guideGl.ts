/**
 * WebGL1 orthographic guide renderer.
 *
 * Why the GPU: the guide draws one triangle soup four times (front / side /
 * top / rear) and needs **per-pixel depth resolution**. Sorting islands or
 * triangles on the CPU (painter's algorithm) cannot do it — an island can span
 * both sides of a model, so its far half paints over the near half of the next
 * one and the result is an unreadable pile of polygons.
 *
 * Also here: pixel-exact island picking. The same geometry is rendered once
 * with the island id encoded as a colour, then one pixel is read back — far
 * more accurate (and simpler) than testing thousands of triangles in JS.
 */
import {
  GUIDE_PROJECTION,
  type GuideAxis,
  type GuideAxisBounds,
  type GuideDrawOptions,
  type GuidePanel,
  type GuideSoup,
  guidePanelAt,
  guideViewport,
} from "./guideRender";

const VERTEX_SHADER = `
attribute vec3 aPos;
attribute vec3 aColor;
attribute float aId;
uniform mat4 uProj;
varying vec3 vColor;
varying float vId;
void main() {
  vColor = aColor;
  vId = aId;
  gl_Position = uProj * vec4(aPos, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
varying float vId;
uniform float uIdMode;    // 1 = encode the island id into RGB
uniform float uHighlight; // island id + 1 to emphasise (0 = none)
uniform float uShade;     // 1 = fade by depth
void main() {
  float id = floor(vId + 0.5);
  if (uIdMode > 0.5) {
    gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
    return;
  }
  vec3 c = vColor;
  if (uHighlight > 0.5) {
    // Everything that is not the picked island fades towards the background.
    float other = step(0.5, abs(id - uHighlight));
    c = mix(c, c * 0.18 + vec3(0.03), other);
  }
  // gl_FragCoord.z is 0 at the near plane, 1 at the far plane.
  c *= mix(1.0, 0.55 + 0.45 * (1.0 - gl_FragCoord.z), uShade);
  gl_FragColor = vec4(c, 1.0);
}`;

/** Column-major orthographic projection (identical to glOrtho, no GLU). */
function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): number[] {
  return [
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -2 / (far - near),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    -(far + near) / (far - near),
    1,
  ];
}

/**
 * World `(x, y, z)` -> `(h, v, -depth)`, where `-depth` maps "closer" to a
 * smaller GL z so the standard ortho depth range works.
 */
function axisMatrix(axis: GuideAxis): number[] {
  const p = GUIDE_PROJECTION[axis];
  const m = new Array<number>(16).fill(0);
  // Column i = image of world axis i.
  const set = (world: number, out: number, value: number) => {
    m[world * 4 + out] = value;
  };
  set(p.h[0], 0, p.h[1]);
  set(p.v[0], 1, p.v[1]);
  set(p.d[0], 2, -p.d[1]);
  m[15] = 1;
  return m;
}

/** Column-major `a * b`. */
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Matrices per axis, recomputed when the soup's extents change. */
function projectionMatrix(bounds: GuideAxisBounds, axis: GuideAxis): number[] {
  const hSpan = Math.max(bounds.hMax - bounds.hMin, 1e-6);
  const vSpan = Math.max(bounds.vMax - bounds.vMin, 1e-6);
  const padH = hSpan * 0.02;
  const padV = vSpan * 0.02;
  // Depth is stored pre-negated by `axisMatrix`, so near/far come flipped.
  const proj = ortho(
    bounds.hMin - padH,
    bounds.hMax + padH,
    bounds.vMin - padV,
    bounds.vMax + padV,
    -bounds.dMax - 0.5,
    -bounds.dMin + 0.5
  );
  return mul(proj, axisMatrix(axis));
}

export interface GuideSnapshot {
  width: number;
  height: number;
  /** Top-down RGBA, ready for `ImageData` / `putImageData`. */
  pixels: Uint8ClampedArray;
}

export interface GuideGl {
  /** Replace the geometry (rebuilds the three vertex buffers). */
  upload(soup: GuideSoup): void;
  /** Draw every panel into this canvas. */
  draw(
    panels: GuidePanel[],
    opts: GuideDrawOptions,
    zoom: number,
    panX: number,
    panY: number
  ): void;
  /**
   * Island palette index under a device-pixel position, or null.
   * `panels` must be the same layout that was last drawn.
   */
  pick(
    panels: GuidePanel[],
    px: number,
    py: number,
    zoom: number,
    panX: number,
    panY: number
  ): number | null;
  /**
   * Copy the rendered frame out of the GL drawing buffer.
   *
   * `drawImage(glCanvas, ...)` is not reliable for a canvas that is **not in the
   * document** — Chromium composites GL canvases through a shared image, so a
   * detached one blits blank (which is exactly how the in-app preview broke
   * while the exported PNG stayed correct). `readPixels` is guaranteed, and the
   * rows are flipped here so callers can use `putImageData` directly.
   */
  snapshot(): GuideSnapshot;
  dispose(): void;
}

interface GlState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  posBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  idBuffer: WebGLBuffer;
  vertexCount: number;
  pickFramebuffer: WebGLFramebuffer;
  pickColor: WebGLTexture;
  pickDepth: WebGLRenderbuffer;
  uProj: WebGLUniformLocation | null;
  uIdMode: WebGLUniformLocation | null;
  uHighlight: WebGLUniformLocation | null;
  uShade: WebGLUniformLocation | null;
  dispose(): void;
}

function createGlState(canvas: HTMLCanvasElement): GlState | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    // Needed so `toBlob()` after a draw still sees the rendered image.
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null;
  if (!gl) return null;

  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`guide shader: ${log}`);
    }
    return shader;
  };

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`guide program: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);

  const posBuffer = gl.createBuffer()!;
  const colorBuffer = gl.createBuffer()!;
  const idBuffer = gl.createBuffer()!;

  const pickColor = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, pickColor);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const pickDepth = gl.createRenderbuffer()!;
  const pickFramebuffer = gl.createFramebuffer()!;

  return {
    gl,
    program,
    posBuffer,
    colorBuffer,
    idBuffer,
    vertexCount: 0,
    pickFramebuffer,
    pickColor,
    pickDepth,
    uProj: gl.getUniformLocation(program, "uProj"),
    uIdMode: gl.getUniformLocation(program, "uIdMode"),
    uHighlight: gl.getUniformLocation(program, "uHighlight"),
    uShade: gl.getUniformLocation(program, "uShade"),
    dispose() {
      gl.deleteBuffer(posBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteBuffer(idBuffer);
      gl.deleteTexture(pickColor);
      gl.deleteRenderbuffer(pickDepth);
      gl.deleteFramebuffer(pickFramebuffer);
      gl.deleteProgram(program);
    },
  };
}

/** Bind the three attribute streams to the current program. */
function bindBuffers(state: GlState): void {
  const { gl, program } = state;
  const attribs: [WebGLBuffer, string, number][] = [
    [state.posBuffer, "aPos", 3],
    [state.colorBuffer, "aColor", 3],
    [state.idBuffer, "aId", 1],
  ];
  for (const [buffer, name, size] of attribs) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
}

function clearColour(bg: GuideDrawOptions["background"]): [number, number, number, number] {
  if (bg === "light") return [0.973, 0.98, 0.988, 1];
  if (bg === "transparent") return [0, 0, 0, 0];
  return [0.067, 0.094, 0.153, 1];
}

export function createGuideRenderer(canvas: HTMLCanvasElement): GuideGl | null {
  const state = createGlState(canvas);
  if (!state) return null;
  const { gl } = state;
  const matrices = new Map<GuideAxis, number[]>();

  const upload = (next: GuideSoup) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, next.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, next.colors, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.idBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, next.ids, gl.STATIC_DRAW);
    state.vertexCount = next.vertexCount;
    matrices.clear();
    for (const axis of ["front", "side", "top", "rear"] as GuideAxis[]) {
      matrices.set(axis, projectionMatrix(next.bounds[axis], axis));
    }
  };

  const bindPanelViewport = (panel: GuidePanel, zoom: number, panX: number, panY: number) => {
    const vp = guideViewport(panel, zoom, panX, panY);
    // GL's origin is bottom-left, the layout's is top-left.
    gl.viewport(vp.x, canvas.height - vp.y - vp.height, vp.width, vp.height);
    gl.scissor(panel.rect.x, canvas.height - panel.rect.y - panel.rect.height, panel.rect.width, panel.rect.height);
  };

  const draw = (
    panels: GuidePanel[],
    opts: GuideDrawOptions,
    zoom: number,
    panX: number,
    panY: number
  ) => {
    const [r, g, b, a] = clearColour(opts.background);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE); // depth alone resolves a closed model; winding is unknown
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clearDepth(1);
    gl.useProgram(state.program);
    gl.uniform1f(state.uIdMode, 0);
    gl.uniform1f(state.uHighlight, opts.highlight === null ? 0 : opts.highlight + 1);
    gl.uniform1f(state.uShade, opts.shade === false ? 0 : 1);
    bindBuffers(state);

    // Frames between panels stay transparent so the CSS background shows.
    gl.scissor(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (const panel of panels) {
      bindPanelViewport(panel, zoom, panX, panY);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(state.uProj, false, matrices.get(panel.axis) ?? axisMatrix(panel.axis));
      gl.drawArrays(gl.TRIANGLES, 0, state.vertexCount);
    }
    gl.disable(gl.SCISSOR_TEST);
  };

  /** Render every panel with island ids as colours, then read one pixel. */
  const pick = (
    panels: GuidePanel[],
    px: number,
    py: number,
    zoom: number,
    panX: number,
    panY: number
  ): number | null => {
    const panelIndex = guidePanelAt(panels, px, py);
    if (panelIndex < 0) return null;
    const panel = panels[panelIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.pickFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, state.pickColor);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      canvas.width,
      canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, state.pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      state.pickColor,
      0
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      state.pickDepth
    );

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.scissor(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(state.uIdMode, 1);
    gl.uniform1f(state.uShade, 0);
    bindBuffers(state);
    bindPanelViewport(panel, zoom, panX, panY);
    gl.uniformMatrix4fv(state.uProj, false, matrices.get(panel.axis) ?? axisMatrix(panel.axis));
    gl.drawArrays(gl.TRIANGLES, 0, state.vertexCount);
    gl.disable(gl.SCISSOR_TEST);

    const pixel = new Uint8Array(4);
    // 1x1 readPixels is allowed inside whatever scissor/viewport is active.
    gl.readPixels(
      Math.floor(px),
      canvas.height - Math.floor(py),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.uniform1f(state.uIdMode, 0);

    const id = pixel[0] + pixel[1] * 256;
    if (id <= 0) return null;
    return id - 1;
  };

  /**
   * GL reads bottom-up while browsers expect top-down, so the rows are
   * reversed. The byte buffer is reused between frames.
   */
  let snapBuffer: Uint8Array | null = null;
  const snapshot = (): GuideSnapshot => {
    const w = canvas.width;
    const h = canvas.height;
    const bytes = w * h * 4;
    if (!snapBuffer || snapBuffer.length !== bytes) snapBuffer = new Uint8Array(bytes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, snapBuffer);
    const pixels = new Uint8ClampedArray(bytes);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      pixels.set(snapBuffer.subarray(src, src + rowBytes), y * rowBytes);
    }
    return { width: w, height: h, pixels };
  };

  return { upload, draw, pick, snapshot, dispose: state.dispose };
}
