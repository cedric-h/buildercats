#version 300 es

precision highp float;
precision highp int;

uniform mat4 u_mvp;

in vec2 a_pos;

void main() {
  gl_Position = u_mvp * vec4(a_pos, 0.0, 1.0);
}
