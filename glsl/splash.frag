#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_diffuse;

in vec2 v_tex;

out vec4 color;

void main() {
  color = texture(u_diffuse, v_tex);
}
