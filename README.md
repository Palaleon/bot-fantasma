?? Bot Fantasma v2.1 - Plataforma de Trading Inteligente Multi-Canal con WebSocket NativoBot de trading aut�nomo que intercepta directamente el WebSocket del broker para m�xima velocidad y fiabilidad, sin dependencias externas.?? ACTUALIZACI�N v2.1 - WebSocket NativoNuevas Caracter�sticas:WebSocketInterceptor: Interceptaci�n nativa del protocolo del broker.Sin Python: 100% JavaScript/Node.js.Latencia Ultra-baja: ~1ms (antes ~10ms con TCP).Sin Procesos Externos: Un �nico proceso Node.js.Arquitectura Simplificada: Menos componentes, menos puntos de falla.Arquitectura Actual:graph TD
    A[WebSocket Broker] -->|Binary Protocol| B[WebSocketInterceptor]
    B -->|Pips| C[PipReceiver]
    C -->|Candles| D[ChannelManager]
    D -->|Trading Channels| E[TradingChannel]
    E -->|Signals| F[Operator]
    F -->|Orders| G[BrokerConnector]
    F -->|Notifications| H[TelegramConnector]
?? Estructura de Archivos/bot-fantasma
+-- /config/                  # Gesti�n de configuraci�n centralizada
+-- /src/
�   +-- /connectors/          # Conectores (Broker, Telegram)
�   +-- /logic/               # L�gica de negocio (CandleBuilder)
�   +-- /modules/             # Componentes principales
�   �   +-- WebSocketInterceptor.js # [NUEVO] Interceptor nativo
�   �   +-- ChannelManager.js      # Coordinador de canales
�   �   +-- TradingChannel.js      # Pipeline por activo
�   �   +-- PipReceiver.js         # Receptor de pips (refactorizado)
�   �   +-- IndicatorEngine.js     # An�lisis t�cnico
�   �   +-- Humanizer.js           # Anti-detecci�n
�   �   +-- Operator.js            # Ejecutor de operaciones
�   +-- /utils/               # Utilidades (Logger, TimeUtils)
�
+-- .env.example              # Plantilla de configuraci�n
+-- .gitignore               
+-- app.js                    # Entrada principal
+-- package.json              # Dependencias
??? Instalaci�n y Configuraci�nRequisitos:Node.js v18+Chrome/Chromium con flag --remote-debugging-port=9222Pasos:Clonar el repositorio:git clone https://github.com/Palaleon/bot-fantasma.git
cd bot-fantasma
Instalar dependencias:npm install
Configurar variables de entorno:cp .env.example .env
# Editar .env con tus credenciales
Iniciar Chrome con debugging:# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Linux/Mac
google-chrome --remote-debugging-port=9222
Ejecutar el bot:npm start
? Caracter�sticas PrincipalesWebSocket NativoInterceptaci�n directa del protocolo binario del broker.Decodificaci�n as�ncrona sin bloquear el bot principal.Procesamiento en tiempo real con latencia m�nima.Sistema Multi-CanalArquitectura preparada para m�ltiples activos simult�neos.Cada canal con su propio pipeline de an�lisis.Aislamiento de fallos entre canales.Indicadores T�cnicosEMA (Exponential Moving Average) con cruces.Sistema extensible para m�s indicadores.An�lisis por temporalidad (1m, 5m, 15m).Sistema Anti-Detecci�nSimulaci�n de comportamiento humano.Delays y acciones aleatorias.L�mites de operaciones consecutivas.?? Monitoreo y M�tricasEl bot genera reportes autom�ticos cada minuto con:Pips procesados por segundo.Estado de cada canal de trading.Se�ales generadas y aprobadas.Estad�sticas del WebSocket.Comandos de Debug en Consola:// Ver estado del sistema
bot.getSystemStatus()

// Ver estad�sticas del WebSocket
bot.wsInterceptor.getStats()

// Activar modo multi-canal
bot.channelManager.setMultiChannelMode(true)
?? Migraci�n desde v2.0La migraci�n es autom�tica. Simplemente:Actualizar el c�digo.Eliminar pip_analyzer_bot.py y tcp_server.js.Reiniciar el bot.Cambios importantes:Ya NO se necesita ejecutar el analizador Python.El bot captura pips directamente del navegador.Configuraciones TCP eliminadas del .env.?? RendimientoComparaci�n v2.0 vs v2.1:M�tricav2.0 (TCP+Python)v2.1 (WebSocket Nativo)MejoraLatencia~10ms~1ms90% ?CPU100%60%40% ?RAM1GB500MB50% ?Procesos2150% ??? Soluci�n de ProblemasEl bot no captura pips:Verificar que Chrome est� en modo --remote-debugging-port=9222.Recargar la p�gina del broker.Verificar en consola: bot.wsInterceptor.getStats()Error de conexi�n:El bot se conecta autom�ticamente al navegador abierto.No requiere configuraci�n adicional de puertos.??? Roadmap[ ] v2.2: Indicadores adicionales (RSI, Bollinger Bands).[ ] v2.3: Machine Learning para predicci�n.[ ] v2.4: Dashboard web en tiempo real.[ ] v3.0: Soporte para m�ltiples brokers.?? LicenciaUNLICENSED - C�digo propietario.?? ContribucionesEste es un proyecto privado. Para contribuir, contactar al equipo de desarrollo.Bot Fantasma v2.1 - Trading inteligente con tecnolog�a WebSocket nativa ??