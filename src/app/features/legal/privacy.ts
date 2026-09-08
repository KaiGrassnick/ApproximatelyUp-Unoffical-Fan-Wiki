import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The privacy policy, in German and English at once — see Imprint for why.
 *
 * Most of it is the unusual part: this wiki has no server-side processing at
 * all, so the policy's job is less to disclose what happens to a reader's data
 * than to make credible that almost nothing does. The save file never leaves
 * the browser, and the three localStorage entries are named and explained
 * individually rather than waved at, because "we store some preferences" is
 * exactly the sentence a reader has no reason to believe.
 */
@Component({
  selector: 'legal-privacy',
  imports: [RouterLink],
  templateUrl: './privacy.html',
  styleUrl: './legal.scss',
})
export class Privacy {}
