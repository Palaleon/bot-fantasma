import asyncio
import json
import logging
import random
from playwright.async_api import async_playwright

# ==================================================================================================
# === DOCUMENTACIÓN PARA EL CLIENTE (app.js / bot de Node.js) ===
# ==================================================================================================
#
# (La documentación no cambia)
#
# ==================================================================================================


# --- Configuración ---
LOG_LEVEL = logging.INFO
TCP_HOST = "127.0.0.1"
TCP_PORT = 8765
BROWSER_CDP_ENDPOINT = "http://localhost:9222"
BROKER_URL_FRAGMENT = "qxbroker.com/es/trade"
WEBSOCKET_URL_FRAGMENT = "ws2.qxbroker.com/socket.io"

# Timeframes requeridos en segundos para la precarga de cada activo
REQUIRED_TIMEFRAMES = {60, 300, 600, 900, 1800} # 1m, 5m, 10m, 15m, 30m

# --- Configuración del Logging ---
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - [%(levelname)s] - (Harvester) - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# ==================================================================================================
# === ActiveAssetManager (ESTRATEGIA FINAL: CANAL LATERAL) ===
# ==================================================================================================
class ActiveAssetManager:
    """
    Utiliza un socket expuesto a través de un "canal lateral" para emitir mensajes.
    """
    def __init__(self):
        self.page = None
        self.active_assets = set()
        self.lock = asyncio.Lock()
        self.primer_activo_procesado = False # Flag para el primer activo
        logging.info("[ActiveManager] Inicializado en modo de canal lateral.")

    def set_page(self, page):
        """Recibe y almacena la página de Playwright."""
        self.page = page
        logging.info("[ActiveManager] Página de Playwright recibida.")

    def start_background_tasks(self):
        logging.info("[ActiveManager] Iniciando tareas de fondo (bucle de refresco).")
        asyncio.create_task(self._refresh_loop())

    async def send_message(self, message):
        """Ejecuta JS para enviar un mensaje a través del socket expuesto."""
        if not self.page:
            logging.warning("[ActiveManager] No se puede enviar mensaje, la página no está asignada.")
            return

        try:
            js_code = """
            (msg) => {
                if (window.harvesterSocket && typeof window.harvesterSocket.send === 'function') {
                    window.harvesterSocket.send(msg);
                    return true;
                }
                return false;
            }
            """
            success = await self.page.evaluate(js_code, message)
            if not success:
                logging.warning("[ActiveManager] No se pudo enviar mensaje: window.harvesterSocket no existe.")
        except Exception as e:
            logging.error(f"[ActiveManager] Error al ejecutar script en la página: {e}")

    def _get_warmup_sequence(self, asset_name, is_first_asset=False):
        """
        Genera la secuencia de calentamiento. Omite la temporalidad de 1m (60s) si es el primer activo.
        """
        def create_msg(event, data):
            return f'42{json.dumps([event, data], separators=(",", ":"))}'
        def get_settings_payload(chart_period):
            return {"chartId": "graph","settings": {"chartId": "graph", "chartType": 2, "currentExpirationTime": 1751338500,"isFastOption": False, "isFastAmountOption": False, "isIndicatorsMinimized": False,"isIndicatorsShowing": True, "isShortBetElement": False, "chartPeriod": chart_period,"currentAsset": {"symbol": asset_name}, "dealValue": 1, "dealPercentValue": 5,"isVisible": True, "timePeriod": 60, "gridOpacity": 0, "isAutoScrolling": True,"isOneClickTrade": True, "upColor": "#0FAF59", "downColor": "#FF6251"}}
        
        sequence = [
            create_msg("instruments/update", {"asset": asset_name, "period": 1800}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("settings/store", get_settings_payload(9)),
            create_msg("instruments/update", {"asset": asset_name, "period": 900}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("settings/store", get_settings_payload(8)),
            create_msg("instruments/update", {"asset": asset_name, "period": 600}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("settings/store", get_settings_payload(7)),
            create_msg("instruments/update", {"asset": asset_name, "period": 300}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("settings/store", get_settings_payload(6)), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}),
        ]

        if not is_first_asset:
             sequence.extend([
                create_msg("instruments/update", {"asset": asset_name, "period": 60}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}), create_msg("settings/store", get_settings_payload(4)),
            ])
        else:
            logging.warning(f"[ActiveManager] Se generó una secuencia de calentamiento para el primer activo ({asset_name}) omitiendo la temporalidad de 1m.")

        return sequence

    def _get_refresh_sequence(self, asset_name):
        def create_msg(event, data):
            return f'42{json.dumps([event, data], separators=(",", ":"))}'
        settings_payload = {"chartId": "graph","settings": {"chartId": "graph", "chartType": 2, "currentExpirationTime": 1751338500,"isFastOption": False, "isFastAmountOption": False, "isIndicatorsMinimized": False,"isIndicatorsShowing": True, "isShortBetElement": False, "chartPeriod": 4,"currentAsset": {"symbol": asset_name}, "dealValue": 1, "dealPercentValue": 5,"isVisible": True, "timePeriod": 60, "gridOpacity": 0, "isAutoScrolling": True,"isOneClickTrade": True, "upColor": "#0FAF59", "downColor": "#FF6251"}}
        return [
            create_msg("instruments/update", {"asset": asset_name, "period": 60}),
            create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}),
            create_msg("depth/unfollow", asset_name),
            create_msg("depth/follow", asset_name),
            create_msg("chart_notification/get", {"asset": asset_name, "version": "1.0.0"}),
            create_msg("settings/store", settings_payload),
        ]

    async def _run_sequence(self, sequence, sequence_name="secuencia"):
        logging.info(f"[ActiveManager] Ejecutando '{sequence_name}' de {len(sequence)} mensajes.")
        for msg in sequence:
            await self.send_message(msg)
            await asyncio.sleep(random.uniform(0.3, 0.8))

    async def _refresh_loop(self):
        while True:
            await asyncio.sleep(random.uniform(7 * 60, 15 * 60))
            if not self.active_assets:
                continue
            logging.info(f"[ActiveManager] Iniciando ciclo de refresco para {len(self.active_assets)} activo(s).")
            async with self.lock:
                assets_to_refresh = list(self.active_assets)
            for asset in assets_to_refresh:
                if not self.page:
                    logging.warning("[ActiveManager] Omitiendo refresco, la página no está disponible.")
                    break
                logging.info(f"[ActiveManager] Refrescando activo: {asset}")
                refresh_sequence = self._get_refresh_sequence(asset)
                await self._run_sequence(refresh_sequence, sequence_name="refresco")
                logging.info(f"[ActiveManager] Refresco para {asset} completado. Esperando para el siguiente.")
                await asyncio.sleep(random.uniform(60, 90))
            logging.info("[ActiveManager] Ciclo de refresco de todos los activos completado.")

    async def add_asset(self, asset_name):
        if not self.page:
            logging.error(f"[ActiveManager] No se puede procesar {asset_name}, la página no está asignada.")
            return

        try:
            await self.page.wait_for_function("() => window.harvesterSocket", timeout=15000)
        except Exception:
            logging.error(f"[ActiveManager] Timeout esperando por window.harvesterSocket. No se puede calentar {asset_name}.")
            return

        async with self.lock:
            if asset_name not in self.active_assets:
                es_el_primero = not self.primer_activo_procesado
                
                logging.info(f"[ActiveManager] Procesando nuevo activo {asset_name} para calentamiento.")
                
                warmup_sequence = self._get_warmup_sequence(asset_name, is_first_asset=es_el_primero)
                
                await self._run_sequence(warmup_sequence, sequence_name="calentamiento")
                
                self.active_assets.add(asset_name)
                
                if es_el_primero:
                    self.primer_activo_procesado = True
                
                logging.info(f"[ActiveManager] Calentamiento para {asset_name} completado. Activo añadido a la lista de refresco.")

