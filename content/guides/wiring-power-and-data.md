---
title: Power and data are two different networks
summary: Red, yellow, blue and white ports; why a component with power still does nothing; and the 150 P/s ceiling on a cable.
spoiler: components
updated: 2026-09-07
order: 50
---

The single most common way to build a broken ship is to wire it once and expect
it to work. A part in this game usually needs **two** connections that have
nothing to do with each other: electricity to run on, and a data signal telling
it what to do. Give it only the first and it sits there, powered and idle,
which looks exactly like a bug.

There are four networks in total, and they never mix.

## The four colours

The game colour-codes every port, and the cables refuse to connect to the wrong
one — which is helpful, but only once you know what you are looking at.

- **Red — power.** Carries electricity. Connected with the **[[part:PowerCable]]** or
  the **[[part:PowerNanocable]]**. This is the network that drains your batteries.
- **Yellow — data input**, **blue — data output.** Carries numbers. Connected
  with the **[[part:DataCable]]**. Yellow takes a value in, blue sends one out; a Data
  Cable runs from a blue to a yellow.
- **White — plasma.** Carries plasma from a generator to a shield generator,
  and nothing else. Connected with the **[[part:PlasmaCable]]**. Only three ports in
  the entire game are this colour.
- **Pipes — fuel.** Not cables at all, but the same idea: a separate network,
  with its own valves and meters, that no electrical cable will join.

Across the whole component catalogue there are 142 data inputs, 105 data
outputs, 75 power ports and 3 plasma ports. Data is the network you will spend
the most time in, by a wide margin.

## "It has power and does nothing"

Look at what the part's ports actually are. On this wiki, every component page
lists them.

A **[[part:MonitorCRT]]** has a red port and a yellow one. Power alone gets you a lit
screen showing noise; it needs a camera on the data input before it shows
anything. A **[[part:SmallPlasmaGenerator]]** has a red port, a white one, _and_ a
yellow input running from 0 (off) to 1 (max) — with no data signal it is
switched off, however much power you feed it. A **[[part:PipeElectricValve]]**
draws 2.5 P/s and stays shut until something tells it to open.

The rule to carry around: **power is permission, data is instruction.** Most
things that move need both.

The exceptions are worth knowing because they are the parts you can bolt on and
forget. Cameras, gates, lights and the RCS system take power and behave
sensibly without a data line. Pure sensors — [[part:Massmeter]], [[part:Accelerometer]],
[[part:Inclinometer]], [[part:Thermoscan]] — have a blue output and no red port at all: they cost
nothing to run and are always talking, whether or not you are listening.

## Data signals are just numbers

There is no separate "logic" type. Every blue port emits a number, and every
convention in the game is built on top of that.

The one convention that matters is **0.5**. A [[part:LogicValue]] block outputs 1 when
its input is 0.5 or more and 0 when it is less; a [[part:PowerBlocker]] cuts the
circuit at 0.5; Memory and [[part:Accumulator]] update when their control signal crosses
0.5. Anywhere the game wants a yes or a no, the threshold is 0.5, and a raw
sensor reading will trip it by accident if you feed it in unscaled.

**[[part:Remapper]]** is therefore the most useful block in the game and the one people
find last. It linearly rescales a value from one range to another — an
altimeter reading 0 to 8,000 metres into a throttle of 0 to 1, say. Without it
you end up building the same conversion out of a Subtractor and a Divider every
time.

The rest of the vocabulary, all of which the wiki lists with its ports:

- **Splitting a signal** — [[part:Router2]] and [[part:Router4]] clone one input to
  two or four outputs. A blue port does not fan out on its own.
- **Choosing between signals** — [[part:SignalRouter3]] passes one of three inputs
  through, picked by a fourth. [[part:DataHub]] does the same for five inputs, picked
  by a button on its face rather than a signal.
- **Deciding** — Condition compares two inputs and outputs its True port or its
  False port. Both default helpfully when unconnected: True to 1, False to 0,
  which makes it a comparator with no extra wiring.
- **Remembering** — Memory holds a value until told to update. Accumulator adds
  its input to a running total and can be reset. Delay holds a signal back 1 to
  60 ticks, which is how you build anything that needs to react to its own
  output without shaking itself apart.
- **Arithmetic** — Adder, Subtractor, Multiplier, Divider, Modulo, Power,
  Square Root, Absolute, Round, Minimum, Maximum, and the full trigonometric
  set. [[part:AdditionArray]] sums up to seven inputs in one block, which saves a lot
  of daisy-chaining.

You start a new game with **30 Logic Values, 1,000 Data Cables and 10 Large
Datameters**, and the datameters are the ones to spend early. A [[part:LargeDatameter]]
displays the number on its input _and passes it through_ on its output, so you
can leave one spliced into a line permanently and watch what is actually
flowing. Debugging a ship without one is guessing.

## Two limits that bite

**A Power Cable carries 150 P/s.** Exactly two components in the game want more
than that: the **[[part:LargeElectricThruster]]** at 160 P/s and the **Rimcore
Turbopump** at 300. Neither will run on ordinary cable, and the failure is not
signposted. Both need the **Power Nanocable**, which carries 400 P/s — you get
it from the Helirion, Ascensia or Outflowermeter objectives, and until then a
Large Electric Thruster is a part you own and cannot properly feed.

**A router is a junction, not a bus.** The [[part:PowerRouter]] joins four cables into
one circuit; the [[part:LargePowerRouter]] joins eight. They do not amplify anything
and they do not isolate anything — everything on one circuit shares it. You
begin with 20 small routers and 2 large ones.

## Switching things off

Three parts control power without a switch on the part itself:

- **Power Blocker** cuts the circuit between its two power ports when its data
  input is 0.5 or higher. This is how you build a software-controlled kill
  switch, and how you keep an idle subsystem from draining the ship.
- **[[part:FuseBox]]** interrupts the current when it exceeds a threshold you set. It
  is the answer to one overloaded branch taking down everything.
- **[[part:WirelessTransmitter]]** carries a data signal up to 2,000 metres with no
  cable at all — and it is the only component in the game with a combined
  input/output port. One transmitter per channel: two broadcasting on the same
  channel is not allowed, and its indicator turns red rather than failing
  silently.

## Sensors that lie

Several sensors need a clear view and will simply report nonsense buried in the
hull. The game says so in each part's own description, and it is easy to miss:

- **Mounted outside, with an unobstructed view** — [[part:Altimeter]], [[part:Atmometer]],
  [[part:Windmeter]].
- **Nothing in front of it** — [[part:VelocityMeter]], [[part:TrajectoryCurvatureMeter]],
  [[part:SpaceScanner]].
- **A percentage of clear space around it** — [[part:SpaceGPS]] needs 60%, [[part:Magnetometer]]
  needs 70%. Both have an indicator light that goes green above the threshold
  and red below, so these two at least tell you when they are unhappy.

If an instrument reads zero, or INF, or something that will not move, check
where it is bolted before you check the wiring.

## Where the numbers come from

Port lists, cable ratings and power draws on this page are read out of the
game's own prefabs and shown on every part's page in
[Components](/components). The behaviour described in prose is the game's own
component descriptions, quoted from the same files. If a patch changes a
figure, the component pages change with it and this guide is what goes stale.
