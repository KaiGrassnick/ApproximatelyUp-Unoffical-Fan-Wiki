import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { GalaxyMap } from './galaxy-map';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Planet } from '../../core/models';
import { HOME, MAX_PITCH, MIN_DISTANCE, wrapYaw } from './orbit';
import planetsJson from '../../../../data/planets.json';

const planets = planetsJson as unknown as Planet[];

/**
 * The real planets, without the HTTP the real DataService fetches them over:
 * its resources throw on a failed request, and there is no server here.
 */
function stubData() {
  const all = signal(planets);
  return {
    planets: all,
    components: signal([]),
    objectives: signal([]),
    buildableCount: computed(() => 0),
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    // The real WorldService is used when a test passes no save; it reads
    // these to work out what a new game can see.
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
    globeMapUrl: (id: string) => `data/planets/maps/${id}.webp`,
  } as unknown as DataService;
}

/**
 * The pointer/keyboard wiring, which orbit.spec.ts cannot reach: its camera
 * arithmetic can be perfect while the map still refuses to turn.
 *
 * jsdom has no WebGL, so the component's renderer comes back null — that path
 * is exercised here on purpose, because it is the same one a reader with a
 * blocked or missing GL context takes, and the map must still respond.
 */
const BOX = { width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500, x: 0, y: 0 };

/** A loaded save in which the reader has been to exactly one body. */
function stubWorld(...visitedObjectIds: number[]) {
  const ids = new Set(visitedObjectIds);
  return {
    hasWorld: () => true,
    isVisited: (objectId: number) => ids.has(objectId),
    tracksVisit: (id: string) => id !== 'Sun',
    // Mirrors WorldService.isKnown(): no reveal turned on, so a body is
    // known when its visit is untracked or the save has been there.
    isKnown: (p: Planet) => p.id === 'Sun' || ids.has(p.object_id),
    name: () => 'test world',
  } as unknown as WorldService;
}

/** A save that has been everywhere — for tests about the map, not discovery. */
const allSeen = () => stubWorld(...planets.map((p) => p.object_id));

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [GalaxyMap],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(GalaxyMap);
  fixture.detectChanges();
  const stage = fixture.nativeElement.querySelector('.galaxy') as HTMLElement;
  // jsdom lays nothing out, so every rect is 0x0 and a drag would divide by a
  // zero-width view. Give the stage the size the CSS aspect ratio gives it.
  stage.getBoundingClientRect = () => BOX as DOMRect;
  return { fixture, stage, map: fixture.componentInstance };
}

/** jsdom has no PointerEvent; MouseEvent carries every field the map reads. */
function pointer(type: string, x: number, y: number, init: MouseEventInit = {}) {
  return new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...init });
}

