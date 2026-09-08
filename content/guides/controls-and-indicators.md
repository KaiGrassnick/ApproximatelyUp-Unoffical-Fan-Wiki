---
title: The controls that live on your ship
summary: Every mode switch, threshold and warning light the game hides on the parts themselves.
spoiler: components
updated: 2026-09-07
order: 25
---

Most of this game's controls are not on your keyboard. They are on the parts:
a small button on the back of a lever, a mode selector on a radar, a light on
a meter that goes red for a reason nobody explains.

The game does tell you about them — in each component's own description, which
you have to be holding the part to read. This page collects every one of them
in one place, because "the part has a setting you have not found" is behind a
surprising share of ships that do not behave.

## Settings you can change on a placed part

**Levers have two modes, and the button is easy to miss.** All three levers —
[[part:LeverVertical]], [[part:LeverVerticalHalf]], [[part:LeverHorizontal]] — carry a **small red
button at the back right** that switches between **0-to-1** and **−1-to-1**
output. A lever that will only ever drive a thruster forwards, or one that
sits at zero in what you thought was its middle, is a lever in the wrong mode.
You start a new game with fifteen of these, so it is worth knowing on day one.

**Radar has a mounting mode.** Select **Mode: Wall** when it is on a wall and
**Mode: Floor** when it is on the floor. Its display rotates to match the
ship's orientation, and it is the instrument for finding flat ground to land
on and for locating planetary stations.

**Round has three.** Nearest integer, Floor, or Ceil, selected on the block.

**Memory and [[part:Accumulator]] each have two.** In **Continuous** mode they act while
the control signal is at 0.5 or above; in **Pulse** mode they act only on the
moment it crosses 0.5. Continuous is a hold; Pulse is a trigger. A counter that
races to a huge number the instant you touch a button is a Pulse job wired as
Continuous.

**Values you type in.** Constant outputs whatever number is set on its face.
[[part:SimpleThreshold]] compares against a value set on the block. [[part:FuseBox]]
interrupts the current above a threshold you choose. Manual valves — pipe and
nanopipe — set fuel flow anywhere from 0% to 100% by hand.

**Buttons that select a signal.** The [[part:DataHub]] routes one of five inputs to its
output, chosen by **which channel button is currently pressed** on the part
itself rather than by any signal. The [[part:ColoredLightController]] pairs
wirelessly with Colored Lights on a matching channel, and takes its colour from
RGB data inputs.

## Lights that mean something

The game uses green and red consistently, and each one is answering a specific
question.

**[[part:GimbalController]]** — the indicator lights show the **battery status of the six
RCS thrusters**. This is the only warning you get that a thruster is about to
become dead weight, because each carries a single-use battery it cannot
recharge. See [keeping the nose where you point
it](/guides/attitude-control).

**[[part:SpaceGPS]]** — green above 60% clear space around it, red below. **[[part:Magnetometer]]**
— green above 70%, red below. Both need open sky to work and both will tell you
when they are not getting it, which is more courtesy than the other obstructed
sensors offer.

**[[part:WirelessTransmitter]]** — green when it is sending or receiving; **red when
more than one transmitter is broadcasting on the same channel**, which the game
says is not allowed. If a wireless link has quietly stopped working, look for a
second transmitter you left on the same channel.

**[[part:PowerGenerationMeter]] and [[part:PowerUsageMeter]]** — both display their figure,
both output it on a data port, and both light **green when the circuit has
enough power and red when it is in deficit**. You start with one of each, and
between them they are the cheapest early warning in the game: 4 mass, and the
red light comes on before the ship goes dark. Fit them.

**[[part:BrakingPointSystem]] and [[part:ETASystem]]** — a colour scale from red (you are
going to hit it) to green (you have stopping margin), and a **green light that
blinks while the system is actually computing**. A steady light means it is not
working, which is a different problem from a red one.

**Batteries** — every disposable and rechargeable battery has a built-in
display or strip indicator. The **Medium and Large Rechargeable** also **output
their current charge on a data port**; the Small Rechargeable and all three
disposables do not. If you want a low-battery alarm wired to a [[part:RedAlertLight]],
the two larger rechargeables are the only cells that can drive one directly.

**[[part:OverloadingCrystal]]** — must be **manually discharged every 108 seconds**.
When its timer turns red you press the discharge button immediately. This is
the mission item for the Overloading Crystal objective, and the timer is the
objective.

## Sensors that need a clear view

Several instruments will report confidently wrong numbers if you bury them in
the hull, and only two of them warn you. The game's own requirements:

- **Mounted outside the ship, unobstructed view** — [[part:Altimeter]], [[part:Atmometer]],
  [[part:Windmeter]].
- **Nothing in front of it** — [[part:VelocityMeter]], [[part:TrajectoryCurvatureMeter]],
  [[part:SpaceScanner]].
- **A percentage of clear space around it** — Space GPS (60%), Magnetometer
  (70%). These two have the indicator lights above.

The Altimeter has one more quirk worth knowing: it **outputs INF when outside
any atmosphere**. An altimeter reading infinity is not broken, it is telling
you that you have left the air.

## The parts that need no power at all

Worth knowing when you are budgeting, because it is a shorter list than you
would guess. These have a data output and no power port: [[part:Massmeter]],
[[part:Accelerometer]], [[part:Inclinometer]], [[part:AxisRotometer]], [[part:Rotometer]], [[part:Thermoscan]], and every
math and logic block in the game.

You can build an entire computation and stabilisation system that costs your
batteries nothing. Only the things that sense at a distance, display, or move
draw current.

## The keyboard

Here the wiki has to be honest about what it knows.

Everything above is read out of the game's own files. **The keyboard bindings
are not** — they live in an asset this wiki's extraction pipeline does not
read, so nothing below can be checked the way the rest of this page can be.
What follows is collected from players on the Steam discussions, and is offered
as a starting point rather than as fact:

- **G** — switch to build mode in the garage.
- **R** — finalise construction and activate the ship's electronics. Several
  people report that a ship whose wiring "does nothing" simply has not been
  finalised.
- **P** — time rewind, for undoing a landing that went badly.
- **Left Alt** — opens key remapping.

If you can confirm or correct these, the wiki would rather be right: the
feedback button in the corner is the way to say so, and this section will be
rewritten around whatever turns out to be true.

## Where the rest comes from

Every mode, threshold, indicator light and mounting requirement on this page
except the keyboard section is quoted from the game's own component
descriptions, extracted from its files and shown in full on each part's page in
[Components](/components). If a patch changes a part's behaviour, its page
changes with it and this guide is what goes stale.
