import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { issueUrl } from '../../core/issue-url';

/** One of the three ways in, and the issue form it opens. */
interface Action {
  key: string;
  label: string;
  hint: string;
  /**
   * A file in .github/ISSUE_TEMPLATE/. The form carries its own label and its
   * own required fields, so neither is repeated here — one place decides what
   * a bug report asks for, and it is the same place whether the reader arrives
   * through this bubble or through the repository.
   */
  template: string;
}

const ACTIONS: Action[] = [
  {
    key: 'bug',
    label: 'Report an issue',
    hint: 'A wrong number, a broken page',
    template: 'bug.yml',
  },
  {
    key: 'feature',
    label: 'Request a feature',
    hint: 'Something the wiki should do',
    template: 'feature.yml',
  },
  {
    key: 'content',
    label: 'Add new content',
    hint: 'A guide or explanation you want to read',
    template: 'content.yml',
  },
];

/**
 * A way to say something is wrong, from the page where it is wrong.
 *
 * The wiki's numbers come out of the game's own files, so when one of them is
 * off it is a decoding bug rather than a typo — and the reader looking at it
 * is the only person who will ever notice. Making them find the repository,
 * work out which of three things they want, and describe which page they were
 * on loses most of those reports.
 *
 * So each action opens GitHub's new-issue form with the label set and the page
 * already named in the body. The reader still needs an account; that is the
 * cost of not running a server that accepts writes, and it is the right trade
 * for a site whose whole privacy story is that it has no such server.
 */
@Component({
  selector: 'feedback-bubble',
  templateUrl: './feedback-bubble.html',
  styleUrl: './feedback-bubble.scss',
})
export class FeedbackBubble {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly actions = ACTIONS;
  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  /**
   * Written as a plain href rather than a click handler: it has to stay a real
   * link, so it can be middle-clicked, copied, and read by anything that
   * inspects where a control leads before following it.
   */
  href(a: Action): string {
    return issueUrl(a.template);
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
