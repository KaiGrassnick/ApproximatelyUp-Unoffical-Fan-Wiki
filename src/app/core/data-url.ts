import { DATA_MANIFEST } from './data-manifest';

/**
 * A URL under data/ carrying its file's content hash, so nginx can serve it
 * immutable -- see the $data_cache_control map in docker/nginx.conf.
 *
 * A path the manifest has never heard of still yields a working URL, just an
 * unversioned one. That matters for ids that come from the data rather than
 * from the build: a save can name a body this build has never rendered, the
 * same tolerance world.service.ts documents.
 */
export function dataUrl(path: string): string {
  const v = DATA_MANIFEST[path];
  return v ? `data/${path}?v=${v}` : `data/${path}`;
}
