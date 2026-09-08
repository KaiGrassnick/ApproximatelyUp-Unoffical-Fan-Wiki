import { PlacedCircuit } from './model';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';
import { MeshFile, renderSvg } from './render-svg';

const cat = buildCatalog(FIXTURE);
const empty: MeshFile = { cell: 0.125, meshes: {}, parts: {} };

const placed: PlacedCircuit = {
  parts: [
    {
      id: 'a',
      type: 'Abs',
      at: { x: 0, y: 0, z: 0 },
      rot: 0,
      size: { x: 2, y: 1, z: 2 },
      label: 'Error term',
    },
    {
      id: 'b',
      type: 'Abs',
      at: { x: 0, y: 0, z: 8 },
      rot: 0,
      size: { x: 2, y: 1, z: 2 },
      value: '1.200',
    },
  ],
  cables: [
    {
      from: { part: 'a', port: 'out' },
      to: { part: 'b', port: 'in' },
      kind: 'data',
      cells: [2, 3, 4, 5, 6, 7].map((z) => ({ x: 0, y: 0, z })),
    },
  ],
};

const count = (svg: string, needle: string) => svg.split(needle).length - 1;

/**
 * A part whose only renderer is its top face, two triangles, plus the glyph the
 * game writes on that face. The face is the whole 2x2 footprint, so its near
 * triangle reaches closer to the camera than the glyph's centre does.
 */
