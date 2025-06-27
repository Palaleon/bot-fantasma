?? Bot Fantasma v2.1 - Plataforma de Trading Inteligente Multi-Canal con WebSocket NativoBot de trading autónomo que intercepta directamente el WebSocket del broker para máxima velocidad y fiabilidad, sin dependencias externas.?? ACTUALIZACIÓN v2.1 - WebSocket NativoNuevas Características:WebSocketInterceptor: Interceptación nativa del protocolo del broker.Sin Python: 100% JavaScript/Node.js.Latencia Ultra-baja: ~1ms (antes ~10ms con TCP).Sin Procesos Externos: Un único proceso Node.js.Arquitectura Simplificada: Menos componentes, menos puntos de falla.Arquitectura Actual:graph TD
    A[WebSocket Broker] -->|Binary Protocol| B[WebSocketInterceptor]
    B -->|Pips| C[PipReceiver]
    C -->|Candles| D[ChannelManager]
    D -->|Trading Channels| E[TradingChannel]
    E -->|Signals| F[Operator]
    F -->|Orders| G[BrokerConnector]
    F -->|Notifications| H[TelegramConnector]
?? Estructura de Archivos/bot-fantasma
+-- /config/                  # Gestión de configuración centralizada
+-- /src/
¦   +-- /connectors/          # Conectores (Broker, Telegram)
¦   +-- /logic/               # Lógica de negocio (CandleBuilder)
¦   +-- /modules/             # Componentes principales
¦   ¦   +-- WebSocketInterceptor.js # [NUEVO] Interceptor nativo
¦   ¦   +-- ChannelManager.js      # Coordinador de canales
¦   ¦   +-- TradingChannel.js      # Pipeline por activo
¦   ¦   +-- PipReceiver.js         # Receptor de pips (refactorizado)
¦   ¦   +-- IndicatorEngine.js     # Análisis técnico
¦   ¦   +-- Humanizer.js           # Anti-detección
¦   ¦   +-- Operator.js            # Ejecutor de operaciones
¦   +-- /utils/               # Utilidades (Logger, TimeUtils)
¦
+-- .env.example              # Plantilla de configuración
+-- .gitignore               
+-- app.js                    # Entrada principal
+-- package.json              # Dependencias
??? Instalación y ConfiguraciónRequisitos:Node.js v18+Chrome/Chromium con flag --remote-debugging-port=9222Pasos:Clonar el repositorio:git clone https://github.com/Palaleon/bot-fantasma.git
cd bot-fantasma
Instalar dependencias:npm install
Configurar variables de entorno:cp .env.example .env
# Editar .env con tus credenciales
Iniciar Chrome con debugging:# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Linux/Mac
google-chrome --remote-debugging-port=9222
Ejecutar el bot:npm start
? Características PrincipalesWebSocket NativoInterceptación directa del protocolo binario del broker.Decodificación asíncrona sin bloquear el bot principal.Procesamiento en tiempo real con latencia mínima.Sistema Multi-CanalArquitectura preparada para múltiples activos simultáneos.Cada canal con su propio pipeline de análisis.Aislamiento de fallos entre canales.Indicadores TécnicosEMA (Exponential Moving Average) con cruces.Sistema extensible para más indicadores.Análisis por temporalidad (1m, 5m, 15m).Sistema Anti-DetecciónSimulación de comportamiento humano.Delays y acciones aleatorias.Límites de operaciones consecutivas.?? Monitoreo y MétricasEl bot genera reportes automáticos cada minuto con:Pips procesados por segundo.Estado de cada canal de trading.Señales generadas y aprobadas.Estadísticas del WebSocket.Comandos de Debug en Consola:// Ver estado del sistema
bot.getSystemStatus()

// Ver estadísticas del WebSocket
bot.wsInterceptor.getStats()

// Activar modo multi-canal
bot.channelManager.setMultiChannelMode(true)
?? Migración desde v2.0La migración es automática. Simplemente:Actualizar el código.Eliminar pip_analyzer_bot.py y tcp_server.js.Reiniciar el bot.Cambios importantes:Ya NO se necesita ejecutar el analizador Python.El bot captura pips directamente del navegador.Configuraciones TCP eliminadas del .env.?? RendimientoComparación v2.0 vs v2.1:Métricav2.0 (TCP+Python)v2.1 (WebSocket Nativo)MejoraLatencia~10ms~1ms90% ?CPU100%60%40% ?RAM1GB500MB50% ?Procesos2150% ??? Solución de ProblemasEl bot no captura pips:Verificar que Chrome esté en modo --remote-debugging-port=9222.Recargar la página del broker.Verificar en consola: bot.wsInterceptor.getStats()Error de conexión:El bot se conecta automáticamente al navegador abierto.No requiere configuración adicional de puertos.??? Roadmap[ ] v2.2: Indicadores adicionales (RSI, Bollinger Bands).[ ] v2.3: Machine Learning para predicción.[ ] v2.4: Dashboard web en tiempo real.[ ] v3.0: Soporte para múltiples brokers.?? LicenciaUNLICENSED - Código propietario.?? ContribucionesEste es un proyecto privado. Para contribuir, contactar al equipo de desarrollo.Bot Fantasma v2.1 - Trading inteligente con tecnología WebSocket nativa ??