#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_tex;
out vec4 frag_color;

void main(void) {
  frag_color = texture(u_texture, v_tex * 0.5);
}
