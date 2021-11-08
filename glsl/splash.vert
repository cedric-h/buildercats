#version 300 es
precision highp float;
precision highp int;

in vec2 position;
in vec2 texcoord;

out vec2 uv;

void main() {
  uv = texcoord;
  gl_Position = vec4(position, 0.0, 1.0);
}
