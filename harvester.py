import asyncio
import json
import logging
from playwright.async_api import async_playwright

<<<<<<< HEAD
# ==================================================================================================
# === DOCUMENTACIÓN PARA EL CLIENTE (app.js / bot de Node.js) ===
# ==================================================================================================
#
# Este script envía dos tipos principales de mensajes a través de una conexión TCP.
# Cada mensaje es un objeto JSON enviado como una sola línea, terminado con un '\n'.
#
# ---
#
# 1. TIPO DE MENSAJE: 'historical-candles'
# -----------------------------------------
# Propósito: Enviar un lote grande de velas históricas para un activo y un timeframe
#            específico. Esto se usa para la "precarga" o "backfilling" inicial del gráfico.
#
# Estructura del JSON:
# {
#   "type": "historical-candles",
#   "payload": {
#     "asset": "EURUSD_otc",
#     "timeframe": 60,
#     "candles": [
#       {"time": 1751301600, "open": 39.8893, "close": 39.8881, "high": 39.8894, "low": 39.8881, "volume": 7},
#       {"time": 1751301540, "open": 39.8907, "close": 39.8895, "high": 39.8927, "low": 39.8866, "volume": 86},
#       ...
#     ]
#   }
# }
#
# Campos:
# - asset (string): El nombre del activo (ej. "USDTRY_otc").
# - timeframe (int): El marco de tiempo de las velas en segundos (ej. 60 para 1m).
# - candles (array): Una lista de objetos, donde cada objeto es una vela (OHLC).
#   - time: Timestamp de UNIX del inicio de la vela.
#   - open, high, low, close: Precios de la vela.
#   - volume: Volumen de la vela.
#
# ---
#
# 2. TIPO DE MENSAJE: 'pip'
# --------------------------
# Propósito: Enviar una actualización de precio individual (un tick o pip). Se usa tanto para
#            los pips de "reanudación" (que vienen con el primer paquete de 1m) como para
#            los pips en tiempo real que llegan después de la precarga.
#
# Estructura del JSON:
# {
#   "type": "pip",
#   "payload": {
#     "asset": "EURUSD_otc",
#     "price": 1.0875,
#     "timestamp": 1751304981.164
#   }
# }
#
# Campos:
# - asset (string): El nombre del activo.
# - price (float): El precio actual del activo.
# - timestamp (float): El timestamp de UNIX exacto de cuándo se registró el precio.
#
# ---
#
# GUÍA PARA EL DESARROLLADOR DE app.js
# ------------------------------------
# El flujo de datos está diseñado para construir un gráfico preciso sin perder información,
# incluso si tu aplicación se conecta después de que la precarga haya comenzado.
#
# 1. Conéctate al servidor TCP. El servidor te enviará datos en cuanto se conecte.
#
# 2. Escucha los mensajes y procesa según el campo "type":
#
# 3. Si recibes 'historical-candles':
#    - Usa el array 'candles' para dibujar la base histórica de tu gráfico para ese
#      activo y timeframe. Puedes almacenarlos en un array o directamente en la librería
#      de gráficos que uses.
#
# 4. Si recibes 'pip':
#    - Este es el dato más reciente. Úsalo para actualizar la última vela en tu gráfico.
#    - Si el timestamp del pip es mayor que el de la última vela, podrías necesitar
#      crear una nueva vela.
#    - El servidor te enviará un lote inicial de pips de "reanudación" y luego seguirá
#      enviando pips en tiempo real uno por uno. Tu lógica debe manejar ambos casos de
#      la misma manera.
#
# IMPORTANTE: Debido a la naturaleza asíncrona, podrías recibir pips para un activo
# ANTES de recibir su paquete de velas históricas. Tu aplicación debe poder almacenar
# estos pips temporalmente y aplicarlos al gráfico una vez que las velas históricas lleguen.
#
# ==================================================================================================


=======
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
# --- Configuración ---
LOG_LEVEL = logging.INFO
TCP_HOST = "127.0.0.1"
TCP_PORT = 8765
BROWSER_CDP_ENDPOINT = "http://localhost:9222"
BROKER_URL_FRAGMENT = "qxbroker.com/es/trade"
WEBSOCKET_URL_FRAGMENT = "ws2.qxbroker.com/socket.io"

