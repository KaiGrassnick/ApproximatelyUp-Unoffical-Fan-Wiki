/** The wiki's own repository. Everything that links to it goes through here. */
export const REPO = 'https://github.com/KaiGrassnick/ApproximatelyUp-Unoffical-Wiki';

/**
 * A link to one of the issue forms in .github/ISSUE_TEMPLATE/, with the page
 * the reader is on filled in.
 *
 * `page` is the id of a field on every form, which is how GitHub prefills an
 * issue form from the query string. Built at call time rather than up front so
 * it names the page the reader is actually on — the router changes it under us.
 */
export function issueUrl(template: string): string {
  const params = new URLSearchParams({ template });
  if (typeof location !== 'undefined') params.set('page', location.href);
  return `${REPO}/issues/new?${params.toString()}`;
}
