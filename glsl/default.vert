attribute vec2 a_pos;
attribute vec4 a_inst_color;
attribute vec2 a_inst_pos;
attribute float a_inst_scale;
uniform mat4 u_mvp;

varying vec4 v_color;

void main() {
  v_color = a_inst_color;
  gl_Position = u_mvp * vec4(((a_pos * a_inst_scale) + a_inst_pos), 0.0, 1.0);
}
