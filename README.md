# CV Tech Parser SPA

Landing + SPA para subir un CV en **PDF** o **DOCX** y extraer automáticamente información relevante para perfiles tech:

- Nombre y apellidos
- Empresas
- Roles
- Tecnologías
- Idiomas

## Cómo ejecutar

Al ser una app estática, basta con levantar un servidor local en la carpeta del proyecto:

```bash
python -m http.server 4173
```

Luego abre `http://localhost:4173`.

## Cómo funciona

- Para PDF se usa **PDF.js** desde CDN.
- Para DOCX se usa **Mammoth.js** desde CDN.
- El parsing de entidades se realiza con heurísticas de keywords y patrones simples para detectar:
  - nombre completo
  - empresas
  - roles
  - stack tecnológico
  - idiomas

## Limitaciones conocidas

- La extracción depende de la calidad del texto del CV (si está escaneado o muy maquetado puede fallar).
- El parser de empresas es heurístico y puede incluir falsos positivos.
- Está optimizado para iteración rápida de MVP, no para exactitud de producción.
