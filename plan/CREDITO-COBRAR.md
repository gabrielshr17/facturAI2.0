# Validación de crédito en `factura-repo.ts cobrar()`

## Visión

`factura-repo.ts`'s `cobrar()` currently accepts a payment with `metodo='credito'`
unconditionally — no check that the client is allowed to buy on credit, no check
against their credit limit, and no update to their outstanding debt. This is a
real gap: a cashier can put an unlimited amount "on the tab" for any client,
including ones with no credit privileges, and the system never tracks what's
owed. Fix `cobrar()` so that a credit sale is only accepted when the client's
credit standing actually allows it, and the client's pending debt is properly
maintained.

## Especificación

Antes de aceptar un pago con `metodo='credito'`, `cobrar()` debe:

1. Exigir que el ticket tenga un `cliente_id` asignado. Sin cliente en el
   ticket → rechazar, con un mensaje que indique que hay que asignar un
   cliente al ticket para poder fiar.
2. Cargar ese cliente y verificar `aplica_credito`. Si el cliente no tiene
   crédito habilitado → rechazar el método `credito` por completo, con un
   mensaje que indique que el cliente no tiene privilegios de crédito.
3. Verificar disponibilidad de crédito: sumar todos los pagos con método
   `credito` de este cobro, sumarlos al saldo pendiente actual del cliente
   (`saldo_credito`) y compararlo contra `limite_credito`.
   - `limite_credito = 0` significa **sin límite** — siempre permitido
     (mientras el paso 2 se cumpla).
   - De lo contrario, si `saldo_credito + montoCredito > limite_credito` →
     rechazar, y el mensaje de rechazo debe mostrar la **deuda pendiente
     actual** del cliente y su **crédito disponible restante**, para que el
     cajero sepa por qué falló y cuánto puede fiar todavía el cliente.
4. Todo lo anterior debe validarse **antes de cualquier escritura** — no se
   inserta ningún pago, no se marca la factura como cobrada, no cambia ningún
   saldo — si la validación de crédito falla.
5. Si la validación pasa, la deuda pendiente del cliente (`saldo_credito`)
   debe incrementarse en el monto fiado como parte del mismo cobro, para que
   la deuda quede registrada de cara a la próxima validación.
6. Nada de esto puede vivir solo en la UI — el guardia pertenece a la capa de
   repo/servicio, según la regla del proyecto de que la validación de negocio
   y seguridad nunca confía en el cliente.

**Fuera de alcance para esta corrección:** un libro de movimientos con
auditoría, abonos (pagos de deuda), un reporte de cuentas por cobrar con
antigüedad, y cualquier cambio de UI — eso queda como el plan más amplio
CRM-02/03/04, no es necesario para cerrar este agujero específico en
`cobrar()`.
