import defaultVertSrc from "./glsl/default.vert"
import defaultFragSrc from "./glsl/default.frag"
import splashVertSrc from "./glsl/splash.vert"
import splashFragSrc from "./glsl/splash.frag"
import fernGeoJSON from "./blender/fern.json"
import { mat4 } from "gl-matrix";
type WebGLCtx = WebGL2RenderingContextStrict;
import ArrayType = WebGLRenderingContextStrict.ArrayType;
import ShaderType = WebGLRenderingContextStrict.ShaderType;

abstract class Buffer {
  buf: WebGLBuffer;
  abstract target(gl: WebGLCtx): WebGL2RenderingContextStrict.BufferTarget;

  constructor(
    gl: WebGLCtx,
    usage: WebGL2RenderingContextStrict.BufferDataUsage,
    public data: Float32Array | Uint16Array | Uint8Array,
  ) {
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(this.target(gl), this.buf);
    gl.bufferData(this.target(gl), data, usage);
    gl.bindBuffer(this.target(gl), null);
  }

  bind(gl: WebGLCtx) { gl.bindBuffer(this.target(gl), this.buf); }
  unbind(gl: WebGLCtx) { gl.bindBuffer(this.target(gl), null); }
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
      const shdrKindName = ["VERTEX", "FRAGMENT"].find(x => (gl as any)[x + "_SHADER"] == kind);
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

  makeVAO(gl: WebGLCtx, bind: Map<string, Buffer>): WebGLVertexArrayObject {
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

  use(gl: WebGLCtx) {
    gl.useProgram(this.program);
  }
}

class Geometry {
  constructor(public vao: WebGLVertexArrayObject, public count: number) {}
  draw(gl: WebGLCtx) {
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
  }
}

class IndexedGeometry {
  constructor(public vao: WebGLVertexArrayObject, public indices: IndexBuffer) {}
  draw(gl: WebGLCtx) { 
    gl.bindVertexArray(this.vao);
    this.indices.bind(gl);
    gl.drawElements(gl.TRIANGLES, this.indices.data.length, gl.UNSIGNED_SHORT, 0);
    this.indices.unbind(gl);
    gl.bindVertexArray(null);
  }
}

/* one FRAMEbuffer with MSAA enabled, then another with a custom RENDERbuffer so that it can be
 * sampled as a texture for rendering onto a fullscreen quad.
 */
class PassMSAA {
  renderFrame: WebGLFramebuffer;
  colorFrame: WebGLFramebuffer;
  colorRenderbuffer: WebGLRenderbuffer;
  colorTexture: WebGLTexture;
  shaders: ShaderPair;
  fullscreenQuad: Geometry;
  constructor(gl: WebGLCtx, public width: number, public height: number) {
    const texture = this.colorTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // -- Init Frame Buffers
    const colorFrame = this.colorFrame = gl.createFramebuffer()!;
    const renderFrame = this.renderFrame = gl.createFramebuffer()!;
    const colorRenderbuffer = this.colorRenderbuffer = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 8, gl.RGBA8, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, renderFrame);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, colorFrame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.shaders = new ShaderPair(gl, {
      vert: {
        src: splashVertSrc,
        uniforms: [{ name: "diffuse", kind: "1i" }],
        attributes: [
          { name: "position", size: 2, kind: gl.FLOAT },
          { name: "texcoord", size: 2, kind: gl.FLOAT },
        ]
      },
      frag: { src: splashFragSrc, uniforms: [] }
    });

    this.fullscreenQuad = new Geometry(
      this.shaders.makeVAO(gl, new Map([
        ["position", new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array([
          -1.0, -1.0,
           1.0, -1.0,
           1.0,  1.0,
           1.0,  1.0,
          -1.0,  1.0,
          -1.0, -1.0
        ]))],
        ["texcoord", new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array([
          0.0, 1.0,
          1.0, 1.0,
          1.0, 0.0,
          1.0, 0.0,
          0.0, 0.0,
          0.0, 1.0
        ]))]
      ])),
      6
    );
  }

  delete(gl: WebGLCtx) {
    gl.deleteTexture(this.colorTexture);
    gl.deleteRenderbuffer(this.colorRenderbuffer);
    gl.deleteFramebuffer(this.renderFrame);
    gl.deleteFramebuffer(this.colorFrame);
  }

  startMSAA(gl: WebGLCtx) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderFrame);
    gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
  }

  showMSAA(gl: WebGLCtx) {
    // Blit framebuffers, no Multisample texture 2d in WebGL 2
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.renderFrame);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.colorFrame);
    gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      0, 0, this.width, this.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );

    // Pass 2
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shaders.use(gl);
    gl.uniform1i(this.shaders.uniforms.get("diffuse")!.loc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.fullscreenQuad.draw(gl);
  }

  withMSAA(gl: WebGLCtx, msaaRender: (gl: WebGLCtx) => void) {
    this.startMSAA(gl);
    msaaRender(gl);
    this.showMSAA(gl);
  }
}

class Rendr {
  pass: PassMSAA;
  shaders: ShaderPair;
  fern: IndexedGeometry;
  width: number;
  height: number;
  gl: WebGLCtx;
  constructor(canvas: HTMLCanvasElement) {
    this.width = canvas.width;
    this.height = canvas.height;
    const gl = this.gl = canvas.getContext( 'webgl2', { antialias: false } )! as any as WebGLCtx;

    const isWebGL2 = !!gl;
    if (!isWebGL2) {
      document.body.innerHTML = 'WebGL 2 is not available. See <a href="' +
        'https://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">' +
        'How to get a WebGL 2 implementation</a>';
      throw new Error("Couldn't initialize WebGL2 context");
    }

    this.shaders = new ShaderPair(gl, {
      vert: {
        src: defaultVertSrc,
        uniforms: [{ name: "MVP", kind: "Matrix4fv" }],
        attributes: [{ name: "position", size: 2, kind: gl.FLOAT }],
      },
      frag: { src: defaultFragSrc, uniforms: [] }
    });
    const { vertices, indices } = fernGeoJSON.mesh;
    const fernVertPoses = new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array(vertices.flat()));
    this.fern = new IndexedGeometry(
      this.shaders.makeVAO(gl, new Map([["position", fernVertPoses]])),
      new IndexBuffer(gl, gl.STATIC_DRAW, new Uint16Array(indices))
    );

    this.pass = new PassMSAA(gl, this.width, this.height);
    this.resize(canvas.width, canvas.height);
  }

  resize(width: number, height: number) {
    const { gl } = this;
    gl.viewport(0, 0, this.width = width, this.height = height);
    this.pass.delete(gl);
    this.pass = new PassMSAA(gl, width, height);
  }

  frame() {
    this.pass.withMSAA(this.gl, gl => {
      this.shaders.use(gl);

      let { width: w, height: h } = this;
      w /= 90; h /= 90;
      const mvp = mat4.ortho(mat4.create(), -w/2, w/2, -h/2, h/2, -1, 1);
      gl.uniformMatrix4fv(this.shaders.uniforms.get("MVP")!.loc, false, mvp);

      this.fern.draw(gl);
    });
  }
}

window.onload = () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const rendr = new Rendr(canvas);
  (window.onresize = () => {
    rendr.resize(
      canvas.width = window.innerWidth,
      canvas.height = window.innerHeight
    );
  })();

  (function frame() {
    rendr.frame();
    requestAnimationFrame(frame);
  })();
}
