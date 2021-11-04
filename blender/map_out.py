import bpy

mesh = bpy.context.selected_objects[0].data

vertices = [f'({v.co.x} {v.co.y})' for v in mesh.vertices]
indices = ['(' + ' '.join(str(i) for i in face.vertices) + ')' for face in mesh.polygons]

bfile = bpy.data.filepath
cfile = bfile[:len(bfile) - bfile[::-1].index('.')] + 'cedmap'
delim = '\n    '
with open(cfile, "w") as f:
    f.write(f"""
(mesh
  (vertices
    {delim.join(vertices)})
  (indices
    {delim.join(indices)}))
    """);
