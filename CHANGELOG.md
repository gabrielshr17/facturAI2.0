# Changelog

Todos los cambios relevantes para los usuarios se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Added

- Las ediciones hechas desde el panel remoto (productos, departamentos, proveedores, clientes y
  datos del negocio) ahora llegan a la caja en menos de un minuto, incluso si la caja estuvo sin
  internet. Antes solo subían datos de la caja hacia la nube y los cambios remotos nunca se veían
  en el punto de venta.

- El panel remoto tiene un botón "facturAI" que abre la misma aplicación web de la caja, con las
  mismas pantallas (productos con venta a granel y niveles de precio, compras, clientes,
  facturas y reportes) y los mismos datos. Desde ahí no se puede vender ni abrir o cerrar caja:
  eso sigue haciéndose solo en la caja.

### Fixed

- Un cambio hecho en el panel remoto ya no se pierde cuando la caja vende ese mismo producto
  después: gana siempre el cambio más reciente.
