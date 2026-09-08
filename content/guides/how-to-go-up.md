---
title: How to go up
summary: What the starting kit can actually lift, and how to compare a thruster before you bolt it on.
spoiler: components
updated: 2026-09-07
order: 30
---

The most-asked question about this game is also the shortest: the ship is
built, the ship is powered, the ship sits there. Nothing in the game tells you
how much lift you need, so people add thrusters until something happens.

This guide is the arithmetic instead. It will not fly the ship for you, but it
will tell you which part is worth its own weight before you weld it on.

## The two numbers that decide everything

Every propulsion part in the game carries two figures in its stats, and the
wiki shows both on its [component page](/components):

- **Max force** — how hard it pushes.
- **Mass** — how much of that push it spends carrying itself.

A thruster that weighs more than the lift it adds makes the ship worse. So the
number to compare parts by is **force ÷ mass**, and it varies by a factor of
thirty across the catalogue.

Two cautions before the table of numbers, because this wiki would rather be
useful than confident:

The game's force and mass figures are in the game's own units, and the files do
not say what those units are. So treat every number here as a **ratio for
comparing one part against another**, not as a physical prediction. There is no
honest way to say "this ship will lift off" from the files alone — but there is
a completely honest way to say _this thruster is three times better than that
one per unit of mass_, and that is the decision you are actually making.

The parts do, however, say where they work — in their own descriptions, which
this wiki reproduces on every component page. That turns out to matter more
than the force figure, and it is the section below the numbers.

## Force per unit of mass

Chemical wins, and it is not close.

**Fuel thrusters**

- [[part:LargeFuelThruster]] — **12,270** (20,000,000 force, 1,630 mass)
- [[part:SmallFuelThruster]] — **8,947** (1,700,000 force, 190 mass)
- [[part:MediumFuelThruster]] — **6,395** (5,500,000 force, 860 mass)

**Electric lift**

- [[part:DuctedFan]] — **3,086** (2,500,000 force, 810 mass)
- [[part:LargeElectricThruster]] — **2,966** (4,300,000 force, 1,450 mass)
- [[part:AtmosphericThruster]] — **2,558** (550,000 force, 215 mass)
- [[part:ElectricLiftThruster]] — **2,238** (235,000 force, 105 mass)
- [[part:AtmosphericFan]] — **2,222** (400,000 force, 180 mass)
- [[part:SmallElectricThruster]] — **2,063** (330,000 force, 160 mass)
- [[part:MediumElectricThruster]] — **1,781** (1,300,000 force, 730 mass)
- [[part:AtmosphericLiftFan]] — **1,042** (125,000 force, 120 mass)
- [[part:SmallSolidFuelThruster]] — **864** (950,000 force, 1,100 mass)

Three things fall straight out of that list.

**The Small Fuel Thruster is the best part in the game per unit of mass, after
the Large.** It out-lifts the Large _Electric_ Thruster three to one while
weighing an eighth as much. The moment the fuel line opens up, the ship you
have been nursing along on electricity gets rebuilt.

**Bigger is not automatically better within a family.** The Medium Electric
Thruster is the _worst_ electric lift in the game per unit of mass — worse than
the Small, worse than the Large. It buys you concentration, not efficiency:
one part instead of four, in a hull where you have run out of mounting faces.

**The Small Solid Fuel Thruster is not a lifter.** At 864 it is barely better
than the flat fan, and it masses 1,100 on its own. It is a large impulse in a
heavy package, which is a different tool.

## Force per unit of power

If your problem is the battery rather than the scale, the ranking changes.

- Atmospheric Fan — **50,000** force per P/s (400,000 force, 8 P/s)
- Atmospheric Thruster — **50,000** (550,000 force, 11 P/s)
- Ducted Fan — **41,667** (2,500,000 force, 60 P/s)
- Atmospheric Flat Fan — **31,250** (125,000 force, 4 P/s)
- Large Electric Thruster — **26,875** (4,300,000 force, 160 P/s)
- Small Electric Thruster — **22,000** (330,000 force, 15 P/s)
- Medium Electric Thruster — **21,667** (1,300,000 force, 60 P/s)
- Electric Flat Thruster — **21,364** (235,000 force, 11 P/s)

The atmospheric parts are roughly **twice as power-efficient as any electric
thruster**. That is the trade the two families make: electric thrusters are
lighter for their push, atmospheric parts are cheaper to run. On a short hop
the mass matters; on a long climb the battery does.

