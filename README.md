# Universo LI

Aplicación web full stack para administrar un emprendimiento de marroquinería. Centraliza materiales, productos, stock, costos, precios, ventas, cobranzas y estadísticas en una interfaz protegida y responsive.

## Funcionalidades principales

- Gestión CRUD de componentes e insumos, con categorías, stock decimal, destacados y comentarios.
- Productos simples y productos compuestos (sets), con imágenes, materiales, confección y modificadores de precio.
- Cálculo automático de costos, precios publicados y rentabilidad.
- Registro y edición de ventas con estados pagado, pendiente y pago parcial.
- Actualización consistente de stock al asignar materiales o registrar y eliminar ventas.
- Tablero de estadísticas por período, categoría, producto y medio de pago.
- Actualización de precios desde Casa Nacho mediante scraping individual, por producto o programado.
- Sincronización nocturna con progreso persistido, cancelación, reintentos y tratamiento de rate limits.
- Autenticación mediante sesión firmada en cookie `HttpOnly`.

## Arquitectura

- **Frontend:** React 19, React Router y Vite.
- **Backend:** Netlify Functions sobre Node.js.
- **Persistencia:** Supabase/PostgreSQL mediante una tabla `data_store` con datos JSONB.
- **Scraping:** Axios y Cheerio.
- **Hosting:** Netlify para el frontend, las funciones y las tareas programadas.

El navegador sólo se comunica con las rutas `/api/*`. Las funciones serverless validan la sesión antes de acceder a Supabase o ejecutar operaciones de scraping. La clave de servicio de Supabase y las credenciales de acceso permanecen en las variables protegidas de Netlify y nunca se envían al frontend.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:8888` mediante Netlify Dev, que integra Vite, redirects y funciones serverless.

Para compilar:

```bash
npm run build
```

## Variables de entorno

Configurar localmente en `.env` y en producción desde Netlify:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE
APP_LOGIN_USER
APP_LOGIN_PASSWORD
APP_SESSION_SECRET
```

El archivo `.env` está excluido del repositorio. No deben incorporarse claves, contraseñas ni tokens al código o a la documentación versionada.

## Rutas principales

- `/components`: insumos, stock y actualización de precios.
- `/products`: productos, sets, costeo y precios.
- `/sales`: ventas, cobros y rentabilidad.
- `/stats`: métricas y visualizaciones.
- `/login`: acceso autenticado.

## Despliegue

El proyecto incluye `netlify.toml` con la compilación de Vite, las funciones serverless, los redirects de API y el fallback de la SPA. Los secretos se administran exclusivamente en Netlify.
