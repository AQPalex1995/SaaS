# Land Intelligence — CI/CD

> **ESTADO: PLANIFICACIÓN.** No hay pipeline real desplegado. Este documento
> define qué debe validar cualquier pipeline y dibuja el shape de uno futuro
> en GitHub Actions (por el ambiente del repo local, sin push aún).

## Pipeline mínimo (y post-merge) — gate de calidad

Todo pipeline debe ejecutar, en este orden:

1. **Instalar** deps (`npm ci` en `server/`, `npm ci` en la raíz para Scout).
2. **Typecheck** del servidor: `cd server && npm run typecheck`.
3. **Typecheck** de la raíz (Scout legacy): `npx tsc --noEmit` (raíz).
4. **Tests**: `cd server && npx vitest run` (50 tests).
5. **Build**: `cd server && npm run build` (valida `tsconfig.build.json`).
6. **Imagen**: `docker build -f server/Dockerfile .` (valida el Dockerfile).

## Gate de checkpoints (gobernanza)

- El `PROJECT_EXECUTION_PLAN.md` establece que cada tarea DONE exige un **checkpoint** (ver `AGENTS.md` §2.1): tests + typecheck + build + docs actualizados + commit.
- El CI local (manual) cumple ese gate: `npm.cmd run typecheck && npm.cmd test && npm.cmd run build` en `server/`, más typecheck raíz.
- Al crear checkpoints respetar las **Git Safety Rules** (`AGENTS.md` §2.7): revisar `git status`, prohibido `git reset --hard` / `git clean -fd` / `git push --force` salvo autorización explícita, preferir `git revert`.
- **Estado de git**: repositorio inicializado en `main` (commit raíz `dcd6ef3`). Remoto: `origin` → `https://github.com/AQPalex1995/SaaS.git`. Git portable instalado en `D:\SaaS\PortableGit\cmd\git.exe` (NO está en el PATH global); invócalo por ruta completa o agrégalo al PATH por sesión: `$env:Path += ";D:\SaaS\PortableGit\cmd"`.
- `data/` (perfil de navegador, credenciales, cache), `scratch/`, `.env*` y `node_modules/` están en `.gitignore` — **nunca** forzarlos con `git add -f`.

## Shape futuro (GitHub Actions)

```yaml
# .github/workflows/ci.yml (cuando el repo esté en un remoto)
name: CI
on: [push, pull_request]
jobs:
  server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm', cache-dependency-path: server/package-lock.json }
      - run: npm ci && npm run typecheck && npm run build && npx vitest run
        working-directory: server
```

> Nota: los tests corren en `NODE_ENV=test` sin DB (degradación elegante), por
> eso el pipeline no requiere servicios externos.

## Despliegue (GCP, cuando exista)

1. Build + push de la imagen a **Artifact Registry**.
2. **Cloud Run `api`**: variables inyectadas desde **Secret Manager**
   (`DATABASE_URL`, `REDIS_URL`).
3. **Cloud Run `worker`**: misma imagen, `command: node dist/worker.js`,
   `WORKER_QUEUES=scraping,research,...`.
4. Job de bootstrap en CI (una sola vez): `npm run db:setup` contra Cloud SQL.

## Reglas de seguridad

- Jamás `echo` secretos en logs de CI.
- Claves de Service Account solo vía secretos del proveedor CI.
- `.env*` en `.gitignore`; un secret detectado = rotar y squash history.