class AssetStateManager:
    def __init__(self, active_asset_manager=None):
        self.states = {}
        self.active_asset_manager = active_asset_manager
        logging.info("Gestor de Estado de Activos inicializado.")
    def _get_or_create_asset_state(self, asset_name):
        if asset_name not in self.states:
            self.states[asset_name] = {tf: False for tf in REQUIRED_TIMEFRAMES}
            self.states[asset_name]["_notified"] = False
            logging.info(f"Nuevo activo detectado: {asset_name}. Estado de precarga inicializado.")
            if self.active_asset_manager:
                logging.info(f"Enviando {asset_name} al ActiveAssetManager para procesar.")
                asyncio.create_task(self.active_asset_manager.add_asset(asset_name))
        return self.states[asset_name]
    def mark_as_received(self, asset_name, timeframe_seconds):
        if timeframe_seconds in REQUIRED_TIMEFRAMES:
            state = self._get_or_create_asset_state(asset_name)
            if not state.get(timeframe_seconds, False):
                logging.info(f"Precarga para {asset_name} en timeframe {timeframe_seconds}s [OK]")
                state[timeframe_seconds] = True
                self.check_if_ready(asset_name)
    def is_ready_for_pips(self, asset_name):
        return self.states.get(asset_name, {}).get("_notified", False)
    def check_if_ready(self, asset_name):
        state = self._get_or_create_asset_state(asset_name)
        if state.get("_notified", False): return
        if all(state.get(tf, False) for tf in REQUIRED_TIMEFRAMES):
            logging.warning(f"¡PRECARGA COMPLETA! El activo {asset_name} está listo. Se habilita el flujo de pips en tiempo real.")
            state["_notified"] = True

