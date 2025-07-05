## Bot Fantasma v16.0 - El Auditor

Bot de trading autónomo con una arquitectura de análisis de doble flujo (estratégico y táctico), potenciado por un sistema de Inteligencia Artificial completamente auditado y corregido para garantizar la máxima precisión y fiabilidad.

### Arquitectura y Mejoras Clave (v16.0)

1.  **Sistema de IA Auditado y Corregido:**
    -   Se han resuelto inconsistencias críticas en la captura y procesamiento de datos entre el entorno de producción (JavaScript) y el de entrenamiento (Python).
    -   El modelo de IA ahora se entrena de forma matemáticamente correcta, aprendiendo de manera equilibrada de victorias y derrotas.
    -   La interpretación de las predicciones de la IA en tiempo real es precisa, gracias a la correcta conversión de "logits" a probabilidades.

2.  **Análisis Táctico Intra-Vela:**
    -   El bot analiza cada tick a medida que la vela se forma, permitiendo reacciones instantáneas a los cambios del mercado.
    -   Utiliza un "análisis hipotético" para calcular indicadores en tiempo real sin corromper el historial de datos permanente.

3.  **Arquitectura de Doble Flujo:**
    -   **Flujo Estratégico:** Análisis robusto sobre velas cerradas para señales de alta fiabilidad.
    -   **Flujo Táctico:** Análisis ágil de "velas vivas" para sensibilidad y velocidad.

4.  **Sincronizador de Tiempo Dinámico:**
    -   Calibración de tiempo en tiempo real con el bróker para una precisión operativa superior.

5.  **`Humanizer` como Punto de Control Unificado:**
    -   Todas las señales son evaluadas por el `Humanizer`, que aplica disciplina y el veredicto de la IA para seleccionar las mejores oportunidades.

### Flujo de Datos de Doble Vía (Actualizado)

```mermaid
graph TD
    subgraph Captura y Construcción
        A[Harvester (Python)] -->|Pips/Velas Históricas| B(TCPConnector)
        B --> C{pip-worker}
        C --> D[CandleBuilder]
    end

    subgraph Flujo de Análisis
        D --o|Vela Cerrada| E(analysis-worker)
        D --o|Vela Viva| E
        E --> F[ChannelManager]
        F --> G[ChannelWorker]
        G --> H((IndicatorEngine))
        H --> I{Señal de Trading}
    end

    subgraph Decisión y Ejecución
        I --> J(Humanizer)
        J --> K[LearningManager (Consulta IA)]
        K --> J
        J --> L[Operator]
        L --> M[QXWebSocketTrader (Envía Orden)]
    end

    subgraph Aprendizaje y Retroalimentación
        M --> N[TradeResultManager (Rastrea Resultados)]
        N --> O[Humanizer (Procesa Resultado)]
        N --> P[LearningManager (Guarda Datos para Entrenamiento)]
        P --o Q[learning_data.jsonl]
    end

    subgraph Re-entrenamiento
        Q --> R[train_model.py]
        R --> S[model.onnx]
        S --> K
    end
```

### Estructura del Proyecto

```
/bot-fantasma
├── /config/              # Configuración centralizada
├── /connectors/          # Conectores (TCP, Telegram, Broker)
├── /logic/               # Lógica de negocio y workers (pip-worker, analysis-worker)
├── /model/               # Modelos de Machine Learning (model.onnx)
├── /modules/             # Componentes principales (ChannelManager, IndicatorEngine, Humanizer, LearningManager, Operator, TradeResultManager)
├── /utils/               # Utilidades (Logger, StateManager, TimeSyncManager, timeUtils)
├── app.js                # Punto de entrada principal de la aplicación
├── harvester.py          # Script de Python que captura los datos del bróker
├── package.json          # Dependencias del proyecto
├── learning_data.jsonl   # Datos de entrenamiento para el modelo de IA
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


SI QUIERES FORMAR PARTE DE ESTE PROYECTO CONMIGO ENVIAME UN MENSAJE AL TELEGRAM: https://t.me/Palaleon