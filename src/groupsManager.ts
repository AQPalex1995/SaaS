import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths';
import { config, type GroupSearch } from './config';
import { log } from './logs';

const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

export function loadGroups(): GroupSearch[] {
  try {
    if (fs.existsSync(GROUPS_FILE)) {
      const raw = fs.readFileSync(GROUPS_FILE, 'utf8');
      const list = JSON.parse(raw) as GroupSearch[];
      if (Array.isArray(list) && list.length > 0) {
        config.groups = list;
        return list;
      }
    }
  } catch (e) {
    log('warn', `Error al leer grupos de ${GROUPS_FILE}: ${e}`);
  }

  // Inicializar archivo con los grupos de config
  saveGroups(config.groups);
  return config.groups;
}

export function saveGroups(groups: GroupSearch[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf8');
    config.groups = groups;
  } catch (e) {
    log('error', `Error al guardar grupos en ${GROUPS_FILE}: ${e}`);
  }
}

export function addGroup(rawUrl: string, customName?: string): { ok: boolean; group?: GroupSearch; msg: string } {
  let url = rawUrl.trim();
  if (!url) return { ok: false, msg: 'Ingresa un enlace válido de grupo de Facebook.' };

  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  const match = url.match(/facebook\.com\/groups\/([\w.-]+)/i);
  if (!match) {
    return { ok: false, msg: 'El enlace debe ser de un grupo de Facebook (ej: https://www.facebook.com/groups/123456/)' };
  }

  const groupId = match[1];
  const cleanUrl = `https://www.facebook.com/groups/${groupId}/`;

  const groups = loadGroups();
  const exists = groups.some((g) => g.url.includes(groupId));
  if (exists) {
    return { ok: false, msg: 'Este grupo ya está en tu lista de monitoreo.' };
  }

  const name = customName?.trim() || `Grupo FB ${groupId}`;
  const newGroup: GroupSearch = { name, url: cleanUrl };
  groups.push(newGroup);
  saveGroups(groups);
  log('ok', `Nuevo grupo agregado: ${name} (${cleanUrl})`);
  return { ok: true, group: newGroup, msg: `Grupo "${name}" agregado con éxito.` };
}

export function removeGroup(identifier: string): { ok: boolean; msg: string } {
  const groups = loadGroups();
  const filtered = groups.filter((g) => !g.url.includes(identifier) && g.name !== identifier);
  if (filtered.length === groups.length) {
    return { ok: false, msg: 'Grupo no encontrado.' };
  }
  saveGroups(filtered);
  log('warn', `Grupo eliminado: ${identifier}`);
  return { ok: true, msg: 'Grupo eliminado correctamente.' };
}

// Inicializar al cargar módulo
loadGroups();