class TCPServer:
    def __init__(self, host, port):
        self.host, self.port = host, port
        self.writer = None
        self.message_queue = asyncio.Queue()
        self.ready_event = asyncio.Event()
    async def _sender_loop(self):
        logging.info("Bucle de envío iniciado. Esperando mensajes...")
        while True:
            message = await self.message_queue.get()
            sent = False
            while not sent:
                if self.writer and not self.writer.is_closing():
                    try:
                        self.writer.write(f"{json.dumps(message)}\n".encode('utf-8'))
                        await self.writer.drain()
                        sent = True
                    except (ConnectionResetError, BrokenPipeError):
                        logging.error("Conexión con el bot de Node.js perdida. Esperando reconexión...")
                        self.writer = None
                if not sent: await asyncio.sleep(0.5)
            self.message_queue.task_done()
    async def start(self):
        asyncio.create_task(self._sender_loop())
        server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logging.info(f"Servidor TCP listo y escuchando en {self.host}:{self.port}")
        self.ready_event.set()
        async with server: await server.serve_forever()
    def handle_client(self, reader, writer):
        client_addr = writer.get_extra_info('peername')
        logging.info(f"Bot de Node.js conectado desde {client_addr}")
        self.writer = writer
    def send(self, data):
        try:
            self.message_queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            logging.error("La cola de mensajes está llena. Se descartó un mensaje.")
            return False

