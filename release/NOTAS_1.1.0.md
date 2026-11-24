# MatrixPro Peru 1.1.0

## Novedades

- **Vista del Rodal:** nueva subpestaña en Resultados que dibuja el rodal simulado año a año, árbol por árbol, en perspectiva, perfil o planta. El número de árboles por clase de DAP coincide con la simulación, y el reclutamiento, el crecimiento, la mortalidad y la cosecha siguen las tasas del modelo.
- **Árboles por género:** 29 formas para los géneros más comunes de bosque lluvioso, montaña y bosque seco, asignadas según su frecuencia observada en el inventario, con alturas del inventario.
- **Exportar animaciones:** GIF, video MP4 (H.264, 30 cuadros por segundo) e imagen PNG.
- **Manual actualizado**, con capturas de pantalla y la nueva Vista del Rodal.

## Correcciones

- **Máscara forestal:** no se cargaba en las versiones anteriores y todos los puntos se aceptaban como bosque. Ahora los puntos fuera del área forestal muestran una advertencia, ponen en cero el estado inicial y no permiten autocompletar.
- **Descarga de CSV:** la ventana de guardado ya no bloquea el resto de la aplicación.
- **Manual:** igualar el Estado Objetivo al Inicial no evita la cosecha. Para simular sin intervención, use un Año de Primera Cosecha mayor que la duración.

Los resultados numéricos de las simulaciones no cambian respecto a 1.0.2 para los mismos datos de entrada.

## Para tener en cuenta

- El modelo **no simula especies**. Las posiciones, copas y géneros de la Vista del Rodal son ilustrativos.
- La máscara forestal es estricta: alrededor del 30 % de las parcelas de la base de datos (cerca de la mitad en zonas montañosas) quedan fuera. Puede elegir un punto cercano o ingresar el rodal manualmente.
- Se necesita conexión a Internet para el mapa y los gráficos.
- Los instaladores no tienen firma digital; Windows o el antivirus pueden mostrar una advertencia.

## Archivos

| Archivo | Descripción |
|---|---|
| `MatrixPro Peru_1.1.0_x64-setup.exe` | Instalador para Windows (recomendado; no requiere permisos de administrador) |
| `MatrixPro Peru_1.1.0_x64_en-US.msi` | Instalador MSI para Windows |
| `MatrixPro_Peru_Guia_de_Uso.pdf` | Manual de uso |

Requiere Windows 10 u 11 (64 bits). No es necesario instalar R.

SHA-256:

```
5b33e3cf2925032588a36db05294b0104c0dec06059f6f2146cfbed09cd33657  MatrixPro Peru_1.1.0_x64-setup.exe
bb4d996303ffa9d49bb7be8c0f63871d36010b67990c5ca1ad02998bd38cc09c  MatrixPro Peru_1.1.0_x64_en-US.msi
```
