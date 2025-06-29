import asyncio
import json
import logging
from playwright.async_api import async_playwright

# --- Configuración ---
LOG_LEVEL = logging.INFO
TCP_HOST = "127.0.0.1"
TCP_PORT = 8765
BROWSER_CDP_ENDPOINT = "http://localhost:9222"
BROKER_URL_FRAGMENT = "qxbroker.com/es/trade"
WEBSOCKET_URL_FRAGMENT = "ws2.qxbroker.com/socket.io"

# --- Logging ---
logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s - [%(levelname)s] - (Harvester) - %(message)s')

class TCPServer:
    """Un servidor TCP simple que maneja un único cliente (el bot de Node.js)."""
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.writer = None
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logging.info(f"Servidor TCP listo y escuchando en {self.host}:{self.port}")
        async with self.server:
            await self.server.serve_forever()

    def handle_client(self, reader, writer):
        client_addr = writer.get_extra_info('peername')
        logging.info(f"Bot de Node.js conectado desde {client_addr}")
        self.writer = writer

    async def send(self, data_type, payload):
        """Envía datos al cliente Node.js conectado."""
        if self.writer and not self.writer.is_closing():
            try:
                message_obj = {"type": data_type, "payload": payload}
                message_str = f"{json.dumps(message_obj)}\n"
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
        # --- Manejo de frames de texto (eventos como candles-generated) ---
        if isinstance(payload, str) and payload.startswith('42'):
            try:
                message = json.loads(payload[2:])
                event_name, data = message[0], message[1]

                if event_name == 'candles-generated':
                    logging.info(f"Cosechado paquete histórico para {data.get('asset')}")
                    await self.tcp_server.send("historical-candles", data)

            except (json.JSONDecodeError, IndexError):
                pass # Ignorar errores de parseo en frames de texto

        # --- Manejo de frames binarios (pips en tiempo real) ---
        elif isinstance(payload, bytes) and len(payload) > 1:
            try:
                json_string = payload[1:].decode('utf-8')
                data = json.loads(json_string)

                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                    pip_data_array = data[0]

                    if len(pip_data_array) >= 3:
                        asset_name = str(pip_data_array[0])
                        pip_value = float(pip_data_array[2])

                        logging.info(f"Pip recibido para {asset_name}: {pip_value}")

                        formatted_payload = {
                            "price": pip_value,
                            "rawAsset": asset_name,
                            "timestamp": int(pip_data_array[1])
                        }
                        await self.tcp_server.send("pip", formatted_payload)

            except (json.JSONDecodeError, UnicodeDecodeError, IndexError, ValueError):
                pass # Ignorar errores de parseo en frames binarios

    def setup_websocket_listener(self, ws):
        """Se engancha a un nuevo WebSocket si es el que buscamos."""
        if WEBSOCKET_URL_FRAGMENT in ws.url:
            logging.info(f"Enganchado al WebSocket de datos: {ws.url}")
            # Usamos asyncio.create_task para no bloquear el listener
            ws.on("framereceived", lambda payload: asyncio.create_task(self.on_websocket_frame(payload)))

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
            
            # --- PAUSA ANTES DE LA CAPTURA ---
            logging.info("---------------------------------------------------------------------------")
            logging.info("Harvester en pausa. El servidor TCP está listo para recibir conexiones.")
            logging.info("Inicia tu bot de Node.js ahora para que pueda conectarse.")
            logging.info("Una vez conectado, presiona 'Enter' en esta terminal para comenzar la captura.")
            logging.info("---------------------------------------------------------------------------")
            
            # Espera a que el usuario presione Enter de forma asíncrona
            await asyncio.to_thread(input)
            
            logging.info("Enter presionado. Reanudando e iniciando la captura de datos...")
            
            audit_page.on("websocket", self.setup_websocket_listener)
            
            await audit_page.goto(f"https://{BROKER_URL_FRAGMENT}", wait_until="networkidle")
            logging.info(f"Página de auditoría navegada a {audit_page.url}")
            
            logging.info("Forzando recarga para asegurar la captura del WebSocket...")
            await audit_page.reload(wait_until="networkidle")
            
            logging.info("Cosechador listo y escuchando activamente.")
            
            await asyncio.Event().wait()

async def main():
    tcp_server = TCPServer(TCP_HOST, TCP_PORT)
    harvester = WebSocketHarvester(tcp_server)

    server_task = asyncio.create_task(tcp_server.start())
    harvester_task = asyncio.create_task(harvester.start())

    await asyncio.gather(server_task, harvester_task)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Cosechador detenido por el usuario.")
