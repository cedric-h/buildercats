#version 300 es

precision highp float;
precision highp int;

uniform mat4 MVP;

in vec2 position;

void main() {
  gl_Position = MVP * vec4(position, 0.0, 1.0);
}