describe('GalaxyMap interaction', () => {
  it('turns the galaxy by the pointer travel once the press passes the drag slop', () => {
    const { stage, map } = setup();
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 600, 250));

    // A drag across the full width is a half turn, so a quarter of it is
    // a quarter of pi.
    expect(map.orbit().yaw).toBeCloseTo(wrapYaw(HOME.yaw - Math.PI / 4), 10);
    expect(map.orbit().pitch).toBe(HOME.pitch);
  });

  it('ignores the jitter of a click, so a body under the pointer stays clickable', () => {
    const { map, stage } = setup();
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 402, 251));

    expect(map.orbit()).toEqual(HOME);
    expect(map.dragging()).toBe(false);
    expect(stage.classList.contains('dragging')).toBe(false);
  });

  it('makes bodies inert for the rest of a real drag, then live again on release', () => {
    // The .dragging class is what stops an orbit that ends over a planet from
    // also navigating to that planet's page.
    const { fixture, stage, map } = setup();
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 500, 300));
    fixture.detectChanges();
    expect(stage.classList.contains('dragging')).toBe(true);

    stage.dispatchEvent(pointer('pointerup', 500, 300));
    fixture.detectChanges();
    expect(map.dragging()).toBe(false);
    expect(map.pressed()).toBe(false);
    expect(stage.classList.contains('dragging')).toBe(false);
  });

  it('does not keep turning after the press ends', () => {
    const { stage, map } = setup();
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 500, 250));
    const after = map.orbit();
    stage.dispatchEvent(pointer('pointerup', 500, 250));
    stage.dispatchEvent(pointer('pointermove', 780, 250));

    expect(map.orbit()).toEqual(after);
  });

  it('cannot be dragged over the pole', () => {
    const { stage, map } = setup();
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 400, 5000));
    expect(map.orbit().pitch).toBe(MAX_PITCH);
  });

  it('leaves the page to scroll on a bare wheel and zooms only with ctrl/cmd held', () => {
    // The map is a section of the home page: swallowing every wheel event
    // over it would trap the reader's scroll.
    const { stage, map } = setup();
    const bare = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    stage.dispatchEvent(bare);
    expect(map.orbit().distance).toBe(HOME.distance);
    expect(bare.defaultPrevented).toBe(false);

    const zoomed = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    stage.dispatchEvent(zoomed);
    expect(map.orbit().distance).toBeLessThan(HOME.distance);
    expect(map.zoom()).toBeGreaterThan(1);
    expect(zoomed.defaultPrevented).toBe(true);
  });

  it('orbits with the arrow keys and resets with 0', () => {
    const { stage, map } = setup();
    const left = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    stage.dispatchEvent(left);
    // Compared as a wrapped difference, not as a bare number: home yaw is
    // near pi, so one press to the left crosses the seam into negative yaw.
    expect(wrapYaw(map.orbit().yaw - HOME.yaw)).toBeGreaterThan(0);
    expect(left.defaultPrevented).toBe(true);

    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(map.orbit().pitch).toBeLessThan(HOME.pitch);

    for (let i = 0; i < 40; i++) {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    }
    expect(map.orbit().distance).toBe(MIN_DISTANCE);

    stage.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(map.orbit()).toEqual(HOME);
    expect(map.atRest()).toBe(true);
  });

  it('leaves keys it does not use to the page', () => {
    const { stage, map } = setup();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    stage.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(map.atRest()).toBe(true);
  });

  it('survives having no WebGL context at all', async () => {
    // Not a hypothetical: this is the path in jsdom, and the one a reader
    // with GL blocked takes. Nothing may throw, and the map stays interactive.
    const { map, stage } = setup();
    await map.ready;
    stage.dispatchEvent(pointer('pointerdown', 400, 250));
    stage.dispatchEvent(pointer('pointermove', 600, 250));
    expect(map.orbit().yaw).not.toBe(HOME.yaw);
  });

  describe('the DOM hit areas laid over the spheres', () => {
    /** One animation frame; the map draws and re-projects on rAF. */
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    it('gives every body a marker, and puts the Sun in the middle of the view', async () => {
      const { map } = setup();
      await map.ready;
      await frame();

      // The home universe only: five more planets sit beyond the wormhole,
      // in coordinates of their own, and have their own view.
      // The home universe, plus the black hole, which has no world index
      // because it is in both.
      const home = planets.filter(
        (p) => p.type !== 'station' && (p.wormhole === null || p.wormhole === '0'),
      );
      expect(map.markers().length).toBe(home.length);

      // The camera looks at the origin and the game puts the Sun there, so
      // whatever the orbit, the Sun projects to the centre of the box.
      const sun = map.markers().find((m) => m.id === 'Sun')!;
      expect(sun.x).toBeCloseTo(BOX.width / 2, 6);
      expect(sun.y).toBeCloseTo(BOX.height / 2, 6);
      expect(sun.isStar).toBe(true);
      expect(sun.size).toBeGreaterThan(0);
    });

    it('re-projects when the camera moves, and draws nearer bodies on top', async () => {
      const { map } = setup();
      await map.ready;
      await frame();
      const before = map
        .markers()
        .map((m) => `${m.id}:${Math.round(m.x)}`)
        .join();

      map.dollyBy(3);
      await frame();
      expect(
        map
          .markers()
          .map((m) => `${m.id}:${Math.round(m.x)}`)
          .join(),
      ).not.toBe(before);

      // Closing in has to make the bodies bigger on screen, not just move them.
      const orders = map.markers().map((m) => m.order);
      expect(new Set(orders).size).toBeGreaterThan(1);
    });

    it('grows a body on screen as the camera closes in on it', async () => {
      const { map } = setup();
      await map.ready;
      await frame();
      const far = map.markers().find((m) => m.id === 'Sun')!.size;

      map.dollyBy(5);
      await frame();
      expect(map.markers().find((m) => m.id === 'Sun')!.size).toBeGreaterThan(far);
    });
  });

  describe('with a .world save loaded', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const sun = planets.find((p) => p.id === 'Sun')!;
    const earth = planets.find((p) => p.id === 'Earth')!;

    it('names the bodies the save has been to, and leaves the rest unnamed', async () => {
      const { fixture, map } = setup(stubWorld(sun.object_id, earth.object_id));
      await map.ready;
      await frame();
      fixture.detectChanges();

      const labels = [...fixture.nativeElement.querySelectorAll('.body .lbl')].map((el) =>
        (el as HTMLElement).textContent!.trim(),
      );
      // The Sun is never reported as visited either way. The black hole is,
      // and this save has not been there.
      expect(labels.sort()).toEqual(['Earth', 'Sun']);
      // The unvisited bodies are still on the map, still hoverable and still
      // linked, and each carries a "?" — they are anonymous, not absent.
      expect(fixture.nativeElement.querySelectorAll('.body').length).toBe(map.markers().length);
      expect(
        map
          .markers()
          .filter((m) => m.known)
          .map((m) => m.id)
          .sort(),
      ).toEqual(['Earth', 'Sun']);
      const glyphs = [...fixture.nativeElement.querySelectorAll('.body .qm')];
      expect(glyphs.length).toBe(map.markers().length - 2);
      expect(glyphs.every((el) => (el as HTMLElement).textContent!.trim() === '?')).toBe(true);
    });

    it('leaves an undiscovered body unclickable — no href to follow or tab into', async () => {
      const { fixture, map } = setup(stubWorld(sun.object_id, earth.object_id));
      await map.ready;
      await frame();
      fixture.detectChanges();

      const linked = [...fixture.nativeElement.querySelectorAll('.body[href]')];
      expect(linked.length).toBe(2);
      // Every other body is an <a> with no href: rendered, hoverable, inert.
      expect(fixture.nativeElement.querySelectorAll('.body').length).toBe(map.markers().length);
    });

    it('does not give the name away in the hover readout either', async () => {
      const { map } = setup(stubWorld(sun.object_id, earth.object_id));
      await map.ready;

      map.hovered.set('Moon');
      expect(map.hoveredName()).toBe('unknown');
      expect(map.hoveredKnown()).toBe(false);
      map.hovered.set('Sun');
      expect(map.hoveredName()).toBe('Sun');
      expect(map.hoveredKnown()).toBe(true);
    });

    it('names everything once a save has been everywhere', async () => {
      const { fixture, map } = setup(allSeen());
      await map.ready;
      await frame();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.body .lbl').length).toBe(
        map.markers().length,
      );
      expect(fixture.nativeElement.querySelectorAll('.body .qm').length).toBe(0);
      map.hovered.set('Earth');
      expect(map.hoveredName()).toBe('Earth');
      expect(map.hoveredKnown()).toBe(true);
      expect(fixture.nativeElement.querySelectorAll('.body[href]').length).toBe(
        map.markers().length,
      );
    });

    it('names the black hole once the save records 999', async () => {
      // ObjectID.BlackHole = 999, recorded like any other location: the game
      // draws an undiscovered one as an anonymous blip, and so does the map.
      const hole = planets.find((p) => p.type === 'blackhole')!;
      expect(hole.object_id).toBe(999);

      const { fixture, map } = setup(stubWorld(sun.object_id, hole.object_id));
      await map.ready;
      await frame();
      fixture.detectChanges();

      const labels = [...fixture.nativeElement.querySelectorAll('.body .lbl')].map((el) =>
        (el as HTMLElement).textContent!.trim(),
      );
      expect(labels.sort()).toEqual(['BlackHole', 'Sun']);
      expect(map.markers().find((m) => m.id === 'BlackHole')!.known).toBe(true);

      map.hovered.set('BlackHole');
      expect(map.hoveredName()).toBe('BlackHole');
      expect(map.hoveredKnown()).toBe(true);
    });

    /** The marker node for `id`; markers() and the .body nodes share an order. */
    function nodeFor(fixture: { nativeElement: HTMLElement }, map: GalaxyMap, id: string) {
      const idx = map.markers().findIndex((m) => m.id === id);
      expect(idx).toBeGreaterThanOrEqual(0);
      return [...fixture.nativeElement.querySelectorAll('.body')][idx] as HTMLElement;
    }

    it('gives an undiscovered black hole no ring, so it reads as any other body', async () => {
      // A black sphere inside an orange ring announces itself even with no
      // label: hiding the name achieves nothing if the shape gives it away.
      const { fixture, map } = setup(stubWorld(sun.object_id, earth.object_id));
      await map.ready;
      await frame();
      fixture.detectChanges();

      const node = nodeFor(fixture, map, 'BlackHole');
      expect(node.classList.contains('unknown')).toBe(true);
      expect(node.classList.contains('hole')).toBe(false);
      // It still carries the "?" every other undiscovered body carries.
      expect(node.querySelector('.qm')!.textContent!.trim()).toBe('?');
    });

    it('gives it its ring back once the save has discovered it', async () => {
      const hole = planets.find((p) => p.type === 'blackhole')!;
      const { fixture, map } = setup(stubWorld(sun.object_id, hole.object_id));
      await map.ready;
      await frame();
      fixture.detectChanges();

      const node = nodeFor(fixture, map, 'BlackHole');
      expect(node.classList.contains('hole')).toBe(true);
      expect(node.classList.contains('unknown')).toBe(false);
    });
  });

  describe('the two universes', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const bodies = planets.filter((p) => p.type !== 'station');
    const beyond = bodies.filter((p) => p.wormhole === '1');
    const hole = bodies.find((p) => p.type === 'blackhole')!;
    const theSun = planets.find((p) => p.id === 'Sun')!;

    it('keeps the black hole in both worlds, because it is in both', () => {
      // One position, no world index: it is the thing that joins them.
      const { map } = setup(allSeen());
      expect(hole.wormhole).toBeNull();
      expect(map.bodies().some((b) => b.id === hole.id)).toBe(true);
      map.showWorld('1');
      expect(map.bodies().some((b) => b.id === hole.id)).toBe(true);
      // And it is never offered as a world of its own.
      expect(map.worlds()).toEqual(['0', '1']);
    });

    it('keeps it in both worlds even while it is undiscovered', () => {
      // Galaxy 2 is offered once a world-1 body is known, and the black hole
      // is not inferred from that: ObjectID.TwinsPortal = 996 means a visited
      // twin is not proof of a trip through the hole. So Galaxy 2 can show a
      // "?" black hole, and that is the honest reading of the save.
      const { map } = setup(stubWorld(beyond[0].object_id));
      expect(map.worlds()).toEqual(['0', '1']);

      map.showWorld('1');
      expect(map.bodies().some((b) => b.id === hole.id)).toBe(true);
      expect(map.plan().unknown.has(hole.id)).toBe(true);
    });

    it('names the worlds by number, counting from one', () => {
      const { fixture, map } = setup(allSeen());
      expect(map.worlds().map((w) => map.worldName(w))).toEqual(['Galaxy 1', 'Galaxy 2']);
      const labels = [...fixture.nativeElement.querySelectorAll('.worlds button')].map(
        (b: Element) => b.textContent!.trim(),
      );
      expect(labels).toEqual(['Galaxy 1', 'Galaxy 2']);
    });

    it('lights Galaxy 2, which contains no star of its own', () => {
      // Its five planets would otherwise be lit by nothing but the ambient
      // fill and read as five dark discs.
      const { map } = setup(allSeen());
      map.showWorld('1');
      expect(map.bodies().some((b) => b.type === 'star')).toBe(false);
    });

    it('draws one universe at a time', () => {
      // Their coordinates are per-world: drawn together, five planets sit at
      // positions that mean nothing relative to the Sun.
      const { map } = setup(allSeen());
      expect(beyond.length).toBe(5);
      expect(map.worlds()).toEqual(['0', '1']);
      expect(map.bodies().length).toBe(bodies.length - beyond.length);
      expect(map.bodies().some((b) => b.wormhole === '1')).toBe(false);
    });

    it('switches to the far side, and reframes when it does', () => {
      const { map } = setup(allSeen());
      map.orbit.set({ ...HOME, distance: 1 });
      map.showWorld('1');

      // The black hole comes along: it is in both worlds at once.
      expect(
        map
          .bodies()
          .map((b) => b.id)
          .sort(),
      ).toEqual([...beyond.map((b) => b.id), hole.id].sort());
      expect(map.orbit()).toEqual(HOME);
    });

    it('projects the world it is showing, not the one it left', async () => {
      const { map } = setup(allSeen());
      await map.ready;
      map.showWorld('1');
      await frame();
      expect(
        map
          .markers()
          .map((m) => m.id)
          .sort(),
      ).toEqual([...beyond.map((b) => b.id), hole.id].sort());
    });

    it('offers the far side only once a save has been there', () => {
      // Including the default, which is a new game: it has not been through.
      expect(setup().map.worlds()).toEqual(['0']);
      TestBed.resetTestingModule();

      const home = setup(stubWorld(theSun.object_id));
      expect(home.map.worlds()).toEqual(['0']);
      expect(home.map.bodies().some((b) => b.wormhole === '1')).toBe(false);
    });

    it('offers it again to a save that has been through', () => {
      const { map } = setup(stubWorld(beyond[0].object_id));
      expect(map.worlds()).toEqual(['0', '1']);
    });

    it('falls back home when the selected world stops being offered', () => {
      const { map } = setup(stubWorld(theSun.object_id));
      map.showWorld('1');
      expect(map.activeWorld()).toBe('0');
      expect(map.bodies().some((b) => b.wormhole === '1')).toBe(false);
    });
  });
});
