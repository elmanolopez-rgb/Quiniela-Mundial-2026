# Quiniela Mundial 2026 - Tiempo Real

App lista para desplegar. Ya probé la sincronización en tiempo real entre 2+ clientes y funciona.

## ✅ ¿Qué hace?

Todos los participantes abren la misma URL y, cuando alguien guarda un pronóstico, marca un partido en vivo o registra un resultado, **todos los demás lo ven al instante**.

Sincroniza:
- Pronósticos por partido (marcador de cada jugador)
- Campeón elegido por cada jugador
- Equipos TBD en fases finales
- Nombres editables de los jugadores
- Estados de partido (pendiente / en vivo / finalizado) y resultados oficiales

## 🚀 Opción A: Deploy en Render (gratis, 2 min)

1. Ve a https://render.com y crea cuenta (con Google es 1 click).
2. Click **New +** → **Web Service** → **Connect Git Repo** (primero sube esta carpeta a GitHub) o **Public Git Repository** apuntando a la URL de tu repo.
3. Configuración:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Click **Deploy**. En 2 minutos te da una URL tipo `https://quiniela-xxxx.onrender.com`. ¡Esa es tu URL pública! Compártela con todos.

⚠️ El plan gratuito "duerme" el server tras 15 min sin uso. La primera vez que alguien entra tarda ~30s en despertar, luego va perfecto.

💡 Si subes el repo con `render.yaml` incluido, Render detecta la configuración automáticamente (Build/Start command) al crear el Web Service — no tienes que escribirla a mano.

## 🚀 Opción B: Correrlo local (para probar en tu red)

Si todos están en la misma WiFi:
```bash
npm install
npm start
```
El server dice "Quiniela corriendo en puerto 3000". Averigua tu IP local (`ipconfig` en Windows o `ifconfig` en Mac) y compárteles `http://TU_IP:3000`.

## 🛠️ Opción C: Railway.app (alternativa a Render)

1. https://railway.app → Login con GitHub
2. New Project → Deploy from GitHub repo
3. Auto-detecta Node. Listo.

## 💾 Persistencia permanente (Upstash Redis)

Por defecto, el plan gratuito de Render apaga el server tras 15 min sin uso y, cuando alguien vuelve a entrar, lo levanta de cero — eso borra cualquier dato que solo viviera en memoria o en un archivo dentro del propio server. Para que los pronósticos, campeones y resultados **nunca se pierdan**, el server guarda automáticamente cada cambio en [Upstash](https://upstash.com), una base de datos Redis gratuita en la nube (no caduca, no pide tarjeta).

**Configuración (una sola vez, ~2 minutos):**

1. Crea una cuenta gratis en https://upstash.com (puedes entrar con Google o GitHub).
2. Click **Create Database** → ponle un nombre (ej. `quiniela-2026`) → región la más cercana → **Create**.
3. En el detalle de la base de datos, busca la sección **REST API** y copia los valores `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
4. En Render, entra a tu Web Service → pestaña **Environment** → agrega esas 2 variables con esos valores exactos.
   - Si despliegas usando `render.yaml` (Blueprint), Render te las va a pedir automáticamente durante la creación del servicio.
5. Guarda los cambios. Render reinicia el server solo, y desde ese momento todo se guarda permanentemente.

**¿Qué pasa si no configuro Upstash?** El server sigue funcionando, pero guarda un respaldo en un archivo local (`state.json`) en vez de en Upstash. Eso sirve para pruebas en tu compu, pero **no sobrevive** a un redeploy o a que Render duerma el server — para el uso real con tus participantes, sí o sí conviene configurar Upstash.

## 📁 Estructura

```
quiniela-realtime/
├── index.js          # Backend Node + WebSocket
├── index.html         # Frontend de la quiniela (servido como estático)
├── package.json
├── package-lock.json
├── render.yaml
├── .gitignore
└── README.md
```

## 🔍 Pruebas que ya hice

Sincronización entre 2 clientes WebSocket con estos mensajes:
- ✅ `pred` (pronóstico de partido) → broadcast a todos
- ✅ `champion` (campeón elegido) → broadcast a todos
- ✅ `knockoutTeam` (equipo TBD asignado) → broadcast a todos
- ✅ `playerName` (nombre editado) → broadcast a todos
- ✅ `matchStatus` (pendiente/en vivo/finalizado) → broadcast a todos
- ✅ `matchScore` (resultado oficial) → broadcast a todos

Estado compartido: predicciones, campeón, equipos TBD, nombres, estados de partido y resultados se guardan en memoria del server y, en cada cambio, también en Upstash (o en `state.json` local si no configuraste Upstash) — ver la sección "Persistencia permanente" arriba.
