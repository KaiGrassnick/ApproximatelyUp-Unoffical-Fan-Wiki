---
title: How parts unlock
summary: Stock pools, why one reward unlocks dozens of shapes, and why a window needs two.
spoiler: none
updated: 2026-09-07
order: 20
---

The wiki decides what you can build by the same rules the game does. Those
rules are not complicated, but they are not obvious either, and they explain
two things that surprise people: why a single mission reward suddenly unlocks
dozens of parts, and why a part you clearly own still refuses to be placed.

## Parts do not unlock. Pools fill.

A component is not a thing you own individually. It is a shape cut from a
**stock pool** — a quantity of material shared by every part made of it.

Every frame shape draws on the same `Frame` pool. Every glass pane draws on
`Glass`, every pipe on `Pipe`, and so on. So a reward of _Frame Full ×630_ does
not unlock one frame. It fills the frame pool, and **every frame shape in the
game becomes placeable at once**.

This is why progress here moves in jumps. You do not collect parts one at a
time; you unlock a material and inherit its whole catalogue.

## A part is placeable when _every_ pool it needs is non-empty

Most parts spend one pool. Some spend two, and those are the ones that catch
people out.

**Windows** are the clearest case. A window is a frame _and_ a pane, so it
draws on both pools. Have frames but no glass and every window stays
unplaceable — even though the frame pool is full and the part is plainly in
your list. Twenty parts work this way.

**Frame pieces with a pipe running through them** are the other case. There are
exactly two — the quarter frame with a pipe, and its nanoframe twin — and each
spends pipe stock as well as frame stock. With no pipes unlocked, neither can
be placed, however many frames you have.

The rule the wiki applies is simply: a part is placeable when _all_ of the
pools it draws on have something in them. Not most. All.

## Where the stock comes from

Two sources, and the wiki counts both:

- **Base stock.** Some parts start with an amount available, which is what
  makes the opening of the game buildable at all.
- **Mission rewards.** Completing an objective adds its rewards to the
  corresponding pools.

Only whether a pool is _non-empty_ decides placeability. The amounts matter
when you are building, but not to the question of whether a part is available
to you at all — which is the question this wiki answers.

## "Unlocked by" on a component page

When a part is not yet available, the wiki names the objective whose reward
would fill the pool it needs, along with where that objective starts. That is
the shortest honest answer to "how do I get this?" — it points at the next
thing that would change the situation, rather than at a whole dependency tree.

If you have not loaded a save, this is computed for a new game. Load one and it
becomes specific to your run: see
[Reading this wiki without spoiling your game](/guides/reading-this-wiki).

## Why the wiki's numbers can be trusted here

This logic is not a description of the game written from memory. It is
extracted from the game's own files, and it exists twice: once in the
extraction pipeline, and once in your browser, so it can be recomputed against
your save. Those two implementations are checked against each other by a test
that freezes a real save's result and asserts they still agree. If they ever
drift apart, the build fails rather than the wiki quietly telling you something
false.