<<<<<<< HEAD
# Timeframes requeridos en segundos para la precarga de cada activo
REQUIRED_TIMEFRAMES = {60, 300, 600, 900, 1800} # 1m, 5m, 10m, 15m, 30m

# --- Configuración del Logging ---
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - [%(levelname)s] - (Harvester) - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

class AssetStateManager:
    """Gestiona el estado de inicialización y 'precarga' de cada activo de forma individual."""
    def __init__(self):
        self.states = {}
        logging.info("Gestor de Estado de Activos inicializado.")

    def _get_or_create_asset_state(self, asset_name):
        if asset_name not in self.states:
            self.states[asset_name] = {tf: False for tf in REQUIRED_TIMEFRAMES}
            logging.info(f"Nuevo activo detectado: {asset_name}. Estado de precarga inicializado.")
        return self.states[asset_name]

    def mark_as_received(self, asset_name, timeframe_seconds):
        if timeframe_seconds in REQUIRED_TIMEFRAMES:
            state = self._get_or_create_asset_state(asset_name)
            if not state[timeframe_seconds]:
                state[timeframe_seconds] = True
                logging.info(f"Precarga para {asset_name} en timeframe {timeframe_seconds}s [OK]")
                self.check_if_ready(asset_name)

    def is_ready(self, asset_name):
        state = self._get_or_create_asset_state(asset_name)
        return all(state.values())

    def check_if_ready(self, asset_name):
        if self.is_ready(asset_name):
            logging.warning(f"¡PRECARGA COMPLETA! El activo {asset_name} está listo. Se habilita el flujo de pips en tiempo real.")

class TCPServer:
    """Servidor TCP con búfer para enviar datos al bot de Node.js sin pérdidas."""
=======
# --- Logging ---
logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s - [%(levelname)s] - (Harvester) - %(message)s')

class TCPServer:
    """Un servidor TCP simple que maneja un único cliente (el bot de Node.js)."""
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.writer = None
<<<<<<< HEAD
        self.message_queue = asyncio.Queue()

    async def _sender_loop(self):
        logging.info("Bucle de envío iniciado. Esperando mensajes...")
        while True:
            message = await self.message_queue.get()
            sent = False
            while not sent:
                if self.writer and not self.writer.is_closing():
                    try:
                        message_str = f"{json.dumps(message)}\n"
                        self.writer.write(message_str.encode('utf-8'))
                        await self.writer.drain()
                        sent = True
                    except (ConnectionResetError, BrokenPipeError):
                        logging.error("Conexión con el bot de Node.js perdida mientras se enviaba. Esperando reconexión...")
                        self.writer = None
                if not sent:
                    await asyncio.sleep(0.5)
            self.message_queue.task_done()

    async def start(self):
        """Inicia el servidor, pero no bloquea. Devuelve la instancia del servidor."""
        asyncio.create_task(self._sender_loop())
        server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logging.info(f"Servidor TCP listo y escuchando en {self.host}:{self.port}")
        return server
=======
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logging.info(f"Servidor TCP listo y escuchando en {self.host}:{self.port}")
        async with self.server:
            await self.server.serve_forever()
>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71

    def handle_client(self, reader, writer):
        client_addr = writer.get_extra_info('peername')
        logging.info(f"Bot de Node.js conectado desde {client_addr}")
        self.writer = writer

<<<<<<< HEAD
    def send(self, data):
        try:
            self.message_queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            logging.error("La cola de mensajes está llena. Se descartó un mensaje.")
            return False