class WebSocketHarvester:
    def __init__(self, tcp_server, asset_manager, active_asset_manager):
        self.tcp_server = tcp_server
        self.asset_manager = asset_manager
        self.active_asset_manager = active_asset_manager
        # --- INICIO DE LA MODIFICACIÓN ---
        # Registro para evitar paquetes históricos duplicados.
        self._sent_historical_packets = set()
        # --- FIN DE LA MODIFICACIÓN ---

    def _parse_data(self, payload_str):
        try:
            clean_payload_str = payload_str.lstrip('\x00\x04')
            data = json.loads(clean_payload_str)
            if isinstance(data, dict):
                timeframe, asset, pips, candles = data.get("period"), data.get("asset"), data.get("history"), data.get("candles")
                if all((timeframe, asset, pips is not None, candles is not None)):
                    return "historical", {"tf": timeframe, "asset": asset, "pips": pips, "candles": candles}
            elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                pip_data = data[0]
                if len(pip_data) >= 3:
                    asset, timestamp, price = pip_data[0], pip_data[1], pip_data[2]
                    return "realtime_pip", {"asset": asset, "timestamp": timestamp, "price": price}
        except (json.JSONDecodeError, AttributeError, IndexError, TypeError): pass
        return None, None
        
    async def on_websocket_frame(self, payload):
        if isinstance(payload, bytes): decoded_payload = payload.decode('utf-8', errors='ignore')
        elif isinstance(payload, str): decoded_payload = payload
        else: return
        
        msg_type, data = self._parse_data(decoded_payload)
        if not msg_type: return

        if msg_type == "historical":
            asset, timeframe = data["asset"], data["tf"]
            
            # --- INICIO DE LA MODIFICACIÓN ---
            # Crear un identificador único para el paquete basado en el activo y el periodo.
            packet_id = (asset, timeframe)

            # Verificar si este paquete ya fue enviado. Si es así, se omite y se registra.
            if packet_id in self._sent_historical_packets:
                logging.warning(f"Paquete histórico duplicado para {asset} ({timeframe}s) detectado. Se omite el envío.")
                return # Detener el procesamiento de este paquete duplicado.
            # --- FIN DE LA MODIFICACIÓN ---

            logging.info(f"Paquete histórico recibido para {asset} con timeframe {timeframe}s.")
            if timeframe in REQUIRED_TIMEFRAMES:
                self.asset_manager.mark_as_received(asset, timeframe)
                candles, pips = data["candles"], data["pips"]
                formatted_candles = [{'time': c[0], 'open': c[1], 'close': c[2], 'high': c[3], 'low': c[4], 'volume': c[5]} for c in candles]
                message = {"type": "historical-candles", "payload": {"asset": asset, "timeframe": timeframe, "candles": formatted_candles}}
                
                if self.tcp_server.send(message):
                    logging.info(f"Encolado paquete histórico de {len(formatted_candles)} velas para {asset} ({timeframe}s).")
                    
                    # --- INICIO DE LA MODIFICACIÓN ---
                    # Si el envío fue exitoso, se añade al registro para no volver a enviarlo.
                    self._sent_historical_packets.add(packet_id)
                    # --- FIN DE LA MODIFICACIÓN ---

                if timeframe == 60:
                    logging.info(f"Encolando {len(pips)} pips de reanudación para {asset} (1m)...")
                    for pip in pips: self.tcp_server.send({"type": "pip", "payload": {"asset": asset, "price": pip[1], "timestamp": pip[0]}})
        
        elif msg_type == "realtime_pip":
            if self.asset_manager.is_ready_for_pips(data["asset"]):
                self.tcp_server.send({"type": "pip", "payload": data})

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
                logging.critical(f"No se pudo conectar al navegador. Error: {e}")
                return
            context = browser.contexts[0] if browser.contexts else await browser.new_context()

            # --- INYECCIÓN DEL SCRIPT DE CAPTURA ---
            init_script = """
            (() => {
                if (WebSocket.prototype.originalSend) return;
                WebSocket.prototype.originalSend = WebSocket.prototype.send;
                WebSocket.prototype.send = function(data) {
                    if (!window.harvesterSocket) {
                        console.log('Harvester: Capturado el objeto WebSocket y asignado a window.harvesterSocket');
                        window.harvesterSocket = this;
                    }
                    WebSocket.prototype.originalSend.apply(this, arguments);
                };
            })();
            """
            await context.add_init_script(init_script)
            
            page = await context.new_page()
            
            self.active_asset_manager.set_page(page)
            
            page.on("websocket", self.setup_websocket_listener)
            
            logging.info(f"Navegando a la página del broker ({BROKER_URL_FRAGMENT})...")
            try:
                await page.goto(f"https://{BROKER_URL_FRAGMENT}", wait_until="networkidle", timeout=60000)
                logging.info("Página cargada completamente.")
            except Exception as e:
                logging.error(f"No se pudo navegar a la página del broker. Error: {e}")
                return

            logging.info("Cosechador listo y escuchando activamente.")
            await asyncio.Event().wait()

async def main():
    active_manager = ActiveAssetManager()
    asset_manager = AssetStateManager(active_asset_manager=active_manager)
    tcp_server = TCPServer(TCP_HOST, TCP_PORT)
    harvester = WebSocketHarvester(tcp_server, asset_manager, active_manager)

    active_manager.start_background_tasks()

    server_task = asyncio.create_task(tcp_server.start())
    await tcp_server.ready_event.wait()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, lambda: input(">>> Presiona ENTER para iniciar la recolección de datos del Harvester... ")
    )
    harvester_task = asyncio.create_task(harvester.start())
    await asyncio.gather(server_task, harvester_task)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Cosechador detenido por el usuario.")