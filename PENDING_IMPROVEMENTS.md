# Mejoras Pendientes — git-smart-flow

Análisis comparativo con [GitHub CLI](https://cli.github.com/manual/examples) e identificación de gaps en operaciones diarias de Git: commit, push, pull/sync, branches, PR, merge y resolución de conflictos.

---

## Comparativa rápida: lo que gsf ya cubre mejor que `gh`

| Operación | git-smart-flow | GitHub CLI |
|---|---|---|
| Commit interactivo con IA | ✅ AI-powered, file selector, convention, security scan | ❌ No tiene |
| Push guiado con preview | ✅ UI Ink, protected branch, dry-run | ❌ No tiene |
| Sync/Pull con estrategias | ✅ Múltiples estrategias, ahead/behind visual, guía de conflictos | ❌ No tiene |
| Branch wizard | ✅ Tipo, ticket, descripción → slug, base, validación | ❌ No tiene |
| Revert wizard | ✅ 10 operaciones de undo/revert guiadas | ❌ No tiene |
| Merge conflict guide | ✅ Guía interactiva, theirs/ours automático | ❌ No tiene |
| PR description con IA | ✅ Genera título + body con múltiples proveedores | Solo `--fill` básico |

**Conclusión:** gsf supera a `gh` en flujos locales interactivos. El gap principal está en la integración con la API de GitHub para el ciclo de vida de los PRs.

---

## MEJORAS DE ALTA PRIORIDAD

### 1. Integración con GitHub API — Requisito base

**Gap:** gsf no tiene integración con la API de GitHub. Todas las operaciones de PR son locales (generación de texto).

**Propuesta:** Usar `gh` CLI como backend para las llamadas a GitHub. No reinventar la rueda — detectar si `gh` está disponible y autenticado, y usarlo como dependencia opcional que habilita funcionalidades avanzadas.

**Cambios necesarios:**
- Añadir `detectGhCli()` en `src/git/repo.ts` — verificar si `gh auth status` pasa
- Añadir check en `src/commands/doctor.ts` con estado de `gh` CLI
- Añadir flag de config `git.githubIntegration: true/false` en `src/config/config.ts`
- En cualquier comando que requiera GitHub API, mostrar mensaje si `gh` no está disponible:
  ```
  ⚠️  Esta funcionalidad requiere GitHub CLI (gh) autenticado.
      Instala gh: https://cli.github.com
      Luego ejecuta: gh auth login
  ```

**UX:** Seguir el mismo patrón que con los providers de IA — funcionalidades degradadas pero nunca errores silenciosos.

---

### 2. PR — Crear PR real en GitHub

**Gap:** `gsf pr` genera el texto del PR pero el usuario tiene que copiar manualmente y abrir GitHub en el navegador.

**Propuesta:** Añadir acción "Crear en GitHub" al menú de acciones del proposal en `src/commands/pr.ts`.

**Flujo propuesto:**
```
Flujo actual:
  Generar título/body → [ Copiar | Guardar | Regenerar | Salir ]

Flujo nuevo:
  Generar título/body → [ Copiar | Guardar | Regenerar | 🚀 Crear PR en GitHub | Salir ]

Al seleccionar "Crear PR en GitHub":
  1. Mostrar: base branch actual detectado
     → Confirmar o seleccionar otra base
  2. ¿Crear como draft?  [ Sí / No ]
  3. Reviewers (opcional, lista de colaboradores recientes)
  4. Labels (opcional)
  5. Confirmar preview final:
     ┌────────────────────────────────────────┐
     │  PR a crear                            │
     │  Título: feat: add user authentication │
     │  Base:   main                          │
     │  Draft:  No                            │
     │  Reviewers: @monalisa                  │
     └────────────────────────────────────────┘
     [ Crear PR ] [ Cancelar ]
  6. Ejecutar: gh pr create --title "..." --body "..." --base main
  7. Mostrar URL del PR creado con opción de abrir en navegador
```

**Comandos gh usados:**
- `gh pr create --title "..." --body "..." [--draft] [--reviewer ...] [--label ...]`
- `gh repo view --json defaultBranchRef` para detectar rama base

---

### 3. PR — Dashboard de estado con CI

**Gap:** No hay visibilidad del estado de los PRs abiertos ni de los checks de CI desde el CLI.

**Propuesta:** Nuevo subcomando `gsf pr status` usando `gh pr status --json`.

**UI propuesta (Ink):**
```
┌─ Estado de Pull Requests ─────────────────────────────────────┐
│                                                                │
│  Rama actual                                                   │
│  #42  feat: add user authentication   [feat/auth]             │
│       ✅ 3/3 checks · 🔍 Review requerido                    │
│                                                                │
│  Creados por ti                                                │
│  #38  fix: resolve null pointer       [fix/null-check]        │
│       ❌ 1/3 checks fallando · ✅ Aprobado                   │
│  #31  docs: update README             [docs/readme]           │
│       ✅ Checks OK · ✅ Aprobado · Listo para merge          │
│                                                                │
│  Esperando tu review                                           │
│  #35  chore: update dependencies      [chore/deps]            │
│       ✅ Checks OK · ⏳ Tu turno                             │
│                                                                │
│  [r] Abrir en navegador   [Enter] Ver detalles   [q] Salir   │
└───────────────────────────────────────────────────────────────┘
```

**Comandos gh usados:**
- `gh pr status --json number,title,headRefName,statusCheckRollup,reviewDecision`

---

### 4. PR — Merge de PR en GitHub

**Gap:** El merge de `gsf merge` es solo local (`git merge`). No hay forma de mergear un PR en GitHub desde el CLI.

**Propuesta:** Nuevo subflow `gsf pr merge` en `src/commands/pr.ts`.

**Flujo propuesto:**
```
1. Detectar PR abierto para la rama actual
2. Mostrar estado: checks, reviews, conflictos
3. Seleccionar estrategia de merge:

   ¿Cómo quieres mergear el PR #42?

   → Merge commit       — preserva toda la historia de commits
   → Squash and merge   — aplasta todos los commits en uno     [recomendado para features]
   → Rebase and merge   — historia lineal, commits individuales [recomendado para fixes]

4. ¿Eliminar rama después del merge?  [ Sí (recomendado) / No ]

5. Si CI aún pendiente:
   ¿Activar auto-merge cuando pasen los checks?  [ Sí / No ]

6. Confirmar → ejecutar
7. Mostrar confirmación con link al merge
```

**Comandos gh usados:**
- `gh pr merge <number> --squash --delete-branch`
- `gh pr merge <number> --rebase --delete-branch`
- `gh pr merge <number> --merge --delete-branch`
- `gh pr merge <number> --auto --squash`

---

## MEJORAS DE PRIORIDAD MEDIA

### 5. PR — Checkout de PR por número

**Gap:** Para revisar el código de un PR hay que hacer `git fetch` + `git checkout` manualmente, sabiendo el nombre de la rama.

**Propuesta:** Añadir acción "Checkout PR" en el menú de `gsf pr` o como subcomando `gsf pr checkout`.

**Flujo propuesto:**
```
gsf pr checkout          → Selector interactivo de los 10 últimos PRs abiertos
gsf pr checkout 42       → Checkout directo del PR #42

En ambos casos:
  1. Fetch de la rama del PR
  2. Crear rama local (o resetear si ya existe)
  3. Checkout
  4. Mostrar resumen del PR:
     ─────────────────────────────────────────
     PR #42 · feat: add user authentication
     Autor: @monalisa · Abierto hace 2 días
     Rama: feat/auth → main
     Checks: ✅ 3/3 · Reviews: ⏳ 0/1
     ─────────────────────────────────────────
```

**Comandos gh usados:**
- `gh pr list --json number,title,headRefName,author --limit 10`
- `gh pr checkout <number>`

---

### 6. PR — Monitor de CI Checks con modo watch

**Gap:** No hay forma de monitorizar si los checks de CI pasan en tiempo real desde el CLI.

**Propuesta:** Nuevo subcomando `gsf pr checks` con modo live usando Ink.

**UI propuesta:**
```
┌─ CI Checks — PR #42: feat: add user authentication ───────────┐
│  Actualizando cada 10s...                                      │
│                                                                │
│  ✅  lint              completado       45s                   │
│  ✅  test:unit         completado       1m 23s                │
│  ⏳  test:e2e          en progreso      2m 10s...             │
│  ⏳  build             en cola          —                     │
│  ○   deploy:staging    esperando build  —                     │
│                                                                │
│  [w] Abrir en web   [q] Salir   [f] Fail-fast mode           │
└───────────────────────────────────────────────────────────────┘
```

**Comportamiento:**
- `gsf pr checks` → checks del PR de la rama actual
- `gsf pr checks --watch` → modo live con polling cada 10s
- `gsf pr checks --watch --fail-fast` → sale al primer fallo
- Notificación en terminal al completarse todos los checks

**Comandos gh usados:**
- `gh pr checks --json name,state,completedAt,startedAt,link`

---

### 7. PR — Update Branch (sincronizar rama del PR con la base)

**Gap:** Cuando la base branch avanza, el PR branch queda desactualizado y no hay forma guiada de actualizarlo.

**Propuesta:** Integrar en `gsf sync` (`src/commands/sync.ts`). Cuando sync detecta que la rama actual tiene un PR abierto y la base ha avanzado, ofrecer opciones adicionales.

**Cambio en el flujo de sync:**
```
Situación detectada: estás en feat/auth con PR #42 abierto
La rama base 'main' tiene 3 commits nuevos desde que se abrió el PR.

Opciones de sync:
→ Pull (rebase)                         — reaplica tus commits encima de main
→ Actualizar rama del PR (merge)        — merge de main en tu rama [compatible con PR]
→ Actualizar rama del PR (rebase)       — rebase sobre main vía GitHub API
→ Ver estado y decidir después
```

**Comandos gh usados:**
- `gh pr view --json baseRefName,headRefName,number`
- `gh pr update-branch <number>`
- `gh pr update-branch <number> --rebase`

---

### 8. PR — Review (aprobar / solicitar cambios)

**Gap:** No hay forma de hacer code review desde el CLI.

**Propuesta:** Nuevo subflow `gsf pr review` en `src/commands/pr.ts`.

**Flujo propuesto:**
```
1. gsf pr review → lista los PRs esperando tu review
2. Seleccionar PR del selector
3. Ver diff del PR en terminal (paginado, con colores)
4. Elegir acción:
   ✅ Aprobar
   💬 Solo comentar
   🔄 Solicitar cambios
5. Añadir comentario/body (opcional, editor)
6. Confirmar y enviar review
```

**Comandos gh usados:**
- `gh pr list --search "review-requested:@me" --json number,title,author`
- `gh pr diff <number>`
- `gh pr review <number> --approve [-b "comentario"]`
- `gh pr review <number> --request-changes -b "..."`
- `gh pr review <number> --comment -b "..."`

---

### 9. PR — Soporte para draft al crear

**Gap:** Cuando se crea un PR, no hay opción de marcarlo como draft (trabajo en progreso).

**Propuesta:** Añadir campo en el flujo de creación de PR (mejora de la propuesta #2).

**Cambio en el flujo de `gsf pr`:**
```
Antes de crear el PR:
¿Cuál es el estado del PR?
→ Listo para review     — el código está terminado
→ Draft (borrador)      — trabajo en progreso, no listo para review
```

Añadir `--draft` a la llamada `gh pr create` si se selecciona borrador.

**Comandos gh usados:**
- `gh pr create --draft ...`

---

### 10. Merge local — Selector de estrategia

**Gap:** `gsf merge` solo hace `git merge` (merge commit). No hay opción de squash ni rebase para merges locales.

**Propuesta:** Añadir selector de estrategia en `src/commands/merge.ts` antes de ejecutar el merge.

**Cambio en el flujo de merge:**
```
¿Cómo quieres hacer el merge?

→ Merge commit    — crea un commit de merge, preserva toda la historia
→ Squash merge    — aplasta los commits en uno antes de mergear
→ Rebase          — reaplica los commits sobre la base (historia lineal)
```

**Implementación:**
- `git merge <branch>` (actual)
- `git merge --squash <branch>` → luego `git commit` guiado
- `git rebase <branch>` → con manejo de conflictos del rebase

---

## MEJORAS DE PRIORIDAD BAJA

### 11. Stash — UI de gestión

**Gap:** El stash se usa internamente en el rescue flow pero nunca se expone al usuario. Es una operación diaria frecuente.

**Propuesta:** Nuevo comando `gsf stash` en un nuevo fichero `src/commands/stash.ts`.

**Menú propuesto:**
```
Gestión de Stash

→ Guardar cambios en stash
→ Ver lista de stashes
→ Recuperar último stash
→ Recuperar stash específico
→ Eliminar stash

Lista visual (en "Ver lista"):
  ● stash@{0}  [hace 2h]  WIP: feat/auth         3 ficheros
  ● stash@{1}  [ayer]     fix: temp save          1 fichero
  ● stash@{2}  [3 días]   sin título              5 ficheros
```

**Operaciones git necesarias en `src/git/repo.ts`:**
- `stashList()` → `git stash list --format=...`
- `stashSave(message?)` → `git stash push -m "..."`
- `stashApply(index)` → `git stash apply stash@{n}`
- `stashPop(index?)` → `git stash pop [stash@{n}]`
- `stashDrop(index)` → `git stash drop stash@{n}`

---

### 12. PR — Ver diff en terminal

**Gap:** Para revisar los cambios de un PR hay que ir al navegador o hacer checkout manualmente.

**Propuesta:** Opción "Ver diff" dentro del flujo de `gsf pr checkout` o en `gsf pr review`.

**Comportamiento:**
- Usar `gh pr diff <number>` con paginación
- Aplicar coloring con chalk (verde/rojo para añadidos/eliminados)
- Mostrar navegación por ficheros si el diff es grande

**Comandos gh usados:**
- `gh pr diff <number>`

---

## MEJORAS PROPIAS (sin equivalente en gh)

### A. Commit — Amend guiado

**Gap:** No hay forma de modificar el último commit de forma guiada. `git commit --amend` es poco descubierto y peligroso si ya se hizo push.

**Propuesta:** Añadir opción "Enmendar último commit" al flujo de `gsf commit` cuando no hay cambios staged pero sí hay un commit reciente.

**Flujo:**
```
No hay ficheros staged.

¿Qué quieres hacer?
→ Seleccionar ficheros para nuevo commit
→ Enmendar el último commit (modificar mensaje o añadir ficheros)
→ Cancelar

Si selecciona "Enmendar":
  - Si el commit ya fue pusheado → advertencia prominente
    "⚠️  Este commit ya está en el remoto. Enmendarlo requerirá --force-with-lease"
    [ Continuar con cautela ] [ Cancelar ]
  - Mostrar el mensaje actual editable (como en el flujo de commit)
  - Mostrar ficheros del commit + opción de añadir más staged
  - Ejecutar git commit --amend --no-edit o con nuevo mensaje
```

**Fichero:** `src/commands/commit.ts`

---

### B. Push — Force push guiado (tras rebase/amend)

**Gap:** Cuando se hace rebase o amend de commits ya pusheados, el push falla. El usuario tiene que saber qué hacer manualmente.

**Propuesta:** Mejorar el manejo de este caso en `src/commands/push.ts`.

**Comportamiento actual:** El push falla con un error de git.

**Comportamiento propuesto:**
```
El push falló porque tu rama local y el remoto han divergido.
Esto ocurre después de un rebase o de enmendar commits ya publicados.

¿Qué quieres hacer?

→ Force push (--force-with-lease)  — sobreescribe el remoto [CUIDADO: reescribe historia]
→ Ver diferencia local vs remoto   — muestra commits que difieren
→ Cancelar y resolver manualmente

Si elige Force push:
  ┌──────────────────────────────────────────────────────────┐
  │  ⚠️  OPERACIÓN DESTRUCTIVA                               │
  │                                                          │
  │  Estás a punto de sobreescribir la historia del remoto   │
  │  en la rama feat/auth.                                   │
  │                                                          │
  │  Esto puede afectar a otros colaboradores con esta rama. │
  │  Escribe el nombre de la rama para confirmar:            │
  └──────────────────────────────────────────────────────────┘
  > feat/auth_

  [ Confirmar ] [ Cancelar ]
```

**Fichero:** `src/commands/push.ts`

---

### C. Sync — Auto-fetch en background

**Gap:** Los datos de ahead/behind en `gsf info` y `gsf push` pueden estar desactualizados si no se ha hecho fetch recientemente.

**Propuesta:** Config opcional `git.autoFetch: true`. Al ejecutar cualquier comando gsf, hacer un `git fetch --quiet --prune` en background si el último fetch fue hace más de N minutos (configurable, default: 5min).

**Implementación:**
- Añadir `autoFetchIfStale(minutos: number)` en `src/git/repo.ts`
- Leer `config.git.autoFetch` y `config.git.autoFetchIntervalMinutes`
- Invocar al inicio de `cli.ts` en background (no bloquear el comando principal)
- Añadir al `doctor` la verificación de este setting

**Config a añadir:**
```json
{
  "git": {
    "autoFetch": false,
    "autoFetchIntervalMinutes": 5
  }
}
```

---

### D. Log — Filtros interactivos

**Gap:** `gsf log` muestra el grafo de commits pero no hay forma de filtrar ni buscar.

**Propuesta:** Añadir modo de filtros a `src/commands/log.ts`.

**UI propuesta (segunda pantalla al pulsar [f]):**
```
Filtros activos: ninguno

Por autor:      [ ________________ ]
Por fecha:      Desde [ _________ ]  Hasta [ _________ ]
Por fichero:    [ ________________ ]
Buscar texto:   [ ________________ ]

[ Aplicar ] [ Limpiar ] [ Cancelar ]
```

**Comandos git:**
- `git log --author="..."` 
- `git log --after="..." --before="..."`
- `git log -- <path>`
- `git log --grep="..."`

---

### E. Info — Estado del PR de la rama actual

**Gap:** `gsf info` muestra el contexto local (rama, tickets, ficheros) pero no si hay un PR abierto y su estado.

**Propuesta:** Si `gh` está disponible, añadir sección "Pull Request" al output de `src/commands/info.ts`.

**Añadir al output de gsf info:**
```
  Pull Request
  ─────────────────────────────────────────────────
  #42  feat: add user authentication
  Estado:    ✅ 3/3 checks · 🔍 1 review pendiente
  Base:      main
  URL:       https://github.com/owner/repo/pull/42
  ─────────────────────────────────────────────────
```

Si no hay PR abierto para la rama: mostrar "Sin PR abierto" con opción de crear uno.

**Comandos gh usados:**
- `gh pr view --json number,title,state,statusCheckRollup,reviewDecision,url,baseRefName`

---

## Resumen de cambios por fichero

| Fichero | Cambios |
|---|---|
| `src/commands/pr.ts` | Crear PR en GitHub, pr status, pr merge, pr checkout, pr review, pr checks |
| `src/commands/merge.ts` | Selector de estrategia (squash, rebase, merge commit) |
| `src/commands/sync.ts` | Integración con `gh pr update-branch`, auto-fetch |
| `src/commands/commit.ts` | Flujo de amend guiado |
| `src/commands/push.ts` | Force push guiado con confirmación |
| `src/commands/info.ts` | Mostrar estado del PR actual |
| `src/commands/log.ts` | Filtros interactivos |
| `src/commands/doctor.ts` | Check de `gh` CLI y autenticación |
| `src/commands/stash.ts` | Nuevo comando (fichero nuevo) |
| `src/git/repo.ts` | `detectGhCli()`, `stashList/Save/Apply/Pop/Drop()`, `autoFetchIfStale()` |
| `src/config/config.ts` | `git.githubIntegration`, `git.autoFetch`, `git.autoFetchIntervalMinutes` |

---

## Orden de implementación sugerido

1. **Integración base con `gh`** (doctor + detección) — habilita todo lo demás
2. **PR → Crear en GitHub** — mayor impacto inmediato en el flujo diario
3. **PR → Status + Checks** — visibilidad del trabajo pendiente
4. **PR → Merge en GitHub** — cierra el loop del ciclo de vida del PR
5. **Merge → Estrategias** — mejora independiente, sin dependencia de `gh`
6. **Commit → Amend guiado** — mejora independiente, alta frecuencia de uso
7. **Push → Force push guiado** — mejora independiente, evita errores
8. **PR → Checkout** — útil para code review
9. **PR → Review** — complementa el checkout
10. **Stash → UI** — calidad de vida, sin dependencias
11. **Sync → Auto-fetch** — mejora de frescura de datos
12. **PR → Update branch** — útil pero menos frecuente
13. **Log → Filtros** — nice to have
14. **Info → Estado PR** — nice to have
