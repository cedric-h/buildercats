import defaultVertSrc from "./glsl/default.vert"
import defaultFragSrc from "./glsl/default.frag"
import fullscreenVertSrc from "./glsl/fullscreen.vert"
import fullscreenFragSrc from "./glsl/fullscreen.frag"
import fernGeoJSON from "./blender/fern.json"
type WebGLCtx = WebGL2RenderingContextStrict;
import ArrayType = WebGLRenderingContextStrict.ArrayType;
import ShaderType = WebGLRenderingContextStrict.ShaderType;

class Mat4 {
  data: number[][];
  constructor() { 
    this.data = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }
  static ortho(view_width: number, view_height: number, near_z: number, far_z: number) {
    const f_range = 1.0 / (far_z - near_z);
    const ret = new Mat4();
    ret.data[0][0] = 2.0 / view_width;
    ret.data[1][1] = 2.0 / view_height;
    ret.data[2][2] = f_range;
    ret.data[3][2] = -f_range * near_z;
    return ret;
  }
  transpose() {
    const res = new Mat4();
    for(let c = 0; c < 4; c++)
      for(let r = 0; r < 4; r++)
        res.data[r][c] = this.data[c][r];
    return res;
  }
}

class Vec2 {
  constructor(public x: number, public y: number) {}
  static zero() { return new Vec2(0, 0); }
  add(v: Vec2) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(v: Vec2) { return new Vec2(this.x * v.x, this.y * v.y); }
  div(v: Vec2) { return new Vec2(this.x / v.x, this.y / v.y); }
  addf(f: number) { return new Vec2(this.x + f, this.y + f); }
  subf(f: number) { return new Vec2(this.x - f, this.y - f); }
  mulf(f: number) { return new Vec2(this.x * f, this.y * f); }
  divf(f: number) { return new Vec2(this.x / f, this.y / f); }
}

abstract class Buffer {
  buf: WebGLBuffer;
  abstract target(gl: WebGLCtx): WebGL2RenderingContextStrict.BufferTarget;

  constructor(
    gl: WebGLCtx,
    data: Float32Array | Uint16Array | Uint8Array,
    usage: WebGL2RenderingContextStrict.BufferDataUsage,
  ) {
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(this.target(gl), this.buf);
    gl.bufferData(this.target(gl), data, usage);
    gl.bindBuffer(this.target(gl), null);
  }

  bind(gl: WebGLCtx) {
    gl.bindBuffer(this.target(gl), this.buf);
  }
}
class VertexBuffer extends Buffer {
  target(gl: WebGLCtx) { return gl.ARRAY_BUFFER }
}
class IndexBuffer extends Buffer {
  target(gl: WebGLCtx) { return gl.ELEMENT_ARRAY_BUFFER }
}

type UniformDesc = { name: string; kind: string; }
type FragStageDesc = { src: string; uniforms: UniformDesc[] };
type AttributeDesc = {
  name: string;
  size: 1 | 2 | 3 | 4;
  kind: ArrayType;
  normalized?: GLboolean;
  stride?: GLsizei;
  offset?: GLintptr;
  instanced?: number
}
type VertStageDesc = FragStageDesc & { attributes: AttributeDesc[] };
type ShaderPairDesc = { vert: VertStageDesc, frag: FragStageDesc };
class ShaderPair {
  program: WebGLProgram;
  uniforms: Map<string, { loc: WebGLUniformLocation, kind: string }>;
  attrs: (AttributeDesc & { loc: number })[];
  constructor(gl: WebGLCtx, desc: ShaderPairDesc) {
    function createShader(kind: ShaderType, src: string) {
      const shdr = gl.createShader(kind)!;
      gl.shaderSource(shdr, src);
      gl.compileShader(shdr);
      if (gl.getShaderParameter(shdr, gl.COMPILE_STATUS))
        return shdr;

      const info = gl.getShaderInfoLog(shdr);
      gl.deleteShader(shdr);
      const shdrKindName = ["VERTEX_SHADER", "FRAGMENT_SHADER"].find(x => (gl as any)[x] == kind);
      throw new Error("Couldn't compile " + shdrKindName + ": " + info);
    }

    function createProgram(vert: WebGLShader, frag: WebGLShader) {
      const program = gl.createProgram()!;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS))
        return program;
     
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error("" + info);
    }

    this.program = createProgram(
      createShader(gl.VERTEX_SHADER, desc.vert.src),
      createShader(gl.FRAGMENT_SHADER, desc.frag.src)
    );
    gl.useProgram(this.program);
    this.uniforms = new Map([desc.frag.uniforms, desc.vert.uniforms].flat().map(u => {
      return [u.name, { loc: gl.getUniformLocation(this.program, u.name)!, kind: u.kind }];
    }));
    this.attrs = desc.vert.attributes.map(a => Object.assign({
      loc: gl.getAttribLocation(this.program, a.name)
    }, a));
  }

  /* TODO: devise a nicer API for uniforms */
  setUniformMat4(gl: WebGL2RenderingContextStrict, name: string, val: Mat4) {
    const uni = this.uniforms.get(name);
    if (!uni) throw new Error("No such uniform " + name);
    if (uni.kind != "Matrix4fv")
      throw new Error("Cannot call setUniformMat4 on a " + uni.kind + " uniform.");
    gl.uniformMatrix4fv(uni.loc, false, val.data.flat());
  }

  use(gl: WebGLCtx, bind: Map<string, Buffer>): WebGLVertexArrayObject {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.useProgram(this.program);
    for (const { name, loc, size, kind, normalized, stride, offset, instanced } of this.attrs) {
      bind.get(name)!.bind(gl);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, kind, normalized ?? false, stride ?? 0, offset ?? 0);
      if (typeof instanced == "number")
        gl.vertexAttribDivisor(loc, instanced);
    }
    gl.bindVertexArray(null);
    return vao;
  }
}