class WebSocketHarvester:
    """Cosechador Inteligente que entiende tanto paquetes históricos como pips en tiempo real."""
    def __init__(self, tcp_server):
        self.tcp_server = tcp_server
        self.asset_manager = AssetStateManager()

    def _parse_data(self, payload_str):
        """
        Parsea la cadena de texto, detectando si es un paquete histórico (diccionario)
        o un pip en tiempo real (lista).
        """
        try:
            clean_payload_str = payload_str.lstrip('\x00\x04')
            data = json.loads(clean_payload_str)

            # Formato 1: Paquete histórico (es un diccionario)
            if isinstance(data, dict):
                timeframe = data.get("period")
                asset = data.get("asset")
                pips = data.get("history")
                candles = data.get("candles")
                if all((timeframe, asset, pips, candles is not None)):
                    return "historical", {"tf": timeframe, "asset": asset, "pips": pips, "candles": candles}
            
            # Formato 2: Pip en tiempo real (es una lista)
            elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                pip_data = data[0]
                if len(pip_data) >= 3:
                    asset = pip_data[0]
                    timestamp = pip_data[1]
                    price = pip_data[2]
                    return "realtime_pip", {"asset": asset, "timestamp": timestamp, "price": price}

        except (json.JSONDecodeError, AttributeError, IndexError):
            pass
        
        return None, None

    async def on_websocket_frame(self, payload):
        """Se ejecuta cada vez que se recibe un mensaje del WebSocket."""
        if not isinstance(payload, bytes):
            return

        decoded_payload = payload.decode('utf-8', errors='ignore')
        msg_type, data = self._parse_data(decoded_payload)

        if not msg_type:
            return

        if msg_type == "historical":
            asset = data["asset"]
            timeframe = data["tf"]
            logging.info(f"Paquete histórico recibido para {asset} con timeframe {timeframe}s.")
            
            if timeframe in REQUIRED_TIMEFRAMES and not self.asset_manager.states.get(asset, {}).get(timeframe, False):
                candles = data["candles"]
                pips = data["pips"]
                formatted_candles = [{'time': c[0], 'open': c[1], 'close': c[2], 'high': c[3], 'low': c[4], 'volume': c[5]} for c in candles]
                message = {"type": "historical-candles", "payload": {"asset": asset, "timeframe": timeframe, "candles": formatted_candles}}
                
                if self.tcp_server.send(message):
                    logging.info(f"Encolado paquete histórico de {len(formatted_candles)} velas para {asset} ({timeframe}s).")
                
                self.asset_manager.mark_as_received(asset, timeframe)

                if timeframe == 60:
                    logging.info(f"Encolando {len(pips)} pips de reanudación para {asset} (1m)...")
                    for pip in pips:
                        pip_message = {"type": "pip", "payload": {"asset": asset, "price": pip[1], "timestamp": pip[0]}}
                        self.tcp_server.send(pip_message)

        elif msg_type == "realtime_pip":
            asset = data["asset"]
            if self.asset_manager.is_ready(asset):
                pip_message = {"type": "pip", "payload": data}
                self.tcp_server.send(pip_message)
                logging.debug(f"Pip en tiempo real para {asset} encolado: {data['price']}")

    def setup_websocket_listener(self, ws):
        if WEBSOCKET_URL_FRAGMENT in ws.url:
            logging.info(f"Enganchado al WebSocket de datos: {ws.url}")
            ws.on("framereceived", lambda payload: asyncio.create_task(self.on_websocket_frame(payload)))

    async def start(self):
        logging.info("Iniciando Cosechador Inteligente con Playwright...")
        async with async_playwright() as p:
            try:
                browser = await p.chromium.connect_over_cdp(BROWSER_CDP_ENDPOINT)
                logging.info("Conectado al navegador existente correctamente.")
            except Exception as e:
                logging.critical(f"No se pudo conectar al navegador. Asegúrate de que Chrome/Chromium esté corriendo con --remote-debugging-port=9222. Error: {e}")
                return

            context = browser.contexts[0]
            page = await context.new_page()
            page.on("websocket", self.setup_websocket_listener)
            
            logging.info(f"Navegando a la página del broker ({BROKER_URL_FRAGMENT}) para iniciar la captura de tráfico de red...")
            try:
                await page.goto(f"https://{BROKER_URL_FRAGMENT}", wait_until="networkidle", timeout=60000)
                logging.info("Cosechador listo y escuchando activamente el tráfico de red.")
            except Exception as e:
                logging.error(f"No se pudo navegar a la página del broker. ¿Hay conexión a internet? Error: {e}")

            await asyncio.Event().wait()

