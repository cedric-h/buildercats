import { mat4 } from "gl-matrix";
import { Buffer } from "./geo";
export type WebGLCtx = WebGL2RenderingContextStrict;
import ArrayType = WebGLRenderingContextStrict.ArrayType;
import ShaderType = WebGLRenderingContextStrict.ShaderType;

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
type ShaderPairDesc<AttribKey extends string> = {
  vert: VertStageDesc<AttribKey>,
  frag: FragStageDesc,
};
export class ShaderPair<K extends { attribKeys: string; }> {
  program: WebGLProgram;
  attrs = {} as Record<K["attribKeys"], AttribDesc & { loc: number }>;
  constructor(gl: WebGLCtx, desc: ShaderPairDesc<K["attribKeys"]>) {
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

abstract class Uniform {
  loc: WebGLUniformLocation;
  constructor(public gl: WebGLCtx, program: WebGLProgram, name: string) {
    this.loc = gl.getUniformLocation(program, name)!;
  }
}
export class Mat4Uniform extends Uniform {
  set(to: mat4) {
    this.gl.uniformMatrix4fv(this.loc, false, to);
  }
}
export class TextureUniform extends Uniform {
  set(to: 0 | 1 | 2 | 3) {
    this.gl.uniform1i(this.loc, to);
  }
}
