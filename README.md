# CV Tech Parser SPA

Landing + SPA para subir un CV en **PDF** o **DOCX** y extraer automáticamente información relevante para perfiles tech:

- Nombre y apellidos
- Empresas
- Roles
- Tecnologías
- Idiomas

## Cómo ejecutar

```bash
python -m http.server 4173
```

Luego abre `http://localhost:4173`.

## Cómo probar la app

1. Introduce tu **Gemini API key** en el campo `Gemini API Key`.
2. Pulsa **Seleccionar archivo** y sube tu CV (`.pdf`, `.doc`, `.docx`).
3. Espera a que termine:
   - primero se extrae texto del archivo,
   - después se llama al LLM para estructurar el contenido.
4. Revisa los resultados de nombre, empresas, roles, tecnologías e idiomas.

## Lógica actual

- Extracción de texto:
  - **PDF.js** para PDF.
  - **Mammoth.js** para DOCX.
- Extracción de entidades:
  - llamada a **Gemini API (Google AI)** (`gemini-1.5-flash-latest`) con salida JSON estructurada.
  - el modelo devuelve directamente `fullName`, `companies`, `roles`, `technologies`, `languages`.

## Limitaciones conocidas

- Necesita conexión a internet y una API key válida de Gemini.
- El resultado depende de la calidad del texto extraído del CV.
- En CVs con formato complejo o escaneados, la extracción previa puede perder información.