const topFace: MeshFile = {
  cell: 0.125,
  meshes: {
    Top: {
      vertices: [
        -0.125, 0.0625, -0.125, 0.125, 0.0625, -0.125, 0.125, 0.0625, 0.125, -0.125, 0.0625, 0.125,
      ],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      colors: ['b3b3b3', 'b3b3b3', 'b3b3b3', 'b3b3b3'],
      triangles: [0, 1, 2, 0, 2, 3],
    },
  },
  parts: {
    Abs: {
      renderers: [
        {
          name: 'R',
          mesh: 'Top',
          material: 'CRPLit',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      texts: [
        {
          name: 'T',
          text: 'ABS',
          scale: 0.11,
          position: [0, 0.04, 0],
          rotation: [0, 0, 0],
          alignment: 1,
        },
      ],
    },
  },
};

describe('renderSvg', () => {
  it('is an SVG with a viewBox, a panel, both parts, the cable and the label', () => {
    const svg = renderSvg(placed, cat, empty, { view: 'top', notes: [] });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toMatch(/viewBox="-?\d+(\.\d)? -?\d+(\.\d)? \d+(\.\d)? \d+(\.\d)?"/);
    expect(count(svg, 'class="panel"')).toBe(1);
    // The top camera looks straight down the z axis: it sees the top and the
    // front (-z) face, two triangles each, and the side faces edge-on, which
    // are culled rather than drawn as lines.
    expect(count(svg, 'data-part="a"')).toBe(4);
    expect(count(svg, 'data-part="b"')).toBe(4);
    expect(count(svg, 'data-cable="1"')).toBeGreaterThan(0);
    expect(svg).toContain('>Error term<');
  });

  it('shades every face to a real colour', () => {
    // A renderer that sliced the '#' off the wrong end would still emit a
    // fill, and every raster of it would come out transparent.
    const svg = renderSvg(placed, cat, empty, { view: 'iso', notes: [] });
    const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    expect(fills.length).toBeGreaterThan(4);
    for (const f of fills) expect(f).toMatch(/^(none|#[0-9a-f]{6})$/);
  });

  it('is byte-stable', () => {
    const a = renderSvg(placed, cat, empty, { view: 'iso', notes: [] });
    const b = renderSvg(placed, cat, empty, { view: 'iso', notes: [] });
    expect(a).toBe(b);
  });

  it("draws the game's meshes when it has them, culling the faces that look away", () => {
    // Two triangles on one part: one facing up, one facing down.
    const meshes: MeshFile = {
      cell: 0.125,
      meshes: {
        Two: {
          vertices: [0, 0, 0, 0.1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.1],
          normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
          colors: ['b3b3b3', 'b3b3b3', 'b3b3b3', 'b3b3b3', 'b3b3b3', 'b3b3b3'],
          triangles: [0, 1, 2, 3, 4, 5],
        },
      },
      parts: {
        Abs: {
          renderers: [
            {
              name: 'R',
              mesh: 'Two',
              material: 'CRPLit',
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          ],
          texts: [
            {
              name: 'T',
              text: 'ABS',
              scale: 0.11,
              position: [0, 0.04, 0],
              rotation: [0, 0, 0],
              alignment: 1,
            },
          ],
        },
      },
    };
    const svg = renderSvg(placed, cat, meshes, { view: 'top', notes: [] });
    expect(count(svg, 'data-part="a"')).toBe(2); // one triangle, one text
    expect(count(svg, '>ABS<')).toBe(1); // the other part's text says 1.200 instead
    expect(svg).toContain('>1.200<');
  });

  it("keeps a part's glyph in front of every triangle of that part", () => {
    const svg = renderSvg(placed, cat, topFace, { view: 'top', notes: [] });
    // Emission order is the painter's order: later means nearer the viewer.
    const lastFace = svg.lastIndexOf('<path data-part="a"');
    const glyph = svg.indexOf('<g data-part="a"');
    expect(lastFace).toBeGreaterThan(-1);
    expect(glyph).toBeGreaterThan(lastFace);
  });

  it("draws a part's label after every cable, with a halo to read over one", () => {
    // The label sits where the input cable enters, so a cable sorted in front
    // of it painted out the middle of the word.
    const svg = renderSvg(placed, cat, empty, { view: 'top', notes: [] });
    const halo = svg.indexOf('>Error term<');
    const label = svg.indexOf('>Error term<', halo + 1);
    const lastCable = svg.lastIndexOf('data-cable=');
    expect(lastCable).toBeGreaterThan(-1);
    expect(halo).toBeGreaterThan(lastCable);
    // The halo is a stroke-only copy under the coloured text, so a renderer
    // that ignores `paint-order` cannot stroke over the fill.
    const haloTag = svg.slice(svg.lastIndexOf('<text', halo), halo);
    expect(haloTag).toContain('paint-order="stroke"');
    expect(haloTag).toContain('stroke="#45484d"');
    expect(haloTag).toContain('fill="none"');
    expect(label).toBeGreaterThan(halo);
    expect(svg.slice(svg.lastIndexOf('<text', label), label)).toContain('fill="#ffd23c"');
  });

  it('draws a cable highlight that no neighbouring segment can chop up', () => {
    // The highlight is one thin stroke per segment. Each dark segment has a
    // round cap at its joints, so a highlight drawn before either neighbour
    // loses its ends to those caps and the run reads as dashes.
    const svg = renderSvg(placed, cat, empty, { view: 'top', notes: [] });
    const lines = [...svg.matchAll(/<line [^>]*>/g)];
    const ends = (tag: string) => /x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)"/.exec(tag)!;
    const dark = lines.filter((m) => m[0].includes('data-cable="1"'));
    const hi = lines.filter((m) => m[0].includes('stroke="#4a4a4a"'));
    expect(hi.length).toBe(dark.length);
    expect(hi.length).toBeGreaterThan(2);
    for (const h of hi) {
      const he = ends(h[0]);
      const touching = dark.filter((d) => {
        const de = ends(d[0]);
        return (
          (de[1] === he[1] && de[2] === he[2]) ||
          (de[3] === he[3] && de[4] === he[4]) ||
          (de[3] === he[1] && de[4] === he[2]) ||
          (de[1] === he[3] && de[2] === he[4])
        );
      });
      expect(touching.length).toBeGreaterThan(1); // itself and at least one neighbour
      for (const d of touching) expect(h.index).toBeGreaterThan(d.index);
    }
  });

  it('places and turns a rotated part where the projection says it should', () => {
    const turned: PlacedCircuit = {
      parts: [
        { id: 'r', type: 'Abs', at: { x: 0, y: 0, z: 0 }, rot: 90, size: { x: 2, y: 1, z: 2 } },
      ],
      cables: [],
    };
    const svg = renderSvg(turned, cat, topFace, { view: 'top', notes: [] });

    // By hand, at pitch 75 and yaw 0: right = (1, 0, 0), up = (0, cos75, sin75).
    //   sx = X * 240,  sy = -(Y * cos75 + Z * sin75) * 240.
    // A part turned by 90 cells is a mesh turned by -90 degrees about +y, so
    // partMatrix is rotY(-90) = [0,0,-1, 0,1,0, 1,0,0], mapping a local
    // (x, y, z) to (-z, y, x).
    // The part's centre is ((0 + 2/2) * 0.125, (0 + 1/2) * 0.125, (0 + 2/2) * 0.125)
    //                    = (0.125, 0.0625, 0.125).
    // Both triangles start at local vertex 0, (-0.125, 0.0625, -0.125), which
    // the part matrix turns to (0.125, 0.0625, -0.125). Its world point is
    //   (0.125 + 0.125, 0.0625 + 0.0625, 0.125 - 0.125) = (0.25, 0.125, 0).
    // sx = 0.25 * 240 = 60.0
    // sy = -(0.125 * 0.2588190 + 0 * 0.9659258) * 240 = -7.76, written -7.8
    expect(svg).toMatch(/<path data-part="r" fill="#[0-9a-f]{6}"[^>]* d="M60\.0 -7\.8L/);
    // Unturned, that vertex would sit at world (0, 0.125, 0): sx = 0.0.
    expect(svg).not.toContain('d="M0.0 -7.8');

    // The glyph turns with the part: -yaw - rot = -0 - 90.
    // A quarter turn puts the text's x axis along world +z, which the camera
    // sees as straight up the screen, foreshortened by sin 75.
    expect(svg).toMatch(/<g data-part="r" transform="matrix\(0\.000 -0\.966 /);
  });

  it('renders an empty circuit as a small panel rather than a NaN viewBox', () => {
    const svg = renderSvg({ parts: [], cables: [] }, cat, empty, { view: 'top', notes: [] });
    expect(svg).toMatch(/viewBox="-?\d+(\.\d)? -?\d+(\.\d)? \d+(\.\d)? \d+(\.\d)?"/);
    expect(svg).not.toContain('NaN');
    expect(count(svg, 'class="panel"')).toBe(1);
  });

  it('draws a group box with its caption and a callout', () => {
    const svg = renderSvg(placed, cat, empty, {
      view: 'top',
      notes: [
        { kind: 'group', parts: ['a', 'b'], text: 'Anti windup', color: 'magenta' },
        { kind: 'callout', at: [6, 4], text: 'tune this', color: 'red' },
        { kind: 'md', body: 'ignored here' },
      ],
    });
    expect(count(svg, 'class="note-group"')).toBe(1);
    expect(svg).toContain('>Anti windup<');
    expect(svg).toContain('>tune this<');
    expect(svg).not.toContain('ignored here');
  });
});
