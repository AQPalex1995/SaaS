/**
 * Clasificación de enlaces de publicaciones (Scout Legacy).
 *
 * Distingue un enlace REAL a la publicación (permalink) de los enlaces
 * sintéticos que se generan cuando Facebook no expone el permalink
 * (búsqueda interna del grupo o raíz del grupo). Se usa para etiquetar y
 * no disfrazar una búsqueda como si fuera la publicación.
 */

export type LinkStatus = 'permalink' | 'search' | 'group_root' | 'direct' | '';

const GROUP_POST_RE = /\/groups\/[^/?#]+\/(?:posts|permalink|multi_permalink)\/\d+/;
const SHARE_P_RE = /facebook\.com\/share\/[a-z]\/[A-Za-z0-9]+/;

/** ¿La URL apunta directamente a una publicación? */
export function isCanonicalPermalink(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    GROUP_POST_RE.test(url) ||
    /[?&]multi_permalinks=\d+/.test(url) ||
    /[?&]set=gm\.\d+/.test(url) ||
    SHARE_P_RE.test(url)
  );
}

/** Etiqueta el estado del enlace de una fila para la UI/CSV. */
export function classifyPublicationUrl(url: string | null | undefined): LinkStatus {
  if (!url || url === '#') return '';
  if (isCanonicalPermalink(url)) return 'permalink';
  if (url.includes('/search/?q=')) return 'search';
  if (url.includes('/groups/')) return 'group_root';
  return 'direct';
}
