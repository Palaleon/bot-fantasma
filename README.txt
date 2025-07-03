## Bot Fantasma v14.1 - Plataforma de Trading Sincronizada

Bot de trading autónomo que utiliza una arquitectura de análisis de contexto y un sistema de sincronización de tiempo dinámico para maximizar la precisión y fiabilidad de las operaciones.

### Arquitectura y Mejoras Clave (v14.1)

1.  **Sincronizador de Tiempo Dinámico:**
    - El bot calibra su reloj interno en tiempo real con cada pip recibido del bróker, eliminando el desfase de tiempo acumulado.
    - Todas las decisiones, desde la construcción de velas hasta la ejecución de órdenes, se basan en una única línea de tiempo de alta precisión, sincronizada con el mercado.

2.  **Análisis de Contexto de Mercado:**
    - El `IndicatorEngine` no solo busca señales, sino que entiende el contexto del mercado (tendencia vs. rango) usando el indicador ADX.
    - Las señales son filtradas y validadas según el régimen de mercado y la confluencia entre múltiples temporalidades, evitando trampas comunes.

3.  **Lógica de Decisión Calibrada:**
    - Los filtros de confianza han sido ajustados para ser estrictos pero realistas, permitiendo al bot capitalizar oportunidades válidas sin sufrir de "parálisis por perfección".

4.  **Arranque Autónomo con Login Asistido:**
    - El bot se ejecuta en una instancia de navegador independiente con un perfil dedicado, y solicita al usuario que inicie sesión manualmente para una máxima seguridad y simplicidad.

### Flujo de Datos Sincronizado

```mermaid
graph TD
    A[WebSocket Broker] -->|Pip con Timestamp Original| B(TCPConnector)
    B --> C(TimeSyncManager)
    B --> D{pip-worker}
    D -->|Velas Precisas| E{analysis-worker}
    E --> F[ChannelManager]
    F --> G[ChannelWorker por Activo]
    G --> H[IndicatorEngine]
    H --> I[Humanizer]
    I --> J[Operator]
    J --> K[BrokerConnector]
    J --> L[TelegramConnector]

    subgraph Sincronización
        C --Corrige el tiempo de--> D
        C --Corrige el tiempo de--> E
        C --Corrige el tiempo de--> J
    end
```

### Estructura del Proyecto

```
/bot-fantasma
├── /config/              # Configuración centralizada
├── /connectors/          # Conectores (TCP, Telegram)
├── /logic/               # Lógica de negocio y workers (pip-worker, analysis-worker)
├── /modules/             # Componentes principales (ChannelManager, IndicatorEngine, Operator)
├── /utils/               # Utilidades (Logger, StateManager, TimeSyncManager)
├── app.js                # Punto de entrada principal de la aplicación
├── harvester.py          # Script de Python que captura los datos del bróker
├── package.json          # Dependencias del proyecto
└── ...
```

### Instalación y Ejecución

**Requisitos:**
*   Node.js v18+
*   Python 3.8+
*   Navegador Brave

**Pasos:**

1.  **Instalar dependencias de Node.js:**
    ```bash
    npm install
    ```
2.  **Instalar dependencias de Python:**
    ```bash
    pip install asyncio playwright
    ```
3.  **Iniciar el Harvester (recolector de datos):**
    ```bash
    python harvester.py
    ```
4.  **Iniciar el Bot (en otra terminal):**
    ```bash
    npm start
    ```
    El bot abrirá una ventana de Brave. Inicie sesión en el bróker y luego presione Enter en la consola del bot para continuar.