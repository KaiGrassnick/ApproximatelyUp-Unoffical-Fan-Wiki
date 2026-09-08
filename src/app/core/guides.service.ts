import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RevealKind } from './spoiler.service';
import { dataUrl } from './data-url';

/** One guide, as scripts/gen-guides.mjs writes it into data/guides.json. */
export interface Guide {
  id: string;
  title: string;
  summary: string;
  /**
   * What the guide warns it gives away, or 'none'. A note, not a gate — see
   * the class comment.
   */
  spoiler: RevealKind | 'none';
  updated: string;
}

/**
 * The hand-written half of the wiki.
 *
 * Everything else here is generated from the game's files and is therefore
 * about numbers. Guides are prose someone sat down and wrote, compiled from
 * content/guides/*.md at build time so a contributor needs Markdown rather
 * than Angular, and so no reader downloads a parser to read them.
 *
 * The index is one small file fetched up front, because the list is the whole
 * left-hand column. Bodies are fetched one at a time, by the page that shows
 * them.
 *
 * Nothing here is hidden. The rest of the wiki reasons from a new game and
 * waits for a switch, because a components list that shows everything spoils
 * the game to anyone who glances at it. A guide does not work that way: you
 * reach one by choosing its title off a list that says what it gives away, so
 * the choice a reveal switch exists to ask for has already been made by the
 * time the body loads. The `spoiler` field stays, as that note.
 */
@Injectable({ providedIn: 'root' })
export class GuidesService {
  private readonly res = httpResource<Guide[]>(() => dataUrl('guides.json'));

  readonly all = computed(() => this.res.value() ?? []);
  readonly loading = computed(() => this.res.isLoading());

  readonly byId = computed(() => new Map(this.all().map((g) => [g.id, g])));
}
