import { Component } from '@angular/core';

/**
 * The site's Impressum, in German and English at once.
 *
 * Germany requires this page and requires it to be easy to find, which is why
 * the footer links it from every route. It is written in both languages side
 * by side rather than in one: the German column is the authoritative text and
 * comes first in source order, the English one is there because the wiki's
 * readers are not mostly German.
 */
@Component({
  selector: 'legal-imprint',
  templateUrl: './imprint.html',
  styleUrl: './legal.scss',
})
export class Imprint {}
