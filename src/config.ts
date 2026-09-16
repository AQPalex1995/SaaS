export interface GroupSearch {
  name: string;
  url: string;
}

export interface AppConfig {
  panelPort: number;
  searchIntervalMinutes: number;
  marketplaceBaseUrl: string;
  geo: { latitude: number; longitude: number; radius: number };
  marketplaceQueries: string[];
  groupQueries: string[];
  groups: GroupSearch[];
  maxScrolls: number;
  capPerSearch: number;
  delayMinSec: number;
  delayMaxSec: number;
  headless: boolean;
  firstRunDelaySec: number;
}

export const config: AppConfig = {
  panelPort: 8787,
  searchIntervalMinutes: 60,
  marketplaceBaseUrl: 'https://www.facebook.com/marketplace/arequipa/search/?exact=false',
  geo: { latitude: -16.398764, longitude: -71.535003, radius: 50 },
  marketplaceQueries: [
    'terrenos',
    'terreno en venta',
    'lote',
    'lotes en venta',
    'casa campo',
    'casa en venta',
    'terreno agricola',
    'chacra',
    'parcela',
    'terreno paucarpata',
    'terreno cayma',
    'terreno sachaca',
    'terreno yura',
    'terreno cerro colorado',
    'terreno la joya',
    'casa con terreno',
  ],
  groupQueries: ['terrenos', 'lote', 'casa campo', 'casa en venta'],
  groups: [
    { name: 'Compra y Venta Terrenos Arequipa', url: 'https://www.facebook.com/groups/898903077352539' },
    { name: 'Lotes y Terrenos Arequipa', url: 'https://www.facebook.com/groups/957114593294351' },
    { name: 'Venta de Terrenos Arequipa', url: 'https://www.facebook.com/groups/1624091374517876' },
    { name: 'Terrenos Agricolas Arequipa', url: 'https://www.facebook.com/groups/698109529660849' },
    { name: 'Compra Venta Inmuebles Arequipa', url: 'https://www.facebook.com/groups/440710938703517' },
    { name: 'Compra y Venta en Arequipa', url: 'https://www.facebook.com/groups/244653459431346' },
    { name: 'Terrenos y Lotes en Venta', url: 'https://www.facebook.com/groups/648889315758138' },
    { name: 'Casas en Venta Arequipa', url: 'https://www.facebook.com/groups/casasenventaenarequipa/' },
  ],
  maxScrolls: 4,
  capPerSearch: 60,
  delayMinSec: 3,
  delayMaxSec: 6,
  headless: true,
  firstRunDelaySec: 45,
};

export function isPlaceholderGroup(g: GroupSearch): boolean {
  return /REEMPLAZAR/.test(g.url);
}

export function totalSearches(): number {
  const qg = config.marketplaceQueries.filter((q) => q.trim()).length;
  const gg = config.groups.filter((g) => !isPlaceholderGroup(g)).length;
  return qg + gg;
}