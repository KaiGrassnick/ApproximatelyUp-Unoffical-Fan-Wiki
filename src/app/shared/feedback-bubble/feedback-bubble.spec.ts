import { TestBed } from '@angular/core/testing';
import { FeedbackBubble } from './feedback-bubble';

describe('FeedbackBubble', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FeedbackBubble] }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(FeedbackBubble);
    await fixture.whenStable();
    return fixture;
  }

  it('starts closed, so it is a bubble and not a panel', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.panel')).toBeFalsy();
    expect(el.querySelector('.trigger')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the three actions', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();

    const labels = Array.from(el.querySelectorAll('.act .lbl')).map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Report an issue', 'Request a feature', 'Add new content']);
    expect(el.querySelector('.trigger')?.getAttribute('aria-expanded')).toBe('true');
  });

  /**
   * Each action opens its own form in .github/ISSUE_TEMPLATE/. A name that
   * does not match a file there drops the reader on the template chooser
   * instead — not broken, but it loses the label and the prefill, and nothing
   * about the link would look wrong.
   */
  it('sends each action to its own issue form', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();

    const templates = Array.from(el.querySelectorAll<HTMLAnchorElement>('.act')).map((a) => {
      const url = new URL(a.href);
      expect(url.pathname).toContain('/issues/new');
      return url.searchParams.get('template');
    });
    expect(templates).toEqual(['bug.yml', 'feature.yml', 'content.yml']);
  });

  /** `page` is a field id on every one of the three forms. */
  it('prefills the page the reader was on', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();

    for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>('.act'))) {
      expect(new URL(a.href).searchParams.get('page')).toBe(location.href);
    }
  });

  it('opens issues in a new tab without handing over the opener', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();

    for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>('.act'))) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
    }
  });

  it('closes on Escape', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.panel')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('.panel')).toBeFalsy();
  });

  it('closes on a click outside itself', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.trigger')!.click();
    await fixture.whenStable();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('.panel')).toBeFalsy();
  });
});
