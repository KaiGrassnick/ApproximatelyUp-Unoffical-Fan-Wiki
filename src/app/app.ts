import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { WorldDrop } from './shared/world-drop/world-drop';
import { RevealMenu } from './shared/reveal-menu/reveal-menu';
import { SiteFooter } from './shared/site-footer/site-footer';
import { FeedbackBubble } from './shared/feedback-bubble/feedback-bubble';
import { LimitedView } from './shared/limited-view/limited-view';
import { DataService } from './core/data.service';
import { SeoService } from './core/seo.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    WorldDrop,
    RevealMenu,
    SiteFooter,
    FeedbackBubble,
    LimitedView,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly data = inject(DataService);
  /**
   * Injected for its side effect and never read: SeoService only starts
   * tracking navigations once something has instantiated it, and the shell is
   * the one component guaranteed to exist on every route.
   */
  private readonly seo = inject(SeoService);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('shellNav');
  // Captured here rather than inside afterNextRender: that callback runs
  // outside the injection context.
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Publishes the header's height as `--header-h`.
   *
   * The header is sticky, so anything else that sticks has to start below it —
   * and its height is not a constant: it wraps to a second line when the nav,
   * the game's links and the world drop stop fitting side by side, which
   * happens at a width that depends on the text. A guessed offset is therefore
   * wrong on some screens and right on others, which is how the guides list
   * ended up sliding under the header.
   */
  constructor() {
    afterNextRender(() => {
      const el = this.nav().nativeElement;
      const publish = () =>
        document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);

      publish();
      // jsdom has no ResizeObserver. The one-off measurement above is enough
      // there, and in any browser that somehow lacks it the value is merely
      // stale rather than absent.
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(publish);
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
