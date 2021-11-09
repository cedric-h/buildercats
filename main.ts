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
    public data: BufferSource & { length: number }
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

type FragStageDesc = { src: string; };
type AttribDesc = {
  size: 1 | 2 | 3 | 4;
  kind: ArrayType;
  normalized?: GLboolean;
  stride?: GLsizei;
  offset?: GLintptr;
  instanced?: number
}
type VertStageDesc<AttribKey extends string> =
  FragStageDesc & { attributes: Record<AttribKey, AttribDesc> };
type ShaderPairDesc<UniformKey extends string, AttribKey extends string> = {
  uniforms: Record<UniformKey, string>,
  vert: VertStageDesc<AttribKey>,
  frag: FragStageDesc,
};
class ShaderPair<K extends { attribKeys: string; uniformKeys: string; }> {
  program: WebGLProgram;
  uniforms = {} as Record<K["uniformKeys"], { loc: WebGLUniformLocation, kind: string }>;
  attrs = {} as Record<K["attribKeys"], AttribDesc & { loc: number }>;
  constructor(gl: WebGLCtx, desc: ShaderPairDesc<K["uniformKeys"], K["attribKeys"]>) {
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

    const uniDescs = Object.entries(desc.uniforms) as [K["uniformKeys"], string][];
    for (const [name, kind] of uniDescs)
      this.uniforms[name] = { loc: gl.getUniformLocation(this.program, name)!, kind };

    const attrDescs = Object.entries(desc.vert.attributes) as [K["attribKeys"], AttribDesc][];
    for (const [name, attr] of attrDescs)
      this.attrs[name] = { loc: gl.getAttribLocation(this.program, name), ...attr };
  }

  makeVAO(gl: WebGLCtx, bind: Record<K["attribKeys"], Buffer>): WebGLVertexArrayObject {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.useProgram(this.program);
    for (const n in this.attrs) {
      const name = n as K["attribKeys"];
      const { loc, size, kind, normalized, stride, offset, instanced } = this.attrs[name];
      bind[name].bind(gl);
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

/* this is a series of workarounds to get reliable MSAA on WebGL. You can't initialize your canvas
 * with MSAA -- if you pass antialias: true, you don't know how much MSAA you're getting -- though
 * you can make a separate framebuffer with MSAA. you'd think you could simply sample that
 * framebuffer onto your canvas with a fullscreen quad. however, you can't directly sample an MSAA
 * framebuffer ... so you have to use another non-MSAA framebuffer as a proxy, dumping the MSAA's
 * contents into it using gl.blitFramebuffer.   ... yeah.
 */
class FrameMSAA {
  renderFrame: WebGLFramebuffer;
  colorFrame: WebGLFramebuffer;
  colorRenderbuffer: WebGLRenderbuffer;
  colorTexture: WebGLTexture;
  constructor(gl: WebGLCtx, public width: number, public height: number) {
    const texture = this.colorTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

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
  }

  delete(gl: WebGLCtx) {
    gl.deleteTexture(this.colorTexture);
    gl.deleteRenderbuffer(this.colorRenderbuffer);
    gl.deleteFramebuffer(this.renderFrame);
    gl.deleteFramebuffer(this.colorFrame);
  }

  bind(gl: WebGLCtx) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderFrame);
    gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
  }

  blit(gl: WebGLCtx) {
    // Blit framebuffers, no Multisample texture 2d in WebGL 2
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.renderFrame);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.colorFrame);
    gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      0, 0, this.width, this.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );
  }
}

class SplashPassMSAA {
  frame: FrameMSAA;
  shaders: ShaderPair<{ attribKeys: "a_pos" | "a_tex", uniformKeys: "u_diffuse" }>;
  fullscreenQuad: Geometry;
  constructor(gl: WebGLCtx, width: number, height: number) {
    this.shaders = new ShaderPair(gl, {
      uniforms: { u_diffuse: "1i" },
      vert: {
        src: splashVertSrc,
        attributes: {
          a_pos: { size: 2, kind: gl.FLOAT },
          a_tex: { size: 2, kind: gl.FLOAT },
        },
      },
      frag: { src: splashFragSrc }
    });

    this.fullscreenQuad = new Geometry(
      this.shaders.makeVAO(gl, {
        a_pos: new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array([
          -1.0, -1.0,
           1.0, -1.0,
           1.0,  1.0,
           1.0,  1.0,
          -1.0,  1.0,
          -1.0, -1.0
        ])),
        a_tex: new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array([
          0.0, 1.0,
          1.0, 1.0,
          1.0, 0.0,
          1.0, 0.0,
          0.0, 0.0,
          0.0, 1.0
        ]))
      }),
      6
    );

    this.frame = new FrameMSAA(gl, width, height);
  }

  resize(gl: WebGLCtx, width: number, height: number) {
    this.frame.delete(gl);
    this.frame = new FrameMSAA(gl, width, height);
  }

  withMSAA(gl: WebGLCtx, msaaRender: (gl: WebGLCtx) => void) {
    this.frame.bind(gl);
    msaaRender(gl);
    this.frame.blit(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shaders.use(gl);
    gl.uniform1i(this.shaders.uniforms.u_diffuse.loc, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frame.colorTexture);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.fullscreenQuad.draw(gl);
  }
}

class Rendr {
  pass: SplashPassMSAA;
  shaders: ShaderPair<{ attribKeys: "a_pos", uniformKeys: "u_mvp" }>;
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
      uniforms: { u_mvp: "Matrix4fv" },
      vert: {
        src: defaultVertSrc,
        attributes: { a_pos: { size: 2, kind: gl.FLOAT } },
      },
      frag: { src: defaultFragSrc }
    });
    const { vertices, indices } = fernGeoJSON.mesh;
    const fernVertPoses = new VertexBuffer(gl, gl.STATIC_DRAW, new Float32Array(vertices.flat()));
    this.fern = new IndexedGeometry(
      this.shaders.makeVAO(gl, { a_pos: fernVertPoses }),
      new IndexBuffer(gl, gl.STATIC_DRAW, new Uint16Array(indices))
    );

    this.pass = new SplashPassMSAA(gl, this.width, this.height);
    this.resize(canvas.width, canvas.height);
  }

  resize(width: number, height: number) {
    const { gl } = this;
    gl.viewport(0, 0, this.width = width, this.height = height);
    this.pass.resize(gl, width, height);
  }

  frame() {
    this.pass.withMSAA(this.gl, gl => {
      this.shaders.use(gl);

      let { width: w, height: h } = this;
      w /= 90; h /= 90;
      const mvp = mat4.ortho(mat4.create(), -w/2, w/2, -h/2, h/2, -1, 1);
      gl.uniformMatrix4fv(this.shaders.uniforms.u_mvp.loc, false, mvp);

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
