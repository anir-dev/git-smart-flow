# Git Smart Flow — Guía de usuario

> Herramienta CLI para gestionar tus flujos de trabajo con Git de forma guiada, segura e interactiva.

---

## Instalación

### Método 1 — npm (recomendado, requiere Node.js ≥ 18)

```bash
npm install -g git-smart-flow
```

### Método 2 — Script de instalación automática

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/macos/install.sh | bash
```

**Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/linux/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/windows/install.ps1 | iex
```

### Método 3 — Binario standalone (sin Node.js)

Descarga el ZIP para tu sistema desde [GitHub Releases](https://github.com/YOUR_USERNAME/git-smart-flow/releases), descomprímelo y ejecuta el binario directamente.

---

## Primeros pasos

Después de instalar, ejecuta el asistente de configuración:

```bash
git-smart-flow setup
```

El asistente te preguntará:
- Idioma de los mensajes de commit y PR
- Qué proveedor de IA quieres usar (puedes elegir "Ninguno" para modo heurístico gratuito)
- Si quieres instalar alias cortos (`gsfc`, `gsfm`, etc.)

---

## Comandos más usados

### Crear un commit de forma asistida

```bash
git-smart-flow commit
# o con el alias corto (si lo activaste en setup):
gsfc
```

El asistente:
1. Detecta los archivos staged
2. Si no hay staged, te pregunta qué archivos añadir (nunca hace `git add .`)
3. Escanea en busca de secretos o archivos sensibles
4. Genera un mensaje de commit según la convención detectada en tu repositorio
5. Te muestra el mensaje propuesto y te permite aceptarlo, editarlo o regenerarlo
6. Solo hace el commit cuando confirmas explícitamente

### Solo generar el mensaje (sin commitear)

```bash
git-smart-flow commit-message
# Sin IA (siempre disponible, sin internet):
git-smart-flow commit-message --no-ai
```

### Generar descripción de Pull Request

```bash
git-smart-flow pr
# o con alias:
gsfpr
```

Genera título y cuerpo del PR según los commits desde la rama base. Puedes copiar al portapapeles, guardar en archivo o imprimir en terminal.

### Validar el estado del repositorio

```bash
git-smart-flow validate
```

Comprueba: rama protegida, ticket en rama, commitlint, archivos staged, secretos, conflictos, upstream.

### Push validado

```bash
git-smart-flow push
# o con alias:
gsfp
```

Revisa el estado antes de hacer push y pide confirmación explícita.

### Menú interactivo principal

```bash
gsf
# o:
git-smart-flow menu
```

---

## Elegir un proveedor de IA

| Proveedor | Coste | Privacidad | Qué necesitas |
|-----------|-------|------------|---------------|
| **Heurístico** (defecto) | Gratis | Local | Nada |
| **Ollama** | Gratis | Local, privado | Ollama corriendo en tu máquina |
| **GitHub Copilot CLI** | Suscripción | Remoto | `gh copilot` instalado |
| **OpenAI API** | De pago | Remoto | `OPENAI_API_KEY` |
| **Claude API** | De pago | Remoto | `ANTHROPIC_API_KEY` |

Para cambiar de proveedor:
```bash
git-smart-flow config
```

---

## FAQ

**¿Funciona sin conexión a internet?**
Sí. El proveedor heurístico y Ollama (local) funcionan completamente offline.

**¿git-smart-flow modifica mi código o configuración de Git?**
No. Solo lee el estado del repositorio y sugiere mensajes. Los commits y pushes solo se ejecutan con tu confirmación explícita.

**¿Envía mi código a la IA?**
Por defecto, no se envía el diff bruto. Solo se envía un resumen heurístico de los archivos cambiados. Puedes activar `allowRawDiff: true` en la configuración si quieres más contexto.

**¿Cómo desinstalar?**
```bash
npm uninstall -g git-smart-flow
```

**¿Dónde se guarda la configuración?**
En `~/.git-smart-flow/config.json` (configuración global) y `.git-smart-flow.json` en el repositorio actual (configuración local).

**¿Qué pasa si tengo commitlint configurado en mi proyecto?**
git-smart-flow lo detecta automáticamente y adapta las sugerencias a tus reglas de commitlint.