class Pass {
  targetTexture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  constructor(gl: WebGLCtx, width: number, height: number) {
    const targetTextureWidth = this.width = width * 2;
    const targetTextureHeight = this.height = height * 2;
    this.targetTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
     
    // define size and format of level 0
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      targetTextureWidth,
      targetTextureHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
   
    // set the filtering so we don't need mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.framebuffer = gl.createFramebuffer()!;
  }
  bind(gl: WebGLCtx) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.targetTexture, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
  }
  free(gl: WebGLCtx) {
    gl.deleteTexture(this.targetTexture);
    gl.deleteFramebuffer(this.framebuffer);
  }
}

type MeshData = {
  vertices: [number, number][];
  indices: number[];
}
class Geometry {
  vertices: VertexBuffer;
  indices: IndexBuffer;
  indexCount: number;
  constructor(gl: WebGLCtx, {vertices, indices}: MeshData) {
    vertices = vertices.map(([x, y]) => [x, -y]);
    this.indexCount = indices.length;
    this.vertices = new VertexBuffer(gl, new Float32Array(vertices.flat()), gl.STATIC_DRAW);
    this.indices = new IndexBuffer(gl, new Uint16Array(indices), gl.STATIC_DRAW);
  }
  static scaled(gl: WebGLCtx, scale: number, {vertices, indices}: MeshData) {
    type Tri = [number, number, number]; /* indices */
    const tris = Array.from({ length: indices.length / 3 },
                            (_, i) => indices.slice(i * 3, i * 3 + 3) as Tri);
    function triTraverse(sib: Tri, polygon: Set<Tri>) {
      polygon.add(sib);
      for (const tri of tris)
        if (!polygon.has(tri) && tri.some(x => sib.some(y => x == y)))
          triTraverse(tri, polygon);
    }
    const polygons: Set<Tri>[] = [];
    for (const tri of tris)
      if (!polygons.some(p => p.has(tri))) {
        const p = new Set<Tri>();
        polygons.push(p);
        triTraverse(tri, p);
      }

    for (const poly of polygons) {
      const polyVerts = [...poly]
        .map(t => t.map(i => [i, new Vec2(...vertices[i])]))
        .flat() as [number, Vec2][];
      const center = polyVerts
        .reduce((a, [_,v]) => a.add(v), Vec2.zero())
        .divf(polyVerts.length);
      for (const [i, v] of polyVerts) {
        const scaled = v.sub(center).mulf(scale).add(center);
        vertices[i] = [scaled.x, scaled.y];
      }
    }
    return new Geometry(gl, { vertices, indices });
  }
}

