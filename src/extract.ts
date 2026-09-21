import type { Page } from 'playwright';

export interface CardRaw {
  key: string;
  href: string;
  text: string;
  label: string;
  imageUrl?: string;
  rawTitle?: string;
  rawPrice?: string;
  rawLocation?: string;
}

export async function readMarketplaceCards(page: Page): Promise<CardRaw[]> {
  return page.evaluate(() => {
    const out: CardRaw[] = [];
    const seen = new Set<string>();
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/marketplace\/item\/(\d+)/);
      if (!m) continue;
      if (seen.has(m[1])) continue;
      seen.add(m[1]);

      const container: HTMLElement | null =
        (a.closest('[data-testid*="marketplace_search_feed_result"]') as HTMLElement | null) ??
        (a.closest('[data-testid*="rs-result"]') as HTMLElement | null) ??
        (a.closest('[role="article"]') as HTMLElement | null);

      const text = ((container ?? a).innerText || '').replace(/\s+/g, ' ').trim();
      const label = (a.getAttribute('aria-label') || '').trim();
      const abs = href.startsWith('http') ? href : 'https://www.facebook.com' + href;

      // Extraer imagen de portada
      let imageUrl = '';
      const img = (container ?? a).querySelector<HTMLImageElement>('img[src^="http"]');
      if (img && img.src && !img.src.includes('data:')) {
        imageUrl = img.src;
      }

      let rawTitle = '';
      let rawPrice = '';
      let rawLocation = '';

      const target = label || text;
      if (target) {
        const clean = target.replace(/,\s*publicaci[oó]n\s*\d+/i, '').trim();
        const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 3) {
          const last = parts[parts.length - 1];
          const prev = parts[parts.length - 2];
          if (/AR$|Arequipa/i.test(last) || /S\/|\$|Gratis/i.test(prev)) {
            rawLocation = last;
            rawPrice = prev;
            rawTitle = parts.slice(0, parts.length - 2).join(', ');
          } else {
            rawTitle = parts[0];
          }
        } else if (parts.length === 2) {
          rawTitle = parts[0];
          if (/AR$|Arequipa/i.test(parts[1])) {
            rawLocation = parts[1];
          } else {
            rawPrice = parts[1];
          }
        } else {
          rawTitle = clean;
        }
      }

      out.push({
        key: String(m[1]),
        href: abs,
        text,
        label,
        imageUrl,
        rawTitle,
        rawPrice,
        rawLocation,
      });
    }
    return out;
  });
}

