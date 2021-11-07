#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_tex;
out vec2 v_tex;

void main(void) {
  v_tex = a_tex;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
