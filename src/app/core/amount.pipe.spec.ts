import { AmountPipe, UNLIMITED, amountLabel } from './amount.pipe';
import objectivesJson from '../../../data/objectives.json';
import { Objective } from './models';

const objectives = objectivesJson as unknown as Objective[];

describe('amountLabel', () => {
  it('shows an ordinary count as itself', () => {
    expect(amountLabel(1)).toBe('1');
    expect(amountLabel(1500)).toBe('1500');
  });

  it('shows the game’s unlimited sentinel as ∞', () => {
    expect(amountLabel(UNLIMITED)).toBe('∞');
  });

  /**
   * component-detail sums a reward across every part in a stock pool, so a
   * mission handing out two painters from one pool arrives here as 2000000.
   * Still unlimited, and still not a number anyone is meant to read.
   */
  it('shows a summed pool of unlimited stock as ∞ too', () => {
    expect(amountLabel(UNLIMITED * 2)).toBe('∞');
  });

  it('is applied by the pipe the reward rows use', () => {
    expect(new AmountPipe().transform(UNLIMITED)).toBe('∞');
    expect(new AmountPipe().transform(3)).toBe('3');
  });
});

/**
 * The sentinel is a fact about the game's data, not a threshold this wiki
 * picked. If a patch ever ships a real reward of a million of something, the
 * rule stops being right and this is what says so.
 */
describe('the unlimited sentinel in the real data', () => {
  const rewards = objectives.flatMap((o) => o.reward);

  it('is the largest reward the game hands out', () => {
    expect(Math.max(...rewards.map((r) => r.amount))).toBe(UNLIMITED);
  });

  it('is never approached by an ordinary reward', () => {
    const big = rewards.filter((r) => r.amount >= UNLIMITED);
    expect(big.length).toBeGreaterThan(0);
    // Every one of them is exactly the sentinel, not merely a large number.
    expect(big.every((r) => r.amount === UNLIMITED)).toBe(true);
    // And every one of them is a painter, which is what "unlimited" means here.
    expect(big.every((r) => r.component.startsWith('InventoryTool_Painter'))).toBe(true);
  });

  it('never appears as something an objective asks you to hand in', () => {
    const required = objectives.flatMap((o) => o.requires_components);
    expect(required.some((r) => r.amount >= UNLIMITED)).toBe(false);
  });
});
