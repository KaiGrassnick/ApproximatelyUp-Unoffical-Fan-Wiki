import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

/**
 * A page that says the address was wrong.
 *
 * The wildcard route used to redirect to the home page, which turned every
 * typo and every stale link into a silent trip to the front door — the reader
 * cannot tell whether the page moved, the id was wrong, or the wiki simply
 * does not cover it. Saying so costs one screen and answers the question.
 *
 * The status is now an honest 404. Every real page is prerendered to a file of
 * its own, so nginx can answer =404 for anything that is not one and serve the
 * app shell as the error body -- which boots and lands here. Before that, an
 * unknown address had to answer 200 with index.html, because that fallback was
 * the only thing making /components/FrameA work at all.
 *
 * The noindex stays regardless. It cost nothing when the status was a lie and
 * costs nothing now, and it is the belt to the 404's braces for any crawler
 * that reaches this page by a route that answered 200 anyway. The 'follow'
 * half is deliberate: this page links to every section of the wiki.
 */
@Component({
  selector: 'not-found',
  imports: [RouterLink],
  template: `
    <section class="nf">
      <p class="code">404</p>
      <h1>No such page</h1>
      <p class="lead">
        Nothing lives at this address. It may have been a typo, or a link to something this wiki
        does not cover.
      </p>
      <nav class="ways">
        <a routerLink="/">Home</a>
        <a routerLink="/components">Components</a>
        <a routerLink="/planets">Planets</a>
        <a routerLink="/stations">Stations</a>
        <a routerLink="/missions">Missions</a>
      </nav>
    </section>
  `,
  styles: [
    `
      @use 'styles/hud' as *;
      .nf {
        max-width: 40rem;
        margin: 4rem auto;
        text-align: center;
      }
      .code {
        @include label;
        font-size: 3rem;
        letter-spacing: 0.2em;
        // --text-faint, not --accent-dim. That token is a 15%-alpha cyan meant
        // for a fill or a border -- every other use of it is one -- and as a
        // text colour it composited to 1.29:1 against the page, which is a
        // numeral you cannot read rather than a quiet one.
        color: var(--text-faint);
        margin: 0;
      }
      h1 {
        margin: 0.5rem 0 1rem;
      }
      .lead {
        color: var(--text-dim);
        line-height: 1.6;
        margin: 0 0 2rem;
      }
      .ways {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: center;
      }
      .ways a {
        @include label;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 0.4rem 0.8rem;
        text-decoration: none;
        color: var(--text-dim);
        &:hover {
          border-color: var(--line-hi);
          color: var(--accent);
        }
      }
    `,
  ],
})
export class NotFound {
  constructor() {
    inject(SeoService).describe({ noindex: true });
  }
}
