---
title: Keeping the nose where you point it
summary: RCS thrusters have their own batteries and run out; maneuvering thrusters only push one way; and you can place a 3D joystick on day one.
spoiler: components
updated: 2026-09-07
order: 60
---

Rotation is a separate problem from lift, and it is the one that kills more
early ships. A vessel that climbs but tumbles is worse than one that never
left, because it climbs into a spin you cannot arrest.

There are two entirely different ways to control attitude in this game, and
mixing them up is the source of most of the confusion.

## The easy one: RCS, and its expiry date

A new game hands you **six RCS Thrusters and one [[part:GimbalController]]**, which is
exactly one controller's worth — the controller drives six. That is not a
coincidence, it is the game's intended starter package.

The RCS system is deliberately simple. The thrusters take **no wiring at all**.
You place them, place the controller, and feed the controller three data
signals — yaw, pitch and roll, straight off a joystick. The controller draws
4 P/s from your circuit and sorts out which thruster fires for which input.

The catch is severe and the game states it plainly on the part: **each RCS
Thruster carries a built-in, single-use battery**, and when that battery is
flat the thruster is dead. It does not recharge, your ship's power cannot reach
it, and the only indication is the row of status lights on the controller.

The numbers: 700 P of stored charge, drawn at 5 P/s while firing. That is
**140 seconds of firing per thruster** across its entire life. Not 140 seconds
of flight — 140 seconds of actually pushing. A ship that hunts for its
orientation, correcting constantly, will burn through a set in a single
journey; a ship flown in short deliberate nudges will make them last a
campaign.

So: RCS is the system to learn on and the system to keep as a reserve. It is
not the system to fly a long mission with.

## The permanent one: maneuvering thrusters

Maneuvering thrusters wire into the ship's own power like everything else, and
they never expire. They cost you the wiring instead.

- **[[part:SmallManeuveringThruster]]** — 30,000 force, 80 mass, 5 P/s
- **[[part:BidirectionalElectricManeuveringThruster]]** — 80,000 force, 132 mass, 15 P/s
- **[[part:MediumManeuveringThruster]]** — 100,000 force, 130 mass, 17 P/s
- **[[part:LargeManeuveringThruster]]** — 370,000 force, 400 mass, 50 P/s

For comparison, an [[part:GimbalThruster]] is 10,000 force at 30 mass. Even the Small
Maneuvering Thruster is three times the authority, permanently — RCS is
convenient, not strong.

The Medium is the sweet spot by a clear margin: it beats the Bidirectional on
force while weighing slightly less, and it is close to a straight upgrade over
three Smalls. The Large exists for ships heavy enough that mounting nine
Mediums is the real problem.

**The word "bidirectional" is the tell.** Every other maneuvering thruster
pushes one way only. To rotate a ship both ways about one axis you need
**two of them, mounted opposite**, and something to decide which one fires.

That something is the **[[part:JoystickSplitter]]**. It takes one input and sends positive
values to one output and negative values to the other — _both as positive
numbers_. Since a joystick axis runs from −1 through 0 to +1 and a thruster
wants 0 to 1, the Sign Splitter is precisely the adapter between them: joystick
axis in, one output to each of the opposed pair. Build that three times, once
per axis, and you have a full permanent attitude system.

This is the single piece of wiring that makes the difference between a ship
that turns and a ship that only turns one way, and nothing in the game tells
you about it.

## Place a 3D joystick on day one

The starting inventory lists 15 Lever Verticals and no joysticks, so most
people build their first control panel out of levers. They do not have to.

Levers, joysticks, buttons and switches all belong to one stock pool —
**BasicControllers** — and [a part is placeable when its pool is
non-empty](/guides/how-parts-unlock), regardless of which part in the pool the
stock arrived as. A new game starts with 17 units in that pool. So the
**[[part:Joystick3D]]** is placeable from the first minute of the game, and it outputs
yaw, pitch and roll on three separate ports — exactly the three inputs the RCS
Controller wants.

One part, three cables, and the attitude system is done. It is the best
sixteen units of mass in the early game.

If you prefer discrete controls, the same pool holds the [[part:Joystick2D]]
(horizontal and vertical), the single-axis joysticks, and the levers. The
levers have a detail worth knowing: a small red button on the back right
switches each one between **0-to-1** and **−1-to-1** mode. A lever behaving
strangely as a throttle is usually a lever in the wrong mode.

## Knowing which way is up

Rotation control is useless without something telling you your orientation.
Four instruments do it, and they answer different questions:

- **[[part:GyroLine]]** — outputs **pitch** and **roll** in degrees, and draws them on
  its own screen. 1.5 P/s, 22 mass. This is the instrument you fly by.
- **[[part:Inclinometer]]** — outputs the angle in degrees between its own down
  direction and the direction of gravity. One number rather than two: how far
  off level you are, without saying which way. It needs no power at all.
- **[[part:AxisRotometer]]** — outputs angular velocity in degrees per second about
  whichever axis you mounted it on. Not where you are pointing, but how fast
  that is changing. Three of them, one per axis, is what you need to build
  anything that damps a spin automatically.
- **[[part:TrajectoryCurvatureMeter]]** — outputs the angle between where the ship is
  travelling and where it is facing. The instrument for landings and burns,
  where those two diverging is the whole problem. It needs a clear view
  forward.

For automatic stabilisation, the loop is: Axis [[part:Rotometer]] measures the spin,
that value goes through a Sign Splitter, and the two outputs drive the opposed
pair of maneuvering thrusters. [[part:Remapper]] scales the rotometer's degrees per
second into the 0-to-1 the thrusters want, and a Delay block stops the loop
chasing its own output. All four of those blocks are covered in
[power and data are two different networks](/guides/wiring-power-and-data).

## Landing is an attitude problem too

You get **six Small Dampers** at the start and they are easy to leave in the
inventory. They absorb impact force and reduce landing damage; Medium and Large
versions exist later at 65 and 125 mass against the Small's 30.

Attitude matters here more than speed does. A ship that touches down flat
spreads the impact across its dampers; a ship that touches down at an angle
puts all of it through one corner of the frame. This is what the Gyro-Line is
for on approach, and it is why the Trajectory Curvature Meter reading zero on
final is worth more than any amount of RCS authority.

## Where the numbers come from

Forces, masses, power draws and port lists are read out of the game's own
prefabs and shown on each part's page in [Components](/components). The
behaviour in prose — the single-use battery, the red button on the levers, the
Sign Splitter's outputs — is the game's own component text, from the same
files. If a patch changes a figure the component pages change with it, and this
guide is what falls behind.
