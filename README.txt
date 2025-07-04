## Bot Fantasma v15.0 - El Intérprete del Flujo

Bot de trading autónomo que utiliza una arquitectura de análisis de doble flujo (estratégico y táctico) para combinar la fiabilidad del análisis de velas cerradas con la agilidad del análisis en tiempo real.

### Arquitectura y Mejoras Clave (v15.0)

1.  **NUEVO: Análisis Táctico Intra-Vela:**
    - El bot ahora analiza cada tick a medida que la vela se forma, permitiéndole reaccionar instantáneamente a los cambios del mercado.
    - Se ha implementado una lógica de "análisis hipotético" que calcula indicadores en tiempo real sin corromper el historial de datos permanente, garantizando la seguridad y la integridad.
    - Permite la identificación de oportunidades de alta frecuencia como pullbacks y rupturas incipientes que antes eran invisibles.

2.  **Arquitectura de Doble Flujo:**
    - **Flujo Estratégico:** El sistema tradicional de análisis sobre velas cerradas se mantiene intacto para garantizar señales de alta fiabilidad y confirmación.
    - **Flujo Táctico:** El nuevo sistema de análisis de "velas vivas" opera en paralelo, proporcionando velocidad y sensibilidad al mercado.

3.  **Sincronizador de Tiempo Dinámico:**
    - Se mantiene el sistema de calibración de tiempo con el bróker, asegurando que ambos flujos de análisis operen sobre una línea de tiempo de alta precisión.

4.  **`Humanizer` como Punto de Control Unificado:**
    - Todas las señales, tanto estratégicas como tácticas, son evaluadas por el `Humanizer`, que actúa como un guardián final para aplicar la disciplina y seleccionar solo las mejores oportunidades.

### Flujo de Datos de Doble Vía

```mermaid
graph TD
    subgraph Captura y Construcción
        A[WebSocket Broker] -->|Pip con Timestamp| B(TCPConnector)
        B --> C{pip-worker}
        C --> D[CandleBuilder]
    end

    subgraph Flujo Estratégico (Velas Cerradas)
        D --o|1. candleClosed| E(analysis-worker)
        E --> F[ChannelManager]
        F --> G[ChannelWorker]
        G --> H((IndicatorEngine - Guarda Estado))
        H --> I{Señal Estratégica}
    end

    subgraph Flujo Táctico (Velas Vivas)
        D --o|2. candleUpdated| J(analysis-worker)
        J --> K[ChannelManager]
        K --> L[ChannelWorker]
        L --> M((IndicatorEngine - Análisis Hipotético))
        M --> N{Señal Táctica}
    end

    subgraph Decisión Final
        I --> O(Humanizer)
        N --> O
        O --> P[Operator]
        P --> Q[Ejecución]
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
