#version 300 es

precision highp float;
precision highp int;

uniform mat4 mvp;

in vec2 a_pos;

void main() {
  gl_Position = mvp * vec4(a_pos, 0.0, 1.0);
}
