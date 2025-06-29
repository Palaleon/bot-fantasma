## Bot Fantasma v4.0 - Plataforma de Trading Híbrida de Alta Frecuencia

Bot de trading autónomo que utiliza una arquitectura de análisis híbrida (Estratégico-Táctico) para maximizar la precisión de las señales. Intercepta directamente el WebSocket del broker para una latencia mínima y opera en un sistema multicanal concurrente.

### Arquitectura Híbrida v4.0

El núcleo del bot es el **IndicatorEngine v4.0**, que funciona en dos capas:

1.  **Capa Estratégica:** Analiza velas de largo plazo (1m, 5m, 15m) para identificar la tendencia general del mercado y las oportunidades de alta probabilidad.
2.  **Capa Táctica:** Utiliza velas de alta frecuencia (5s) para medir el "momentum" inmediato del mercado. Una señal estratégica solo se aprueba si el momentum táctico confirma la dirección, filtrando eficazmente las malas entradas.

**Flujo de Datos:**

```mermaid
graph TD
    A[WebSocket Broker] -->|Pips| B(PipReceiver)
    B --> C{pip-worker}
    C -->|Velas (5s, 1m, 5m, 15m)| D{analysis-worker}
    D --> E[ChannelManager]
    E --> F[TradingChannel por Activo]
    F --> G[IndicatorEngine v4.0 Híbrido]
    G --> H[Humanizer]
    H --> I[Operator]
    I --> J[BrokerConnector]
    I --> K[TelegramConnector]
```

### Estructura del Proyecto

```
/bot-fantasma
├── /config/              # Configuración centralizada
├── /connectors/          # Conectores (Broker, Telegram)
├── /logic/               # Lógica de negocio y workers
│   ├── analysis-worker.js  # Worker para el análisis de señales
│   ├── pip-worker.js       # Worker para la construcción de velas
│   └── CandleBuilder.js    # Lógica de construcción de velas
├── /modules/             # Componentes principales del bot
│   ├── IndicatorEngine.js  # [v4.0] Motor de análisis híbrido
│   ├── ChannelManager.js   # Gestor de canales de trading
│   ├── Humanizer.js        # Capa de "sentido común" y anti-detección
│   ├── Operator.js         # Ejecutor de operaciones
│   └── ...               # Otros módulos de soporte
├── /utils/               # Utilidades (Logger, StateManager, TimeUtils)
├── app.js                # Punto de entrada principal de la aplicación
├── package.json          # Dependencias del proyecto
└── ...
```

### Instalación y Ejecución

**Requisitos:**
*   Node.js v18+
*   Una instancia de Chrome/Chromium ejecutándose con el flag `--remote-debugging-port=9222`

**Pasos:**

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/Palaleon/bot-fantasma.git
    cd bot-fantasma
    ```
2.  **Instalar dependencias:**
    ```bash
    npm install
    ```
3.  **Iniciar Chrome con el puerto de depuración:**
    *   **Windows:** `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`
    *   **Linux/Mac:** `google-chrome --remote-debugging-port=9222`
4.  **Iniciar el bot:**
    ```bash
    npm start
    ```

### Roadmap Futuro

- [ ] **Optimización Táctica:** Usar el flujo de pips en tiempo real para la ejecución de órdenes (actualmente se usa para construir velas).
- [ ] **Dashboard Web:** Crear una interfaz web para monitorear el estado del bot en tiempo real.
- [ ] **Machine Learning:** Integrar un modelo de ML para la ponderación dinámica de indicadores.
- [ ] **Soporte Multi-Broker:** Abstraer la lógica de conexión para soportar múltiples brokers.
