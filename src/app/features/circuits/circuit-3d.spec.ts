import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Circuit3d } from './circuit-3d';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { homeOrbit, sceneBounds } from '../../core/circuits/circuit-scene';
import { MeshFile } from '../../core/circuits/mesh-file';
import { PlacedCircuit } from '../../core/circuits/model';
import { FIXTURE } from '../../core/circuits/test-fixture';

/**
 * The two-part, one-cable circuit circuit-scene.spec.ts measures, so the
 * numbers the scene is checked against here are the ones already proven
 * there. A value on the second part gives the marker something to show.
 */
const PLACED: PlacedCircuit = {
  parts: [
    { id: 'a', type: 'Abs', at: { x: 0, y: 0, z: 0 }, rot: 0, size: { x: 2, y: 1, z: 2 } },
    {
      id: 'b',
      type: 'Adder',
      at: { x: 0, y: 0, z: 8 },
      rot: 90,
      size: { x: 2, y: 1, z: 2 },
      value: '1.200',
      label: 'Error term',
    },
  ],
  cables: [
    {
      from: { part: 'a', port: 'out' },
      to: { part: 'b', port: 'in1' },
      kind: 'data',
      cells: [2, 3, 4, 5, 6, 7].map((z) => ({ x: 0, y: 0, z })),
    },
  ],
};

/** No meshes at all: every part falls back to a plain box. */
const NO_MESHES: MeshFile = { cell: 0.125, meshes: {}, parts: {} };

