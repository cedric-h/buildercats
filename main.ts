import defaultVertSrc from "./glsl/default.vert"
import defaultFragSrc from "./glsl/default.frag"
import fullscreenVertSrc from "./glsl/fullscreen.vert"
import fullscreenFragSrc from "./glsl/fullscreen.frag"
import fernGeoJSON from "./blender/fern.json"
import { mat4, vec3 } from "gl-matrix";
type WebGLCtx = WebGL2RenderingContextStrict;
import ArrayType = WebGLRenderingContextStrict.ArrayType;
import ShaderType = WebGLRenderingContextStrict.ShaderType;

function createProgram(gl: WebGLCtx, vertexShaderSource: string, fragmentShaderSource: string) {
  function createShader(gl: WebGLCtx, source: string, kind: ShaderType) {
    const shader = gl.createShader(kind)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  const program = gl.createProgram()!;
  const vshader = createShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fshader = createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  gl.attachShader(program, vshader);
  gl.deleteShader(vshader);
  gl.attachShader(program, fshader);
  gl.deleteShader(fshader);
  gl.linkProgram(program);

  let log = gl.getProgramInfoLog(program);
  if (log) console.log(log);

  log = gl.getShaderInfoLog(vshader);
  if (log) console.log(log);

  log = gl.getShaderInfoLog(fshader);
  if (log) console.log(log);

  return program;
};

window.onload = () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const gl = canvas.getContext( 'webgl2', { antialias: false } )! as any as WebGLCtx;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);

  const isWebGL2 = !!gl;
  if (!isWebGL2) {
    document.body.innerHTML = 'WebGL 2 is not available. See <a href="' +
      'https://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">' +
      'How to get a WebGL 2 implementation</a>';
    return;
  }

  // -- Init program
  const PROGRAM = {
    DEFAULT: 0,
    SPLASH: 1,
    MAX: 2
  };

  const programs = [
    createProgram(gl,    defaultVertSrc,    defaultFragSrc),
    createProgram(gl, fullscreenVertSrc, fullscreenFragSrc)
  ];
  const mvpLocation = gl.getUniformLocation(programs[PROGRAM.DEFAULT], 'MVP');
  const diffuseLocation = gl.getUniformLocation(programs[PROGRAM.SPLASH], 'diffuse');

  // -- Init primitive data
  const vertex_data = new Float32Array(fernGeoJSON.mesh.vertices.flat());
  const index_data = new Uint16Array(fernGeoJSON.mesh.indices);

  // -- Init buffers
  const vertexDataBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const indexDataBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexDataBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  const positions = new Float32Array([
    -1.0, -1.0,
    1.0, -1.0,
    1.0,  1.0,
    1.0,  1.0,
    -1.0,  1.0,
    -1.0, -1.0
  ]);
  const vertexPosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const texCoords = new Float32Array([
    0.0, 1.0,
    1.0, 1.0,
    1.0, 0.0,
    1.0, 0.0,
    0.0, 0.0,
    0.0, 1.0
  ]);
  const vertexTexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexTexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // -- Init Texture
  // used for draw framebuffer storage
  const FRAMEBUFFER_SIZE = {
    x: canvas.width,
    y: canvas.height
  };
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FRAMEBUFFER_SIZE.x, FRAMEBUFFER_SIZE.y, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // -- Init Frame Buffers
  const FRAMEBUFFER = {
    RENDERBUFFER: 0,
    COLORBUFFER: 1
  };
  const framebuffers = [
    gl.createFramebuffer(),
    gl.createFramebuffer()
  ];
  const colorRenderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, FRAMEBUFFER_SIZE.x, FRAMEBUFFER_SIZE.y);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[FRAMEBUFFER.RENDERBUFFER]);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[FRAMEBUFFER.COLORBUFFER]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // -- Init VertexArray
  const vertexArrays = [
    gl.createVertexArray(),
    gl.createVertexArray()
  ];

  const vertexPosLocation = 0; // set with GLSL layout qualifier

  gl.bindVertexArray(vertexArrays[PROGRAM.DEFAULT]);
  gl.enableVertexAttribArray(vertexPosLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
  gl.vertexAttribPointer(vertexPosLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindVertexArray(null);

  gl.bindVertexArray(vertexArrays[PROGRAM.SPLASH]);

  gl.enableVertexAttribArray(vertexPosLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
  gl.vertexAttribPointer(vertexPosLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const vertexTexLocation = 1; // set with GLSL layout qualifier
  gl.enableVertexAttribArray(vertexTexLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexTexBuffer);
  gl.vertexAttribPointer(vertexTexLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindVertexArray(null);

  // -- Render

  // Pass 1
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[FRAMEBUFFER.RENDERBUFFER]);
  gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
  gl.useProgram(programs[PROGRAM.DEFAULT]);
  gl.bindVertexArray(vertexArrays[PROGRAM.DEFAULT]);

  const IDENTITY = mat4.create();
  const scaleVector3 = vec3.create();
  vec3.set(scaleVector3, 0.5, 0.5, 0.5);
  const mvp = mat4.create();
  mat4.scale(mvp, IDENTITY, scaleVector3);

  gl.uniformMatrix4fv(mvpLocation, false, mvp);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexDataBuffer);
  gl.drawElements(gl.TRIANGLES, fernGeoJSON.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  // Blit framebuffers, no Multisample texture 2d in WebGL 2
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffers[FRAMEBUFFER.RENDERBUFFER]);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffers[FRAMEBUFFER.COLORBUFFER]);
  gl.clearBufferfv(gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
  gl.blitFramebuffer(
    0, 0, FRAMEBUFFER_SIZE.x, FRAMEBUFFER_SIZE.y,
    0, 0, FRAMEBUFFER_SIZE.x, FRAMEBUFFER_SIZE.y,
    gl.COLOR_BUFFER_BIT, gl.NEAREST
  );

  // Pass 2
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(programs[PROGRAM.SPLASH]);
  gl.uniform1i(diffuseLocation, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindVertexArray(vertexArrays[PROGRAM.SPLASH]);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // -- Delete WebGL resources
  gl.deleteBuffer(vertexPosBuffer);
  gl.deleteBuffer(vertexTexBuffer);
  gl.deleteTexture(texture);
  gl.deleteRenderbuffer(colorRenderbuffer);
  gl.deleteFramebuffer(framebuffers[FRAMEBUFFER.RENDERBUFFER]);
  gl.deleteFramebuffer(framebuffers[FRAMEBUFFER.COLORBUFFER]);
  gl.deleteVertexArray(vertexArrays[PROGRAM.DEFAULT]);
  gl.deleteVertexArray(vertexArrays[PROGRAM.SPLASH]);
  gl.deleteProgram(programs[PROGRAM.DEFAULT]);
  gl.deleteProgram(programs[PROGRAM.SPLASH]);
}
