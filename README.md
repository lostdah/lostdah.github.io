# Huellas al Lodo — Sitio web

Sitio estático (HTML + CSS, sin dependencias) del proyecto **Huellas al Lodo**.
Se puede editar con cualquier editor de texto y publicar tal cual en GitHub Pages.

## Cómo verlo en tu computador

Opción rápida: doble clic en `index.html`.

Opción recomendada (para que el calendario del blog funcione bien), abre una terminal en esta carpeta y ejecuta:

```
python -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador.

## Cómo subirlo a GitHub Pages

1. Sube **todo el contenido de esta carpeta** a la raíz del repositorio `lostdah.github.io`.
2. En el repo: Settings → Pages → Branch: `main` / carpeta `/root` → Save.
3. En ~1-2 minutos queda en línea en `https://lostdah.github.io`.

> Importante: `index.html` debe quedar en la **raíz** del repositorio (no dentro de una subcarpeta).

## Estructura de páginas

Barra superior (5 secciones principales):

| Archivo | Sección |
|---|---|
| `index.html` | Inicio (portada + investigación) |
| `solucion.html` | Solución (portada de la sección) |
| `blogs.html` | Blogs (bitácora semanal + contrato de equipo) |
| `bibliografia.html` | Bibliografía (formato APA 7.ª edición) |
| `quienes-somos.html` | Quiénes somos |

Sub-páginas (accesibles desde el menú lateral ☰):

- Investigación: `antecedentes.html`, `terreno.html`, `hallazgos.html`, `problema.html`, `requerimientos.html`
- Solución: `lluvia-de-ideas.html`, `propuesta-conceptual.html`, `prototipado.html`, `propuesta-final.html`

`honse.html` es un easter egg (enlace oculto en "Quiénes somos").

## Cómo editar

- **Textos y contenido:** abre el `.html` de la página y edita dentro de las etiquetas. El contenido de cada página está entre `<div class="main-content">…</div>`.
- **Menús (barra superior y lateral):** el bloque de navegación está repetido al inicio del `<body>` de **cada** archivo `.html`. Si cambias un enlace del menú, hazlo en todos los archivos para mantener la coherencia.
- **Colores y estilos:** todo está en `style.css` (paleta principal: `#5C3A21`, `#8C5A35`, `#F7F4F0`).
- **Bloques "Agregar info":** son los recuadros con fondo rayado. Reemplaza el `<div class="placeholder-info">…</div>` por el contenido real cuando lo tengan.

## Pendientes de contenido (bloques "Agregar info")

- Terreno → planificaciones de salidas a terreno
- Hallazgos → observaciones de campo y entrevistas a vecinos
- Problema → matriz aplicada del problema
- Requerimientos → listado formal de requerimientos
- Lluvia de ideas → sesión de brainstorming
- Prototipado → mockups / prototipo
- Propuesta Final → propuesta consolidada
- Blogs → contrato de equipo
- Quiénes somos → integrantes del equipo
- Bibliografía → referencias adicionales (mantener formato APA 7)
