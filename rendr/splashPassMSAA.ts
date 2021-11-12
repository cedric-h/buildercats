import { VertexBuffer, Geometry } from "./geo"
import { WebGLCtx, TextureUniform, ShaderPair, } from "./core"
import splashVertSrc from "./glsl/splash.vert"
import splashFragSrc from "./glsl/splash.frag"

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

export class SplashPassMSAA {
  frame: FrameMSAA;
  shaders: ShaderPair<{ attribKeys: "a_pos" | "a_tex" }>;
  diffuseU: TextureUniform;
  fullscreenQuad: Geometry;
  constructor(gl: WebGLCtx, width: number, height: number) {
    this.shaders = new ShaderPair(gl, {
      vert: {
        src: splashVertSrc,
        attributes: {
          a_pos: { size: 2, kind: gl.FLOAT },
          a_tex: { size: 2, kind: gl.FLOAT },
        },
      },
      frag: { src: splashFragSrc }
    });
    this.diffuseU = new TextureUniform(gl, this.shaders.program, "u_diffuse");

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
    this.diffuseU.set(0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frame.colorTexture);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.fullscreenQuad.draw(gl);
  }
}