Fuel thrusters draw no electricity at all. They spend fuel — 7.5 per second for
the Large, 2.5 for the Medium, 0.85 for the Small — which is a different budget
entirely.

One caveat on all three fuel figures above: the game says plainly that a fuel
thruster's output **depends on the fuel you feed it**, and drops if supply runs
short. The force numbers are a ceiling reached with good fuel, not a constant.
Green is described as mediocre; Blue gives "very small effectivity"; Red is
highly efficient but so reactive it needs active cooling and will not travel
safely down a basic pipe — those are rated for fuel stability of 50% or better,
and only nanopipes are safe for every type.

## Where each thruster works

This is the part that no ranking captures, and the game states it on each part.

**Atmospheric parts stop dead in space.** The Atmospheric Fan, Atmospheric
Thruster and Ducted Fan all say their efficiency depends on air density and
that they do not function in a vacuum. They are for getting around inside a
planet's atmosphere, and their excellent force-per-power buys you nothing above
it.

**Underwater, they disagree with each other.** The Atmospheric Fan works
submerged, down to 5,000 m below sea level. The Atmospheric Thruster does not
work underwater at all. The Ducted Fan works but with minimal performance. Six
planets have a sea, so this is a real decision rather than trivia — see the
[planet field guide](/guides/planet-field-guide).

**Electric and fuel thrusters carry no such restriction.** Nothing in their
descriptions ties them to air, and the electric ones are explicitly rated by
range: the Small for short hops and intraplanetary flight, the Medium for
medium range, the Large and every fuel thruster for long-range flights.

**Two parts push both ways.** The Atmospheric Fan works forward and backward,
and the Ducted Fan can be tilted forward and backward to steer. Everything else
pushes one direction only, which is a fact worth holding on to while you are
placing them.

Put that together with the air figures for each planet and the shape of a fleet
appears. CoronaSilva at 0.83 air is where fans are at their best; Kovo at 0.06
is effectively a vacuum, and a ship built around atmospheric parts should not
go there.

## What a new game can actually lift

The starting stock is fixed, and it is worth knowing exactly. You begin with:

- 4 × Atmospheric Flat Fan — 125,000 force each
- 2 × Atmospheric Fan — 400,000 each
- 2 × Atmospheric Thruster — 550,000 each

That is **2,400,000 units of force**, costing **1,270 of mass** and **54 P/s**
to run, before you have added a single frame block.

Against 8 Small Disposable Batteries — also the starting allowance, 4,000 power
each, 32,000 in total — running all eight propulsion parts flat out drains the
ship in **about ten minutes**. Every frame block you add is 25 more mass on the
same 2,400,000, so early ships are small for a reason that is arithmetic rather
than taste.

## The same ship on a different planet

The lift you need scales directly with local gravity, and the wiki has that
figure for every body. Earth is **10.0**. Read the rest as a multiplier of it:

- **Helirion 3.9** — 0.39× Earth. The easiest place in the system to leave.
- **Moon 4.1**, **Kovo 4.9** — under half of Earth.
- **Tenebra 6.5**, **Rimshell 6.8**, **Ashbelt 7.3**, **Aundara 7.8** — easier.
- **Outcast 8.5**, **Goldtwin 9.0**, **Ascensia 9.4** — near enough Earth.
- **Pinktwin 10.6**, **CoronaSilva 10.7**, **Baobara 11.4** — heavier.
- **Basalt 18.4** — **1.84× Earth**, and by a distance the hardest ascent in
  the game.

A ship that climbs off Earth with nothing to spare will not climb off Basalt.
It will climb off Helirion carrying more than twice its own payload.

Gravity is only half of a planet's argument, though. Wind, air density and the
sea decide whether the climb is _survivable_ as well as possible, and those are
in the [planet field guide](/guides/planet-field-guide).

## Where this leaves you

Build light, and count the propulsion mass as payload it has to lift too. Pick
the atmospheric parts while your problem is power and the fuel parts the moment
your problem is scale. And when a ship will not leave the ground, add up the
force ÷ mass of everything you have bolted on before you bolt on a ninth — the
part you are about to add may be the reason.

Every figure above is on the part's own page, pulled out of the game's files.
If a patch changes them, the pages change with it and this guide is what goes
stale — check the numbers there.