class Rendr {
  gl: WebGLCtx;
  defaultPass: Pass;
  indexCount: number;
  fernIn: WebGLVertexArrayObject;
  fernOut: WebGLVertexArrayObject;
  fernInGeo: Geometry;
  fernOutGeo: Geometry;
  cam: Mat4 = new Mat4();
  shaderPair: ShaderPair;
  constructor(canvas: HTMLCanvasElement) {
    const gl = this.gl = (() => {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false }) as any as WebGLCtx;
      if (gl == null)
        throw new Error("Couldn't get WebGL2RenderingContext from HTMLCanvasElement");
      return gl;
    })();

    this.defaultPass = new Pass(gl, canvas.width, canvas.height);
    window.addEventListener("resize", () => {
      const width  = canvas.width  = window.innerWidth;
      const height = canvas.height = window.innerHeight;
      gl.viewport(0, 0, width, height);
      this.defaultPass.free(gl);
      this.defaultPass = new Pass(gl, width, height);
      this.cam = Mat4.ortho(this.defaultPass.width  * 0.005,
                            this.defaultPass.height * 0.005,
                            -1.0, 1.0);
    });
    window.dispatchEvent(new UIEvent("resize"));

    this.shaderPair = new ShaderPair(gl, {
      vert: {
        src: defaultVertSrc,
        uniforms: [ { name: "u_mvp", kind: "Matrix4fv" } ],
        attributes: [
          { name: "a_pos",        size: 2, kind: gl.FLOAT                                         },
          { name: "a_inst_color", size: 4, kind: gl.UNSIGNED_BYTE, instanced: 1, normalized: true },
          { name: "a_inst_pos",   size: 2, kind: gl.FLOAT,         instanced: 1,                  },
          { name: "a_inst_scale", size: 1, kind: gl.FLOAT,         instanced: 1,                  },
        ]
      },
      frag: { src: defaultFragSrc, uniforms: [] }
    });

    const fernOut = new Geometry(gl, fernGeoJSON.mesh);
    const fernIn = Geometry.scaled(gl, 0.78, fernGeoJSON.mesh);

    const insts = [
      { color: [0.30, 0.70, 0.35, 1.0], pos: [ 0.0, 1.0 ], scale: 1.00 },
    ];
    let colors = insts.map(i => i.color).flat().map(x => Math.round(x * 255));
    const inColorBuf = new VertexBuffer(gl, new Uint8Array(colors), gl.STATIC_DRAW);
    colors = colors.map(x => Math.round(x * 0.75));
    const outColorBuf = new VertexBuffer(gl, new Uint8Array(colors), gl.STATIC_DRAW);

    const poses = insts.map(i => i.pos).flat();
    const posBuf = new VertexBuffer(gl, new Float32Array(poses), gl.STATIC_DRAW);

    const scales = insts.map(i => i.scale);
    const scaleBuf = new VertexBuffer(gl, new Float32Array(scales), gl.STATIC_DRAW);

    const attributes = new Map([
      [ "a_pos",         fernIn.vertices ],
      [ "a_inst_color",  inColorBuf      ],
      [ "a_inst_pos",    posBuf          ],
      [ "a_inst_scale",  scaleBuf        ],
    ]);
    this.fernIn = this.shaderPair.use(gl, attributes);
    attributes.set("a_pos", fernOut.vertices);
    attributes.set("a_inst_color", outColorBuf);
    this.fernOut = this.shaderPair.use(gl, attributes);

    this.fernInGeo = fernIn;
    this.fernOutGeo = fernOut;

    this.indexCount = fernIn.indexCount;
  }

  frame() {
    const { gl, shaderPair } = this;
    this.defaultPass.bind(gl);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    shaderPair.setUniformMat4(gl, "u_mvp", this.cam);

    /* abusing the fact that the indices are identical for in and out */
    this.fernInGeo.indices.bind(gl);

    gl.bindVertexArray(this.fernOut);
    this.fernOutGeo.indices.bind(gl);
    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, 1);

    gl.bindVertexArray(this.fernIn);
    this.fernInGeo.indices.bind(gl);
    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, 1);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.defaultPass.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.defaultPass.width, this.defaultPass.height,
                       0, 0,      window.innerWidth,      window.innerHeight,
                       gl.COLOR_BUFFER_BIT, gl.LINEAR);
  }
}

window.onload = () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const rdr = new Rendr(canvas);
  (function frame() {
    rdr.frame();
    requestAnimationFrame(frame);
  })();
}