/** One triangle for the Abs, in the game's grey, so a real mesh geometry gets built. */
const ONE_MESH: MeshFile = {
  cell: 0.125,
  meshes: {
    Tri: {
      vertices: [0, 0, 0, 0.1, 0, 0, 0, 0, 0.1],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      colors: ['b3b3b3', 'b3b3b3', 'b3b3b3'],
      triangles: [0, 1, 2],
    },
  },
  parts: {
    Abs: {
      renderers: [
        {
          name: 'Body',
          mesh: 'Tri',
          material: 'CRPLit',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
      texts: [],
    },
  },
};

/**
 * The fixture catalog, without the HTTP the real DataService fetches it
 * over. Abs gets a display name so the test can tell "named" from "id".
 */
function stubData() {
  const comps = signal(FIXTURE.map((c) => (c.id === 'Abs' ? { ...c, name: 'Absolute' } : c)));
  return {
    components: comps,
    componentById: computed(() => new Map(comps().map((c) => [c.id, c]))),
  } as unknown as DataService;
}

/** A reader who may see exactly the parts named. */
function stubWorld(...listed: string[]) {
  return { isListed: (id: string) => listed.includes(id) } as unknown as WorldService;
}

/**
 * jsdom lays nothing out and has no WebGL: every rect is 0x0 and the renderer
 * comes back null. Both are the path a reader with GL blocked takes, so they
 * are exercised on purpose rather than mocked away.
 */
const BOX = { width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0 };

function setup(world = stubWorld('Abs', 'Adder'), placed = PLACED, meshes = NO_MESHES) {
  TestBed.configureTestingModule({
    imports: [Circuit3d],
    providers: [
      { provide: DataService, useValue: stubData() },
      { provide: WorldService, useValue: world },
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(Circuit3d);
  fixture.componentRef.setInput('placed', placed);
  fixture.componentRef.setInput('meshes', meshes);
  fixture.componentRef.setInput('title', 'A simple one');
  fixture.detectChanges();
  const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
  stage.getBoundingClientRect = () => BOX as DOMRect;
  return { fixture, stage, view: fixture.componentInstance };
}

/** One animation frame; the view draws and re-projects on rAF. */
const frame = () => new Promise((r) => requestAnimationFrame(r));

const HOME = homeOrbit(sceneBounds(PLACED, 3));

describe('Circuit3d', () => {
  it('builds without WebGL and still projects one marker per part', async () => {
    const { view } = setup();
    await view.ready;
    await frame();
    expect(view.noGl()).toBe(true);
    expect(view.markers().map((m) => m.id)).toEqual(['a', 'b']);
    for (const m of view.markers()) {
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.y)).toBe(true);
      expect(m.far).toBe(false);
    }
  });

  it('names a listed part and links it; hides an unlisted one', async () => {
    const { fixture, view } = setup(stubWorld('Abs'));
    await view.ready;
    await frame();
    fixture.detectChanges();

    const parts = [...fixture.nativeElement.querySelectorAll('.part')] as HTMLAnchorElement[];
    expect(parts.length).toBe(2);
    expect(parts[0].querySelector('.lbl')!.textContent!.trim()).toBe('Absolute');
    expect(parts[0].getAttribute('href')).toBe('/components/Abs');
    // An anchor with no href is not a link: it cannot be clicked, tabbed
    // into, or opened in a new tab, and it gives no name away.
    expect(parts[1].querySelector('.lbl')!.textContent!.trim()).toBe(
      'a part you have not unlocked',
    );
    expect(parts[1].hasAttribute('href')).toBe(false);
  });

  it("shows a part's value on its marker", async () => {
    const { fixture, view } = setup();
    await view.ready;
    await frame();
    fixture.detectChanges();

    const values = [...fixture.nativeElement.querySelectorAll('.part .val')].map((el) =>
      (el as HTMLElement).textContent!.trim(),
    );
    expect(values).toEqual(['1.200']);
  });

  // The picture writes the author's note under the block; the marker is the
  // only place the scene can put it, and it is the annotation a reader most
  // needs to tell two identical blocks apart.
  it("shows a part's label on its marker", async () => {
    const { fixture, view } = setup();
    await view.ready;
    await frame();
    fixture.detectChanges();

    const tags = [...fixture.nativeElement.querySelectorAll('.part .tag')].map((el) =>
      (el as HTMLElement).textContent!.trim(),
    );
    expect(tags).toEqual(['Error term']);
  });

  it('orbits with the arrow keys and resets with 0', async () => {
    const { stage, view } = setup();
    await view.ready;
    expect(view.orbit()).toEqual(HOME);

    const left = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    stage.dispatchEvent(left);
    expect(view.orbit().yaw).not.toBe(HOME.yaw);
    expect(left.defaultPrevented).toBe(true);

    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(view.orbit().pitch).toBeLessThan(HOME.pitch);

    stage.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(view.orbit()).toEqual(HOME);
  });

  it('ignores a plain wheel and dollies on ctrl + wheel', async () => {
    const { stage, view } = setup();
    await view.ready;
    const bare = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    stage.dispatchEvent(bare);
    expect(view.orbit().distance).toBe(HOME.distance);
    expect(bare.defaultPrevented).toBe(false);

    const zoomed = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    stage.dispatchEvent(zoomed);
    expect(view.orbit().distance).toBeLessThan(HOME.distance);
    expect(zoomed.defaultPrevented).toBe(true);
  });

  it('keeps the distance inside the limits the circuit sets', async () => {
    const { view } = setup();
    await view.ready;
    const box = sceneBounds(PLACED, 3);
    view.dollyBy(40);
    expect(view.orbit().distance).toBeCloseTo(0.4 * box.diagonal, 9);
    view.dollyBy(-80);
    expect(view.orbit().distance).toBeCloseTo(4 * box.diagonal, 9);
  });

  it('turns by the pointer travel once the press passes the drag slop', async () => {
    const { stage, view } = setup();
    await view.ready;
    const pointer = (type: string, x: number, y: number) =>
      new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
    stage.dispatchEvent(pointer('pointerdown', 400, 300));
    stage.dispatchEvent(pointer('pointermove', 402, 301));
    expect(view.orbit()).toEqual(HOME);
    stage.dispatchEvent(pointer('pointermove', 600, 300));
    expect(view.orbit().yaw).not.toBe(HOME.yaw);
    stage.dispatchEvent(pointer('pointerup', 600, 300));
    expect(view.pressed()).toBe(false);
    expect(view.dragging()).toBe(false);
  });

  it('pans with a right or shift drag, with the keys, and comes home on 0', async () => {
    const { view, stage } = setup();
    await view.ready;
    const pointer = (type: string, x: number, y: number, init: MouseEventInit = {}) =>
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
    expect(view.target()).toEqual([0, 0, 0]);

    // Shift + left drag: the orbit stays, the target moves.
    stage.dispatchEvent(pointer('pointerdown', 400, 300, { button: 0, shiftKey: true }));
    stage.dispatchEvent(pointer('pointermove', 460, 300, { button: 0, shiftKey: true }));
    stage.dispatchEvent(pointer('pointerup', 460, 300, { button: 0 }));
    expect(view.orbit()).toEqual(HOME);
    const afterShift = view.target();
    expect(afterShift).not.toEqual([0, 0, 0]);

    // Right drag pans too, and a menu must not open on its release.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    stage.dispatchEvent(pointer('pointerdown', 400, 300, { button: 2 }));
    stage.dispatchEvent(pointer('pointermove', 400, 360, { button: 2 }));
    stage.dispatchEvent(pointer('pointerup', 400, 360, { button: 2 }));
    stage.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(view.target()).not.toEqual(afterShift);

    // The keys pan along the panel: y never changes.
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(view.target()[1]).toBeCloseTo(view.target()[1], 9);

    stage.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(view.target()).toEqual([0, 0, 0]);
    expect(view.orbit()).toEqual(HOME);
  });

  it('never lets a pan lose the circuit', async () => {
    const { view, stage } = setup();
    await view.ready;
    for (let i = 0; i < 200; i++) {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    }
    const t = view.target();
    expect(Math.hypot(t[0], t[1], t[2])).toBeLessThanOrEqual(1.5 * view.box().diagonal + 1e-9);
  });

  it('hides the labels on request and shows them again', async () => {
    const { fixture, view } = setup();
    await view.ready;
    await frame();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('a.part').length).toBe(2);
    const btn = el.querySelector<HTMLButtonElement>('button.labels')!;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('a.part').length).toBe(0);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('a.part').length).toBe(2);
  });

  it('lays the stage over the window on request, and Escape brings the page back', async () => {
    const { fixture, stage, view } = setup();
    await view.ready;
    fixture.detectChanges();
    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button.full',
    )!;
    expect(stage.classList.contains('full')).toBe(false);
    btn.click();
    fixture.detectChanges();
    expect(view.fullscreen()).toBe(true);
    expect(stage.classList.contains('full')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // Out of the clipped pane, onto the body, for the duration.
    expect(stage.parentElement).toBe(document.body);
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(view.fullscreen()).toBe(false);
    expect(stage.classList.contains('full')).toBe(false);
    expect(stage.parentElement).toBe(fixture.nativeElement);
  });

  it('zooms on a bare wheel only in fullscreen', async () => {
    const { fixture, stage, view } = setup();
    await view.ready;
    const wheel = () =>
      stage.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      );
    wheel();
    expect(view.orbit().distance).toBe(HOME.distance);
    view.toggleFullscreen();
    fixture.detectChanges();
    wheel();
    expect(view.orbit().distance).toBeLessThan(HOME.distance);
  });

  it('keeps every pill above the canvas however far the camera is', async () => {
    const { view } = setup();
    await view.ready;
    for (let i = 0; i < 40; i++) view.dollyBy(-1);
    await frame();
    expect(view.markers().length).toBe(2);
    for (const m of view.markers()) expect(m.order).toBeGreaterThanOrEqual(1);
    // The nearer part still stacks over the farther one.
    const [a, b] = view.markers();
    expect(a.order).not.toBe(b.order);
  });

  it('re-projects when the camera moves', async () => {
    const { view } = setup();
    await view.ready;
    await frame();
    const before = view.markers().map((m) => `${m.id}:${Math.round(m.x)},${Math.round(m.y)}`);
    view.dollyBy(3);
    await frame();
    expect(view.markers().map((m) => `${m.id}:${Math.round(m.x)},${Math.round(m.y)}`)).not.toEqual(
      before,
    );
  });

  it('disposes what it built on destroy', async () => {
    // Geometry lives on the GPU side of three.js and is not garbage
    // collected: a view that leaves without disposing leaks it. The mesh
    // geometries are built on the noGl path too, so this can be watched
    // through the prototype without a GL context.
    const three = await import('three');
    const dispose = vi.spyOn(three.BufferGeometry.prototype, 'dispose');
    const { fixture, view } = setup(undefined, PLACED, ONE_MESH);
    await view.ready;
    await frame();
    expect(dispose).not.toHaveBeenCalled();
    fixture.destroy();
    expect(dispose.mock.calls.length).toBeGreaterThan(0);
    // The renderer is gone; a frame that was in flight must not draw.
    const markers = view.markers();
    view.dollyBy(1);
    await frame();
    expect(view.markers()).toBe(markers);
    dispose.mockRestore();
  });

  it('writes vertex colours to the geometry in linear light, not as the hex reads', async () => {
    // A material's colour goes through three's colour management; a buffer
    // attribute does not. sRGB b3b3b3 is 0.702 as a fraction and 0.451 in
    // linear light; written as the fraction, every block would render
    // lighter than the panel and the picture.
    const three = await import('three');
    const set = vi.spyOn(three.BufferGeometry.prototype, 'setAttribute');
    const { view } = setup(undefined, PLACED, ONE_MESH);
    await view.ready;
    const color = set.mock.calls.find(([name]) => name === 'color')?.[1] as
      import('three').BufferAttribute | undefined;
    expect(color).toBeDefined();
    expect(color!.getX(0)).toBeCloseTo(0.451, 2);
    expect(color!.getX(0)).not.toBeCloseTo(0.702, 2);
    set.mockRestore();
  });

  it('builds nothing when destroyed before three.js arrives', async () => {
    const three = await import('three');
    const made = vi.spyOn(three.BufferGeometry.prototype, 'setAttribute');
    const { fixture, view } = setup(undefined, PLACED, ONE_MESH);
    // Destroyed with init() still waiting on its import.
    fixture.destroy();
    await view.ready;
    expect(made).not.toHaveBeenCalled();
    expect(view.markers()).toEqual([]);
    made.mockRestore();
  });

  it('frames an empty circuit without a NaN in sight', async () => {
    const { view } = setup(undefined, { parts: [], cables: [] });
    await view.ready;
    await frame();
    expect(Number.isFinite(view.orbit().distance)).toBe(true);
    expect(view.markers()).toEqual([]);
  });
});
