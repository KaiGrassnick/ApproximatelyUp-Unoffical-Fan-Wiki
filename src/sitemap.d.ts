/**
 * public/sitemap.xml, imported as text by prerender-pages.spec.ts.
 *
 * The `.xml: text` loader in angular.json makes esbuild hand the file over as
 * a string; this is the half that tells TypeScript the same thing.
 */
declare module '*.xml' {
  const content: string;
  export default content;
}
