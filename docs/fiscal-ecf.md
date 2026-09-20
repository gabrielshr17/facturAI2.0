# Decisión pendiente: transmisión e-CF a la DGII

## Estado actual

El sistema ya emite comprobantes fiscales **internamente**: `@sfr/core`
gestiona secuencias de NCF (`secuencia_ncf`) y guarda cada comprobante
(`comprobante_fiscal`) con su tipo (31/32/33/34) y número. Lo que falta es
la **transmisión real** de ese comprobante a la DGII para que sea un e-CF
legalmente válido — hoy `POST /fiscal/transmitir`
(`packages/api/src/routes/fiscal.ts`) responde `501 Not Implemented`
explícito a propósito, en vez de simular una respuesta que podría
confundirse con una transmisión real. El cliente usa
`crearProveedorFiscalSimulado()` de `@sfr/core` para desarrollo/pruebas.

Para venta física con comprobante fiscal, la normativa vigente de RD exige
la transmisión electrónica (e-CF) a la DGII — esto es un requisito legal,
no solo una mejora de producto.

## Opción 1 — Integración directa con la DGII (PAC propio)

Transmitir el XML del comprobante directamente al API de la DGII, sin
intermediario comercial.

- **A favor:** más barato a largo plazo (sin costo por comprobante de un
  tercero), sin dependencia de la disponibilidad de un proveedor externo.
- **En contra:** mayor esfuerzo de certificación inicial (la DGII certifica
  al emisor/software directamente), mantenimiento propio de la integración
  ante cambios de la DGII, más superficie de error criptográfico/XML a
  mantener en este repo.

## Opción 2 — Proveedor/PAC comercial (NOC u otro)

Usar un middleware comercial que recibe el XML (o los datos) del
comprobante y responde con el e-CF ya autorizado por la DGII.

- **A favor:** mucho menos esfuerzo de implementación y mantenimiento
  (el proveedor absorbe los cambios de la DGII), soporte comercial
  disponible si algo falla.
- **En contra:** costo recurrente por comprobante transmitido, dependencia
  de la disponibilidad/SLA de un tercero, un punto más de posible fallo
  fuera del control de este proyecto.

## Recomendación provisional

Sin conocer el volumen mensual real de comprobantes ni quién asumiría la
certificación ante la DGII, no se puede recomendar una opción con
confianza todavía. Como punto de partida razonable: si el volumen mensual
es bajo (negocio pequeño, pocas facturas fiscales/día), la Opción 2 (PAC
comercial) probablemente sale más barata en esfuerzo total pese al costo
por comprobante; si el volumen crece significativamente, vale la pena
reconsiderar la Opción 1.

## Punto de decisión pendiente

Antes de implementar cualquiera de las dos opciones, se necesita:

1. Volumen mensual estimado de comprobantes fiscales (31/32/33/34).
2. Quién certifica ante la DGII: el negocio directamente, o un PAC en su
   nombre.
3. Presupuesto disponible para costo recurrente (Opción 2) vs. esfuerzo de
   desarrollo/mantenimiento propio (Opción 1).

## Seam de integración (dónde entra el código cuando se decida)

- `packages/api/src/routes/fiscal.ts` — el endpoint `POST /fiscal/transmitir`
  ya existe con la forma correcta (`ComprobanteATransmitir` →
  `ResultadoTransmision`, ver el tipo en `@sfr/core`); solo falta reemplazar
  el `501` por la llamada real al PAC o a la DGII.
- `packages/core` — si la transmisión necesita persistir un estado propio
  del e-CF (pendiente/transmitido/rechazado, número de autorización de la
  DGII, etc.) más allá de lo que ya guarda `comprobante_fiscal`, ese es el
  lugar para extender el esquema.
