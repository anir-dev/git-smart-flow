# Checklist de lanzamiento — git-smart-flow
> Última actualización: 2026-05-18. Todo el código está completo (86 tests, 0 errores TS, 0 warnings ESLint).

---

## BLOQUE 1 — GitHub Settings (repo todavía privado)

### 1.1 Entorno npm-publish
- [ ] **Corregir tag pattern** — entrar en `Settings → Environments → npm-publish` → Edit la regla → cambiar `V*` por `v*` (minúscula)
- [ ] **Activar Dependency graph** — `Settings → Advanced Security` → Enable
- [ ] **Activar Dependabot alerts** — misma pantalla → Enable
- [ ] **Activar Dependabot security updates** — misma pantalla → Enable
- [ ] **Activar Grouped security updates** — misma pantalla → Enable
- [ ] **Activar Dependabot version updates** — misma pantalla → Enable

---

## BLOQUE 2 — Hacer el repo público (desbloquea todo lo demás)

- [ ] `Settings → General → Danger Zone → Change visibility → Make public`
  > Esto habilita: Secret scanning, Push protection, Private Vulnerability Reporting y Required reviewers en environments.

---

## BLOQUE 3 — GitHub Settings (solo disponibles con repo público)

- [ ] **Required reviewers en npm-publish** — `Settings → Environments → npm-publish` → Required reviewers → añadir `anir-dev` → Save
- [ ] **Activar Secret scanning** — `Settings → Advanced Security` → Enable
- [ ] **Activar Push protection** (aparece bajo Secret scanning) → Enable
- [ ] **Activar Private Vulnerability Reporting** — `Settings → Advanced Security` → Enable
  > Habilita el botón "Report a vulnerability" que apunta a tu SECURITY.md

---

## BLOQUE 4 — Primer release (en orden estricto)

- [ ] **Crear PR** desde `feat/add-core-settings` → `main`
  ```bash
  gh pr create --title "feat(core): settings, validation, dry-run, release automation" --base main
  ```
- [ ] **Esperar CI verde** — deben pasar: `Lint & Typecheck`, `Test (Node 18/20/22)`, `Security Audit`, `CodeQL`
- [ ] **Mergear PR** con Squash and merge
  > release-please abre automáticamente una Release PR titulada `chore(main): release 0.1.0`
- [ ] **Revisar la Release PR** — comprobar que el CHANGELOG tiene todas las features listadas
- [ ] **Mergear la Release PR** → release-please crea el tag `v0.1.0` automáticamente
- [ ] **Aprobar el deploy** — ir a `Actions` → workflow pausado → "Review deployments" → seleccionar `npm-publish` → Approve and deploy
- [ ] **Verificar publicación en npm**
  ```bash
  npm view git-smart-flow version        # → 0.1.0
  npx git-smart-flow --version           # → 0.1.0
  npm audit signatures                   # → 1 package has a verified attestation
  ```

---

## BLOQUE 5 — Branch protection (después del primer publish)

> Los status checks solo aparecen en la lista de GitHub tras el primer CI en un PR. Hacer esto después del merge.

- [ ] `Settings → Branches → Add branch protection rule`
  - Branch pattern: `main`
  - [x] Require a pull request before merging — Required approvals: 1
  - [x] Require status checks to pass → añadir: `Lint & Typecheck`, `Test (Node 20.x)`, `Security Audit`
  - [x] Require branches to be up to date before merging
  - [x] Require conversation resolution before merging
  - [x] Do not allow bypassing the above settings

---

## BLOQUE 6 — Rotar token npm (después del primer publish)

> Una vez que `git-smart-flow` existe en npm, el token puede restringirse solo a ese paquete.

- [ ] Ir a `npmjs.com → Access Tokens → Generate New Token → Granular`
  - Select packages: **Only select packages and scopes** → seleccionar `git-smart-flow`
  - Permissions: Read and write
- [ ] Actualizar el secret `NPM_TOKEN` en `github.com/anir-dev/git-smart-flow/settings/secrets/actions`
- [ ] Eliminar el token antiguo en npmjs.com

---

## Estado por bloques

| Bloque | Estado |
|--------|--------|
| 1 — GitHub settings (privado) | En progreso |
| 2 — Hacer repo público | Pendiente |
| 3 — GitHub settings (público) | Bloqueado hasta Bloque 2 |
| 4 — Primer release | Pendiente |
| 5 — Branch protection | Bloqueado hasta Bloque 4 |
| 6 — Rotar token npm | Bloqueado hasta Bloque 4 |
| Código (B+C+D) | ✅ Completo |