async def main():
    """Función que organiza e inicia todas las tareas asíncronas con pausa de control."""
    tcp_server = TCPServer(TCP_HOST, TCP_PORT)
    harvester = WebSocketHarvester(tcp_server)
    
    # Inicia el servidor TCP y obtiene la instancia
    server = await tcp_server.start()

    # --- PAUSA PARA CONTROL MANUAL ---
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: input("\n*** Presiona ENTER para que el Harvester comience a capturar datos del WebSocket... ***\n"))
    
    # Ahora, inicia las tareas del cosechador y del servidor en paralelo
    server_task = asyncio.create_task(server.serve_forever())
    harvester_task = asyncio.create_task(harvester.start())
    
=======
    async def send(self, data_type, payload):
        """Envía datos al cliente Node.js conectado."""
        if self.writer and not self.writer.is_closing():
            try:
                message_obj = {"type": data_type, "payload": payload}
                message_str = json.dumps(message_obj) + '
'
                self.writer.write(message_str.encode('utf-8'))
                await self.writer.drain()
                return True
            except (ConnectionResetError, BrokenPipeError):
                logging.error("Conexión con Node.js perdida. Esperando nueva conexión.")
                self.writer = None
                return False
        return False

class WebSocketHarvester:
    """Se conecta al navegador, espía el WebSocket y envía los datos al TCPServer."""
    def __init__(self, tcp_server):
        self.tcp_server = tcp_server

    async def on_websocket_frame(self, payload):
        """Procesa un frame del WebSocket y lo envía por TCP si es relevante."""
        try:
            if not payload.startswith('42'):
                return

            message = json.loads(payload[2:])
            event_name, data = message[0], message[1]

            if event_name == 'pip':
                formatted_payload = {
                    "price": data.get("price"),
                    "rawAsset": data.get("asset"),
                    "timestamp": data.get("created_at")
                }
                await self.tcp_server.send("pip", formatted_payload)

            elif event_name == 'candles-generated':
                logging.info(f"Cosechado paquete histórico para {data.get('asset')}")
                await self.tcp_server.send("historical-candles", data)

        except Exception:
            pass # Ignorar errores de parseo silenciosamente

    def setup_websocket_listener(self, ws):
        """Se engancha a un nuevo WebSocket si es el que buscamos."""
        if WEBSOCKET_URL_FRAGMENT in ws.url:
            logging.info(f"Enganchado al WebSocket de datos: {ws.url}")
            ws.on("framereceived", self.on_websocket_frame)

    async def start(self):
        """Función principal para iniciar el cosechador."""
        logging.info("Iniciando Cosechador de WebSockets...")
        async with async_playwright() as p:
            try:
                browser = await p.chromium.connect_over_cdp(BROWSER_CDP_ENDPOINT)
                logging.info(f"Conectado al navegador en {BROWSER_CDP_ENDPOINT}")
            except Exception as e:
                logging.critical(f"No se pudo conectar al navegador. Asegúrate de que Chrome esté corriendo con --remote-debugging-port=9222. Error: {e}")
                return

            context = browser.contexts[0]
            
            audit_page = await context.new_page()
            logging.info("Página de auditoría dedicada creada.")
            
            audit_page.on("websocket", self.setup_websocket_listener)
            
            await audit_page.goto(f"https://{BROKER_URL_FRAGMENT}", wait_until="networkidle")
            logging.info(f"Página de auditoría navegada a {audit_page.url()}")
            logging.info("Cosechador listo y escuchando. El bot de Node.js ya puede conectarse.")
            
            await asyncio.Event().wait()

async def main():
    tcp_server = TCPServer(TCP_HOST, TCP_PORT)
    harvester = WebSocketHarvester(tcp_server)

    server_task = asyncio.create_task(tcp_server.start())
    harvester_task = asyncio.create_task(harvester.start())

>>>>>>> dba811d02d2d22e0ea200085ea62279714750e71
    await asyncio.gather(server_task, harvester_task)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Cosechador detenido por el usuario.")
