import { WebGLCtx } from "./core"

export abstract class Buffer {
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
export class VertexBuffer extends Buffer {
  target(gl: WebGLCtx) { return gl.ARRAY_BUFFER }
}
export class IndexBuffer extends Buffer {
  target(gl: WebGLCtx) { return gl.ELEMENT_ARRAY_BUFFER }
}

export class Geometry {
  constructor(public vao: WebGLVertexArrayObject, public count: number) {}
  draw(gl: WebGLCtx) {
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
  }
}

export class IndexedGeometry {
  constructor(public vao: WebGLVertexArrayObject, public indices: IndexBuffer) {}
  draw(gl: WebGLCtx) { 
    gl.bindVertexArray(this.vao);
    this.indices.bind(gl);
    gl.drawElements(gl.TRIANGLES, this.indices.data.length, gl.UNSIGNED_SHORT, 0);
    this.indices.unbind(gl);
    gl.bindVertexArray(null);
  }
}
