---
title: Power, batteries and how far you get
summary: What the ship draws, what a battery holds, and why disposable cells beat rechargeable ones three to one.
spoiler: components
updated: 2026-09-07
order: 40
---

Running out of power in flight is the second thing that happens to most ships,
after failing to leave the ground at all. It is entirely predictable — the
game records exactly what every part draws and exactly what every battery
holds — but it never puts the two side by side.

This guide does. The whole system is one subtraction.

## The unit

Everything electrical is measured in **P** (stored power) and **P/s** (power
per second). A battery holds P. A consumer eats P/s. Divide one by the other
and you have your endurance in seconds.

That is the entire model. There is no efficiency curve and no voltage; a
battery holding 4,000 P feeding a 5 P/s load lasts 800 seconds.

## What a battery is worth

The interesting number is not capacity — it is capacity **per unit of mass**,
because on a spaceship the battery is cargo the thrusters have to lift.

**Disposable**

- [[part:LargeDisposableBattery]] — 100,000 P, 1,000 mass → **100 P per mass**
- [[part:MediumDisposableBattery]] — 20,000 P, 350 mass → **57 P per mass**
- [[part:SmallDisposableBattery]] — 4,000 P, 120 mass → **33 P per mass**

**Rechargeable**

- [[part:LargeRechargeableBattery]] — 40,000 P, 1,250 mass → **32 P per mass**
- [[part:MediumRechargeableBattery]] — 8,000 P, 450 mass → **18 P per mass**
- [[part:SmallRechargeableBattery]] — 2,000 P, 145 mass → **14 P per mass**

Two rules come out of this, and both are worth internalising.

**A disposable cell carries roughly three times the energy of the rechargeable
of the same size.** Large Disposable holds 100,000 P; Large Rechargeable holds
40,000 P and weighs 250 more. This is not a small edge you can design around.
For a one-way trip, or any trip where you will be back at a station before you
need a second charge, disposable is simply the better part.

**Bigger cells are better cells.** Energy per mass climbs steadily with size in
both families. A Large Disposable is three times as mass-efficient as a Small
Disposable. If you can fit one big battery instead of eight small ones, fit the
big one — 100,000 P for 1,000 mass, against 32,000 P for 960.

The rechargeables earn their keep exactly where the disposables cannot follow:
a ship that generates its own power and is expected to keep flying after the
first tank is empty. Small, Medium and Large Rechargeable take back 2,000,
8,000 and 40,000 P respectively — their full capacity, so a rechargeable is a
buffer that refills rather than a tank that drains.

## What generation actually gives you

Very little, is the honest answer, and that shapes the whole game.

- **[[part:DynamoBox]]** — 12 P/s, 70 mass
- **[[part:SolarPanel]]** — 10 P/s, 45 mass
- **[[part:AutohemisphereSolarPanel]]** — 7 P/s, 65 mass

The Solar Panel is the best of the three per unit of mass, and the
Auto-Hemisphere version is the worst — you pay 20 extra mass and 3 P/s for the
convenience of not having to aim it.

Set 10 P/s against the draw list below and the scale becomes clear: **one solar
panel does not run one [[part:MediumElectricThruster]]**, which wants 60 P/s. Six
panels do, at 270 of mass. Generation in this game keeps instruments alive and
tops batteries up between burns. It does not fly the ship.

## What the ship draws

Ordered by appetite, so you can find the part that is emptying your cells:

**The heavy loads**

- [[part:RimcoreTurbo]] — 300 P/s
- [[part:LargeElectricThruster]] — 160 P/s
- [[part:SmallPlasmaGenerator]] — 100 P/s
- [[part:GreenTrenchPump]] — 90 P/s
- [[part:LavaSucker]] — 80 P/s
- Medium Electric Thruster — 60 P/s
- [[part:DuctedFan]] — 60 P/s
- [[part:LargeManeuveringThruster]] — 50 P/s
- [[part:OutcastPolarAnchor]] — 40 P/s
- Ballast — 30 P/s

**The moderate ones**

- [[part:MediumManeuveringThruster]] — 17 P/s
- [[part:SmallElectricThruster]] — 15 P/s
- [[part:BidirectionalElectricManeuveringThruster]] — 15 P/s
- [[part:ElectricLiftThruster]] — 11 P/s
- [[part:AtmosphericThruster]] — 11 P/s
- [[part:LargeGate]] / [[part:LargeNanogate]] — 10 P/s
- [[part:AtmosphericFan]] — 8 P/s
- [[part:MediumGate]] / [[part:MediumNanogate]] — 8 P/s

**The instruments, which are almost free**

- [[part:GimbalThruster]], [[part:SmallManeuveringThruster]], [[part:SmallGate]], [[part:Floodlight]],
  [[part:Magnetometer]], [[part:NightVisionCamera]], [[part:MonitorLargeLCD]] — 4–5 P/s
- [[part:AtmosphericLiftFan]], [[part:GimbalController]], [[part:SpaceGPS]], [[part:SpaceScanner]] — 4 P/s
- [[part:MonitorCRT]], [[part:FuelAnalyzer]] — 3 P/s
- Radar — 2 P/s
- [[part:GyroLine]], [[part:MonitorSmallLCD]] — 1.5 P/s
- Camera — 0.8 P/s
- [[part:CameraOverlay]] — 0.2 P/s

A full instrument panel — radar, gyro-line, GPS, two cameras and a monitor —
comes to well under 15 P/s. **You will never run out of power because of
instruments.** Fit the ones that help. Every meaningful drain on your battery
is something that moves.

## Working the budget

The calculation you want, before every departure:

1. Add the P/s of everything that will be running at once.
2. Add the P of every battery aboard.
3. Divide. That is your endurance in seconds, at full throttle.

Worked on a new game's stock: the eight starting propulsion parts draw 54 P/s
between them, and eight Small Disposable Batteries hold 32,000 P. That is
**592 seconds — just under ten minutes** of everything at once. Instruments
barely move it. Adding a Large Disposable Battery instead would give you
100,000 P for 1,000 mass, and about half an hour.

Endurance and lift pull against each other, of course: every battery you add
for range is mass the thrusters must carry, which raises the draw needed to
climb. [How to go up](/guides/how-to-go-up) is the other half of this
arithmetic, and the two are worth doing together.

## Two things that will catch you out

**The RCS thrusters are not on your circuit.** Each RCS Thruster carries a
**built-in, single-use battery** of 700 P and draws 5 P/s while firing — about
**140 seconds of firing each**, and then that thruster is dead and does not come
back. They are not wired to anything and your batteries cannot save them. See
[keeping the nose where you point it](/guides/attitude-control).

**Your cable has a limit.** A [[part:PowerCable]] carries **150 P/s**. Exactly two
parts in the game want more than that: the Large Electric Thruster at 160 P/s
and the Rimcore Turbopump at 300. Both need the [[part:PowerNanocable]], which carries 400. That is a wiring problem rather than a power problem, and it is covered in
[power and data are two different networks](/guides/wiring-power-and-data).

## Where the numbers come from

Every figure here is read out of the game's own prefabs and shown on each
part's page in [Components](/components). Nothing is estimated and nothing is
rounded except where this page says so. If the game patches its numbers, the
component pages update and this guide is what falls behind — trust them over
this text.
