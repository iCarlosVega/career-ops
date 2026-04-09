# Modo: apply — Asistente de Aplicación en Vivo

Modo interactivo para cuando el candidato está rellenando un formulario de aplicación en Chrome. Lee lo que hay en pantalla, carga el contexto previo de la oferta, y genera respuestas personalizadas para cada pregunta del formulario.

## Requisitos

- **Mejor con Playwright visible**: En modo visible, el candidato ve el navegador y Claude puede interactuar con la página.
- **Sin Playwright**: el candidato comparte un screenshot o pega las preguntas manualmente.

## Workflow

```
1. DETECTAR    → Leer Chrome tab activa (screenshot/URL/título)
2. IDENTIFICAR → Extraer empresa + rol de la página
3. BUSCAR      → Match contra reports existentes en reports/
4. CARGAR      → Leer report completo + Section G (si existe)
5. COMPARAR    → ¿El rol en pantalla coincide con el evaluado? Si cambió → avisar
6. ANALIZAR    → Identificar TODAS las preguntas del formulario visibles
7. GENERAR     → Para cada pregunta, generar respuesta personalizada
8. PRESENTAR   → Mostrar respuestas formateadas para copy-paste
```

## Paso 1 — Detectar la oferta

**Con Playwright:** Tomar snapshot de la página activa. Leer título, URL, y contenido visible.

**Sin Playwright:** Pedir al candidato que:
- Comparta un screenshot del formulario (Read tool lee imágenes)
- O pegue las preguntas del formulario como texto
- O diga empresa + rol para que lo busquemos

## Paso 2 — Identificar y buscar contexto

1. Extraer nombre de empresa y título del rol de la página
2. Buscar en `reports/` por nombre de empresa (Grep case-insensitive)
3. Si hay match → cargar el report completo
4. Si hay Section G → cargar los draft answers previos como base
5. Si NO hay match → avisar y ofrecer ejecutar auto-pipeline rápido

## Paso 3 — Detectar cambios en el rol

Si el rol en pantalla difiere del evaluado:
- **Avisar al candidato**: "El rol ha cambiado de [X] a [Y]. ¿Quieres que re-evalúe o adapto las respuestas al nuevo título?"
- **Si adaptar**: Ajustar las respuestas al nuevo rol sin re-evaluar
- **Si re-evaluar**: Ejecutar evaluación A-F completa, actualizar report, regenerar Section G
- **Actualizar tracker**: Cambiar título del rol en applications.md si procede

## Paso 4 — Analizar preguntas del formulario

Identificar TODAS las preguntas visibles:
- Campos de texto libre (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Campos de salario (range, expectation)
- Upload fields (resume, cover letter PDF)

Clasificar cada pregunta:
- **Ya respondida en Section G** → adaptar la respuesta existente
- **Nueva pregunta** → generar respuesta desde el report + cv.md

## Paso 5 — Generar respuestas

Para cada pregunta, generar la respuesta siguiendo:

1. **Contexto del report**: Usar proof points del bloque B, historias STAR del bloque F
2. **Section G previa**: Si existe una respuesta draft, usarla como base y refinar
3. **Tono "I'm choosing you"**: Mismo framework del auto-pipeline
4. **Especificidad**: Referenciar algo concreto del JD visible en pantalla
5. **career-ops proof point**: Incluir en "Additional info" si hay campo para ello

**Formato de output:**

```
## Respuestas para [Empresa] — [Rol]

Basado en: Report #NNN | Score: X.X/5 | Arquetipo: [tipo]

---

### 1. [Pregunta exacta del formulario]
> [Respuesta lista para copy-paste]

### 2. [Siguiente pregunta]
> [Respuesta]

...

---

Notas:
- [Cualquier observación sobre el rol, cambios, etc.]
- [Sugerencias de personalización que el candidato debería revisar]
```

## Paso 6 — Post-apply (opcional)

Si el candidato confirma que envió la aplicación:
1. Actualizar estado en `applications.md` de "Evaluada" a "Aplicado"
2. Actualizar Section G del report con las respuestas finales
3. Sugerir siguiente paso: `/career-ops contacto` para LinkedIn outreach

## Scroll handling

Si el formulario tiene más preguntas que las visibles:
- Pedir al candidato que haga scroll y comparta otro screenshot
- O que pegue las preguntas restantes
- Procesar en iteraciones hasta cubrir todo el formulario

## Paso 7 — Envío Autónomo

**Solo se activa si `autonomous_apply.enabled: true` en `config/profile.yml`.**

### Preconditions

1. Leer `config/profile.yml` → extraer bloque `autonomous_apply`
2. Si el bloque no existe o `enabled: false` → SKIP (usar flujo de copy-paste habitual del Paso 6)
3. Verificar que el score del report >= `min_score` (default: 4.0) → si no cumple → SKIP con aviso al candidato
4. Si `confirm_before_submit: true` → mostrar resumen de lo que se va a enviar y preguntar "¿Envío la aplicación a [Empresa] — [Rol]? (s/n)" → esperar confirmación explícita antes de continuar

### Form filling con Playwright

Para cada campo del formulario y su respuesta generada en Paso 5:

1. Tomar `browser_snapshot` para identificar selectores actuales de los campos
2. Para campos de texto libre (input, textarea): `browser_fill(selector, respuesta)`
3. Para dropdowns (select): `browser_select_option(selector, valor)`
4. Para checkboxes y radio buttons: `browser_click(selector)`
5. Para upload de CV/resume: `browser_set_input_files(selector, ruta_pdf)` — usar el PDF más reciente en `output/` que corresponda a la empresa/rol
6. Si el formulario tiene páginas múltiples: `browser_click` en el botón "Next" / "Continue" y repetir desde el punto 1 para la nueva página

### Submit

1. Tomar `browser_snapshot` completo para verificar que todos los campos visibles estén rellenos antes de enviar
2. Localizar el botón de envío buscando en orden: `button[type=submit]`, texto exacto "Apply", "Submit Application", "Send Application", "Submit"
3. `browser_click(submit_selector)`
4. Esperar la página de confirmación (texto: "Application received", "Thanks for applying", "Your application has been submitted", o equivalente)
5. Guardar screenshot de la confirmación: `output/{company-slug}-{YYYY-MM-DD}-submitted.png`

### Post-submit

1. Actualizar estado en `data/applications.md`: `Evaluated` → `Applied`
2. Actualizar Section G del report con las respuestas finales exactas que fueron enviadas
3. Reportar al candidato:

```
✅ Aplicación enviada
   Empresa: [Empresa]
   Rol:     [Rol]
   Score:   X.X/5
   Screenshot: output/{slug}-{date}-submitted.png
   Siguiente paso: /career-ops contacto → LinkedIn outreach al hiring manager
```

### Fallback

Si Playwright no puede rellenar un campo, no encuentra el botón de submit, o el formulario devuelve error:
- **STOP inmediatamente** — no reintentar ni hacer suposiciones sobre lo que faltó
- Reportar exactamente qué campo o paso falló
- Presentar las respuestas restantes en formato copy-paste para que el candidato complete manualmente