export async function readGroupCards(page: Page, groupId: string): Promise<CardRaw[]> {
  return page.evaluate(
    ({ gid }) => {
      // ─── helpers (usar objeto para evitar que esbuild inyecte __name en el contexto del navegador) ───
      const helpers = {
        mkAbs(href: string): string {
          if (!href) return '';
          return /^https?:/i.test(href) ? href : 'https://www.facebook.com/' + href.replace(/^\/+/, '');
        },

        /**
         * Extraer permalink real de cualquier URL de Facebook con publicación de grupo.
         * Patrones soportados (en orden de fiabilidad):
         *  1. /groups/{id}/posts/{pid}            — permalink canónico
         *  2. /groups/{id}/permalink/{pid}
         *  3. /groups/{id}/multi_permalink/{pid}
         *  4. ?story_fbid={pid}
         *  5. ?multi_permalinks={pid}             — param en link de "Ver más"
         *  6. /photo?set=gm.{POST_ID}             — foto de grupo (set=gm.POST_ID)
         */
        parsePostLink(raw: string): { postId: string; cleanUrl: string } | null {
          if (!raw || raw === '#') return null;
          let ch = raw;
          if (!/^https?:/i.test(ch)) ch = 'https://www.facebook.com/' + ch.replace(/^\/+/, '');
          let u: URL;
          try { u = new URL(ch); } catch { return null; }

          // 1-3. /groups/{id}/posts|permalink|multi_permalink/ID
          const pathM = u.pathname.match(
            /\/groups\/([^/]+)\/(?:posts|permalink|multi_permalink)\/(\d+|[\w.-]+)/
          );
          if (pathM) {
            const pid = pathM[2];
            return { postId: pid, cleanUrl: `https://www.facebook.com/groups/${pathM[1]}/posts/${pid}` };
          }

          // 4. ?story_fbid=POST_ID
          if (u.searchParams.has('story_fbid')) {
            const pid = u.searchParams.get('story_fbid') || '';
            if (pid && /^\d+$/.test(pid)) {
              return { postId: pid, cleanUrl: `https://www.facebook.com/groups/${gid}/posts/${pid}` };
            }
          }

          // 5. ?multi_permalinks=POST_ID
          if (u.searchParams.has('multi_permalinks')) {
            const pid = u.searchParams.get('multi_permalinks') || '';
            if (pid && /^\d+$/.test(pid)) {
              return { postId: pid, cleanUrl: `https://www.facebook.com/groups/${gid}/posts/${pid}` };
            }
          }

          // 6. /photo?fbid=…&set=gm.POST_ID o set=g.GROUP_ID
          if (u.pathname === '/photo' || u.pathname === '/photo.php') {
            const set = u.searchParams.get('set') || '';
            const gmMatch = set.match(/^gm\.(\d+)/);
            if (gmMatch) {
              const pid = gmMatch[1];
              return { postId: pid, cleanUrl: `https://www.facebook.com/groups/${gid}/posts/${pid}` };
            }
          }

          return null;
        },

        /**
         * Obtener el id de la publicación desde los atributos `data-ft` de
         * Facebook. El feed de grupos deja de exponer el anchor con el
         * permalink, pero casi siempre conserva `data-ft` con
         * `top_level_post_id` / `story_fbid` / `mf_story_key`, que sí es el id
         * real del post. Se prioriza `top_level_post_id`.
         */
        postIdFromDataFt(root: HTMLElement): string | null {
          const els: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-ft]'))];
          let fallback = '';
          for (const el of els) {
            const raw = el.getAttribute('data-ft');
            if (!raw) continue;
            let obj: Record<string, unknown>;
            try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
            const top = obj.top_level_post_id;
            if (top != null && /^\d+$/.test(String(top))) return String(top);
            for (const k of ['mf_story_key', 'story_fbid', 'post_id']) {
              const v = obj[k];
              if (!fallback && v != null && /^\d+$/.test(String(v))) fallback = String(v);
            }
          }
          return fallback || null;
        },

        /**
         * Obtener el id real del post desde JSON embebido en el HTML del
         * artículo (los feeds nuevos de Facebook ya casi no exponen `data-ft`,
         * pero sí mantienen `"story_fbid"`, `"top_level_post_id"`, `"stableID"`
         * o enlaces `fb://post/{id}` dentro del markup del story).
         */
        postIdFromInline(root: HTMLElement): string | null {
          const html = root.outerHTML || root.innerHTML || '';
          if (html.length > 100_000) return null;
          const mJson = html.match(/(?:story_fbid|top_level_post_id|stableID)["'\s]*[:=]["'\s]*"?(\d{10,})/);
          if (mJson) return mJson[1];
          const mFb = html.match(/fb:(?:\/\/|\/?)\/?post\/(\d{10,})/);
          if (mFb) return mFb[1];
          return null;
        },

        /** Id real del post por cualquier señal disponible (data-ft, JSON, …). */
        postIdFromArticle(root: HTMLElement): string | null {
          return this.postIdFromDataFt(root) || this.postIdFromInline(root);
        },
      };

      // ─── extracción principal por contenedores de feed ─────────────────────
      const out: CardRaw[] = [];
      const seen = new Set<string>();

      // En Facebook moderno, las publicaciones son hijos directos de [role="feed"]
      const candidateElements: HTMLElement[] = [];
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        for (const child of Array.from(feed.children) as HTMLElement[]) {
          candidateElements.push(child);
        }
      }
      const articles = Array.from(
        document.querySelectorAll<HTMLElement>(
          'div[role="article"], div[data-ad-preview="message"], div[aria-describedby]'
        )
      );
      for (const art of articles) {
        if (!candidateElements.includes(art)) {
          candidateElements.push(art);
        }
      }

      for (const article of candidateElements) {
        const rawTxt = (article.innerText || '').replace(/\s+/g, ' ').trim();
        if (rawTxt.length < 20) continue;
        // Omitir barras de filtro / encabezado
        if (/ordenar feed del grupo/i.test(rawTxt) && rawTxt.length < 120) continue;

        let imgAltText = '';
        let imageUrl = '';
        for (const img of Array.from(article.querySelectorAll<HTMLImageElement>('img'))) {
          if (img.alt && img.alt.length > 10 && !img.alt.includes('may be an image of')) {
            imgAltText += ' ' + img.alt;
          }
          if (!imageUrl && img.src && img.src.startsWith('http') && !img.src.includes('static') && !img.src.includes('rsrc')) {
            imageUrl = img.src;
          }
        }
        const fullText = (rawTxt + ' ' + imgAltText).replace(/\s+/g, ' ').trim();

        // Buscar el mejor permalink disponible dentro del contenedor
        const cands: Array<{ postId: string; cleanUrl: string; score: number }> = [];

        for (const a of Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
          const raw = (a.getAttribute('href') || '').trim();
          const parsed = helpers.parsePostLink(raw);
          if (!parsed) continue;

          let score = 0;
          const cu = parsed.cleanUrl;
          // Mismo grupo = +4
          if (raw.includes(`groups/${gid}`) || cu.includes(`groups/${gid}`)) score += 4;
          // Link de timestamp (anchor contiene <time> o texto relativo de tiempo) = +3
          if (a.querySelector('time') ||
              /\b(\d+\s*(min|seg|hora?s?|d[ií]as?|sem|semanas?|mes|meses|año|h\b|s\b))/i.test(a.innerText || '')) score += 3;
          // Ya tiene /posts/ en raw = +2
          if (/\/groups\/[^/]+\/posts\//.test(raw)) score += 2;
          // Vino de photo con set=gm = +1
          if (/set=gm\./.test(raw)) score += 1;
          // Tiene comment_id → es un comentario, no el post = -3
          if (raw.includes('comment_id=')) score -= 3;
          // Es la raíz del grupo = descartar
          try {
            if (/\/groups\/[^/?#]+\/?$/.test(new URL(cu).pathname)) continue;
          } catch { continue; }

          cands.push({ ...parsed, score });
        }

        cands.sort((a, b) => b.score - a.score);
        const best = cands[0] ?? null;

        // id real desde data-ft / JSON embebido (funciona aunque el feed no exponga el anchor)
        const realPid = helpers.postIdFromArticle(article);

        let postId: string;
        let finalHref: string;

        if (best && (best.score >= 0 || !realPid)) {
          postId = best.postId;
          finalHref = best.cleanUrl;
        } else if (realPid) {
          // Anchor no utilizable (o solo de comentario), pero el artículo conserva el id real.
          postId = realPid;
          finalHref = `https://www.facebook.com/groups/${gid}/posts/${realPid}`;
        } else if (best) {
          postId = best.postId;
          finalHref = best.cleanUrl;
        } else {
          // Sin permalink directo: generar búsqueda interna en el grupo como destino.
          // Firma ESTABLE (texto normalizado + longitud + imagen completa) para
          // que republicaciones con el mismo texto/imagen colisionen de forma
          // determinista y publicaciones distintas no compartan clave.
          const sigText = fullText.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 400);
          const signature = `${sigText}|${fullText.length}|${imageUrl || ''}`;
          let hash = 0;
          for (let i = 0; i < signature.length; i++) { hash = (hash << 5) - hash + signature.charCodeAt(i); hash |= 0; }
          postId = 'p_' + Math.abs(hash).toString(36);

          const queryWords = fullText
            .slice(0, 100)
            .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
            .replace(/\b(publicaci[oó]n|facebook|precio|venta|vendo|remato|ocasi[oó]n|gratis|d[oó]lares|soles|informes|whatsapp|inmobiliaria)\b/gi, ' ')
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 3)
            .slice(0, 4)
            .join(' ');

          finalHref = queryWords
            ? `https://www.facebook.com/groups/${gid}/search/?q=${encodeURIComponent(queryWords)}`
            : `https://www.facebook.com/groups/${gid}`;
        }

        const key = `${gid}_${postId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          key,
          href: finalHref,
          text: fullText,
          label: fullText.slice(0, 140),
          imageUrl,
          rawTitle: fullText.slice(0, 100),
        });
      }

      // ─── fallback global: buscar por enlaces si no hubo artículos ───────────
      if (out.length === 0) {
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
          const raw = a.getAttribute('href') || '';
          let postId = '';
          let cleanUrl = '';

          const m1 = raw.match(/\/groups\/[^\/]+\/(?:posts|permalink|multi_permalink)\/(([\w%.-]+))/);
          if (m1) { postId = m1[1]; cleanUrl = helpers.mkAbs(raw); }

          if (!postId) { const m2 = raw.match(/story_fbid=([\w%.-]+)/); if (m2) { postId = m2[1]; cleanUrl = `https://www.facebook.com/groups/${gid}/posts/${postId}`; } }
          if (!postId) { const m3 = raw.match(/[?&]multi_permalinks=([\w%.-]+)/); if (m3) { postId = m3[1]; cleanUrl = `https://www.facebook.com/groups/${gid}/posts/${postId}`; } }
          if (!postId) { const m4 = raw.match(/set=gm\.(\d+)/); if (m4) { postId = m4[1]; cleanUrl = `https://www.facebook.com/groups/${gid}/posts/${postId}`; } }

          if (!postId) continue;
          const key = `${gid}_${postId}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const container = (a.closest('[role="article"]') as HTMLElement | null) ?? (a.parentElement as HTMLElement | null);
          const text = ((container ?? a).innerText || '').replace(/\s+/g, ' ').trim();
          let imageUrl = '';
          const img = (container ?? a)?.querySelector<HTMLImageElement>('img[src^="http"]');
          if (img && img.src && !img.src.includes('data:')) imageUrl = img.src;

          if (text.length >= 10) {
            out.push({
              key,
              href: cleanUrl,
              text,
              label: (a.getAttribute('aria-label') || '').trim() || text.slice(0, 140),
              imageUrl,
              rawTitle: text.slice(0, 100),
            });
          }
        }
      }

      return out;
    },
    { gid: groupId }
  );
}
