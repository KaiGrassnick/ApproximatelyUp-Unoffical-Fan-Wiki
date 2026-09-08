import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The footer, which exists because German law wants the imprint reachable
 * from every page — "leicht erkennbar und unmittelbar erreichbar" is the
 * standard, and a link in the footer of every route is how that is met.
 *
 * It carries the fan-project disclaimer too. The header says "Unofficial Fan
 * Wiki" in small type under the brand; a reader who arrives on a deep link
 * from a search engine may never look at it, and the one place they will look
 * when asking "who is this?" is the bottom of the page.
 */
@Component({
  selector: 'site-footer',
  imports: [RouterLink],
  template: `
    <footer class="shell-footer">
      <p class="disclaimer">
        An unofficial fan project. Not affiliated with or endorsed by the developers of
        <em>Approximately Up</em>; all game content belongs to its respective owners.
      </p>
      <nav aria-label="Legal and project links">
        <a routerLink="/imprint">Imprint</a>
        <a routerLink="/privacy">Privacy</a>
        <a
          href="https://github.com/KaiGrassnick/ApproximatelyUp-Unoffical-Fan-Wiki"
          target="_blank"
          rel="noopener noreferrer"
          >Source on GitHub</a
        >
      </nav>
    </footer>
  `,
  styles: [
    `
      @use 'styles/hud' as *;

      .shell-footer {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1.25rem 1.5rem 2.5rem;
        border-top: 1px solid var(--line);
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 2rem;
        align-items: baseline;
        justify-content: space-between;
      }

      .disclaimer {
        margin: 0;
        max-width: 46rem;
        font-size: 0.8rem;
        line-height: 1.55;
        color: var(--text-faint);
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 1.25rem;
      }

      nav a {
        @include label;
        text-decoration: none;
        white-space: nowrap;
        &:hover {
          color: var(--accent);
        }
      }
    `,
  ],
})
export class SiteFooter {}
