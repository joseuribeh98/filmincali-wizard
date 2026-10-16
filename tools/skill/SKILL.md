---
name: permiso-rodaje-cali
description: Prepara la solicitud de permiso de rodaje en espacio público de Santiago de Cali (Colombia) y genera llenos los formatos oficiales F004 a F008 de la guía de filmaciones. Úsala cuando alguien necesite filmar en calles, parques, andenes o áreas naturales de Cali, o pase un plan de rodaje, desglose u hoja de llamado para tramitar el permiso.
---

# Permiso de rodaje en espacio público de Cali

Esta skill convierte la información de una producción en los formatos oficiales que pide la Alcaldía de Santiago de Cali para autorizar el aprovechamiento económico del espacio público en filmaciones. Hace tres cosas:

1. Arma un `solicitud.json` con un modelo único (cada dato se pide una sola vez).
2. Revisa coherencia, plazos y anexos con `scripts/generar.mjs --revisar`.
3. Genera los .docx oficiales llenos y un .zip con `LEEME.txt` y la solicitud.

Es una herramienta independiente, hecha por Jose Uribe (joseuribe.dev). No es de la Alcaldía ni de la Comisión Fílmica. Dilo así al usuario y no prometas aprobación. El código es abierto: https://github.com/joseuribeh98/filmincali-wizard

## Requisitos

Node.js 18 o superior. El script trae todo empaquetado; no hay que instalar nada. No usa red: solo lee `solicitud.json` y las plantillas, y escribe en la carpeta de salida.

## Flujo

0. **Confirma que el permiso aplica.** No se tramita para periodismo de última hora, cámara en mano sin intervenir el tránsito ni estacionar vehículos, fotografía, proyecciones, espectáculos o eventos culturales, ni BTL que no termine en un comercial (detalle en `references/tramite.md`). Si el proyecto encaja en uno de esos casos, díselo al usuario antes de pedir datos.
1. **Reúne lo que el usuario ya tiene.** Pide el plan de rodaje, el desglose de producción, la hoja de llamado o un correo con los datos. Extrae de ahí todo lo que puedas antes de preguntar.
2. **Llena `solicitud.json`** siguiendo `references/esquema.json`. Usa `references/ejemplo.json` como guía de forma y tono. Fechas en `AAAA-MM-DD`, horas en `HH:MM`.
3. **Pregunta solo lo que falta**, agrupado por tema, nunca campo por campo. Lo que el modelo no puede inferir y casi siempre falta:
   - documento, teléfono y correo de los dos responsables;
   - tipo de espacio público de cada locación (define si hay plan de movilidad);
   - área ocupada en m2 (set, base y parqueo en espacio público) y conteo de elementos (vanes, plantas, carpas, etc.);
   - escala de cada locación (`local`, `zonal`, `urbano`, `regional` o `anden`), que define el valor a pagar;
   - jornadas con montaje, filmación y desmontaje por separado;
   - manejo de residuos y estrategia de socialización con la comunidad.
   No inventes datos personales, documentos ni direcciones. Si el usuario no sabe algo, déjalo vacío: el formato queda con el espacio en blanco para completarlo en Word.
4. **Revisa:** `node scripts/generar.mjs solicitud.json --revisar`. Devuelve JSON con `formatos`, `plazos`, `retribucionEstimada`, `avisos` (nivel `error` o `alerta`) y `anexos`. Corrige los errores con el usuario.
5. **Si no puedes ejecutar `node`**, entrega el `solicitud.json` y pide al usuario abrirlo en https://filmincali.joseuribe.dev con «Abrir solicitud.json»: allí se revisan los datos y se descargan los formatos.
6. **Genera:** `node scripts/generar.mjs solicitud.json --salida permiso-rodaje`. Escribe los .docx y el .zip en la carpeta.
7. **Entrega** el .zip y resume en pocas líneas: fecha límite para radicar, valor estimado a pagar, formatos incluidos y la lista de anexos que el usuario debe pegar o adjuntar (fotos, planos, firma, cartas).

Rutas relativas a la carpeta de esta skill: `scripts/generar.mjs`, `plantillas/`, `references/`.

## Reglas del trámite que aplica el script

- **Siempre:** F004 formulario de solicitud, F005 propuesta de ocupación, F007 concepto ambiental, F008 socialización.
- **F006 plan de movilidad:** solo si alguna locación tiene `corredor_vial`, `andenes` o `ciclorrutas` en `tiposEspacio`, o tiene afectaciones en `movilidad.afectaciones`. En ese caso llena el objeto `movilidad` de esa locación.
- **Áreas naturales del F007:** se llenan para las locaciones con `natural` en `tiposEspacio`; usa el objeto `natural` de la locación.
- **Tiempos de la Alcaldía:** con la documentación completa, la SEPOU tiene 15 días hábiles para revisar. Si falta algo, devuelve la solicitud y el solicitante tiene 30 días para completarla. Recomienda radicar lo antes posible dentro de la ventana.
- **Plazos:** se radica mínimo 20 días hábiles y máximo 3 meses antes del primer día en calle. El script cuenta días hábiles con los festivos de Colombia (Ley Emiliani). Si `plazos.estado` es `tarde`, avisa al usuario que debe hablar con la Comisión Fílmica antes de radicar.
- **Valor estimado:** `VR = (A x D x Esc x UVT) / 12` (Resolución 4132.030.21.1-7 de 2025, art. 6). A x D se suma por locación; la escala pesa local 0,4, zonal 0,6, urbana 0,8, regional 1 y andén 2, y si hay varias se usa la de mayor peso. En vías, la escala sigue la jerarquía vial (local: vía local; zonal: colectora; urbana: arteria secundaria; regional: arteria principal o interregional). Preséntalo siempre como estimado: el valor oficial lo notifica la Subdirección de Espacio Público.
- **Exenciones de pago:** proyectos académicos, comunitarios o con fondos públicos del Distrito. Cumplen el mismo trámite y necesitan una carta o certificación.
- **Plan de emergencias:** obligatorio si hay efectos especiales, escenas de riesgo o aglomeración (`personas.aglomeracion` > 0).
- **Afectación al MIO:** requiere autorización aparte de Metro Cali S.A.

El detalle del proceso, contactos y enlaces oficiales está en `references/tramite.md`.

## Qué no hace

- No radica. La radicación es en la plataforma PQRS de la Alcaldía, a nombre del solicitante.
- No pega fotos ni planos: deja el espacio marcado en el formato.
- No liquida el valor oficial; solo lo estima. La Alcaldía tiene su propia calculadora: https://www.cali.gov.co/planeacion/publicaciones/183378/tramite-de-aeep/

## Formato de los documentos

Las plantillas son los formatos oficiales publicados en filmincali.com.co (versión 001, códigos MMDI02.02.07.P010.F004 a F008). Solo se llenan los espacios en blanco y las casillas; los bloques que el formato pide repetir por locación o por día se repiten. Las casillas marcadas y sin marcar salen con los símbolos de casilla de Word, tal como en el formato.

## Editar en la web

El `solicitud.json` es el mismo que usa https://filmincali.joseuribe.dev. El usuario puede abrirlo allí con "Abrir solicitud.json", editarlo en el asistente y volver a descargar.
