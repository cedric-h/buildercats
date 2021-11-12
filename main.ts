import defaultVertSrc from "./glsl/default.vert"
import defaultFragSrc from "./glsl/default.frag"
import fernGeoJSON from "./blender/fern.json"
import { mat4 } from "gl-matrix";

import { VertexBuffer, IndexBuffer, IndexedGeometry } from "./rendr/geo"
import { WebGLCtx, ShaderPair, Mat4Uniform } from "./rendr/core"
import { SplashPassMSAA } from "./rendr/splashPassMSAA"


class Rendr {
  pass: SplashPassMSAA;
  shaders: ShaderPair<{ attribKeys: "a_pos", uniformKeys: "u_mvp" }>;
  mvpU: Mat4Uniform;
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
        attributes: { a_pos: { size: 2, kind: gl.FLOAT } },
      },
      frag: { src: defaultFragSrc }
    });
    this.mvpU = new Mat4Uniform(gl, this.shaders.program, "u_mvp");

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
      this.mvpU.set(mat4.ortho(mat4.create(), -w/2, w/2, -h/2, h/2, -1, 1));

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
