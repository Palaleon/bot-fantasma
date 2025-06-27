# Sistema de Auto-Optimización del Bot Fantasma

## 🧠 Visión General

El sistema de auto-optimización es la capacidad del bot para aprender de sus propios resultados y adaptar su comportamiento automáticamente cuando el rendimiento cae por debajo de los umbrales esperados.

## 📊 Componentes Principales

### 1. **Captura de Resultados (WebSocket)**
- El `WebSocketInterceptor` captura los mensajes de resultado cuando una operación termina
- Cada resultado incluye: `profit`, `percentProfit`, `asset`, `openPrice`, `closePrice`
- Los resultados se propagan a través del sistema: WebSocket → PipReceiver → ChannelManager → Humanizer

### 2. **Memoria y Estado Persistente**
- **StateManager**: Guarda y carga el estado del bot en `trading_persona.json`
- **Historial de Trades**: Registro completo de todas las operaciones
- **Actividad Semanal**: Organizada por día/hora para detectar patrones temporales

### 3. **Sistema de Personalidad Adaptativa**
Estados emocionales del bot:
- **CALM**: Estado neutral (factor de inversión: 1.0)
- **EUPHORIC**: Después de 3+ victorias (factor: hasta 2.0)
- **CAUTIOUS**: Después de 3+ derrotas (factor: hasta 0.5)
- **FRUSTRATED**: Después de 2 derrotas (comportamiento más selectivo)

### 4. **Focus Funnel (Sistema de Decisión)**
- **Ventana de Decisión**: 2 segundos para recopilar oportunidades
- **Scoring Multi-Factor**:
  - Confianza de la señal (40%)
  - Alineación con personalidad (30%)
  - Novedad del activo (20%)
  - Contexto temporal (10%)
- **Decisión Única**: Selecciona la mejor oportunidad y descarta las demás

### 5. **Protocolo de Auto-Optimización**

Cuando la tasa de éxito cae por debajo del 55%:

1. **Análisis de Patrones de Pérdida**
   - Por activo (¿qué pares fallan más?)
   - Por horario (¿cuándo perdemos más?)
   - Por personalidad (¿qué estado emocional falla?)
   - Por confianza promedio

2. **Generación de Queries de Búsqueda**
   - Basadas en el contexto actual del mercado
   - Específicas para activos problemáticos
   - Adaptadas al estado emocional

3. **Búsqueda de Insights** (Simulada actualmente)
   - Nuevas estrategias
   - Gestión de riesgo
   - Tips psicológicos
   - Condiciones de mercado

4. **Adaptación del Comportamiento**
   - Restricciones horarias
   - Ajuste de ventana de decisión
   - Modificación de umbrales de confianza
   - Sesgo contra activos problemáticos

## 🚀 Cómo Usar

### Configuración Básica

1. El sistema se activa automáticamente al iniciar el bot
2. Para habilitar la API de monitoreo, agregar al `.env`:
   ```
   ENABLE_OPTIMIZATION_API=true
   ```

### API de Monitoreo (Puerto 3001)

**Endpoints disponibles:**
- `GET /metrics` - Métricas actuales del sistema
- `GET /history?limit=50` - Historial de operaciones
- `GET /state` - Estado completo del bot
- `POST /optimize` - Forzar optimización manual
- `POST /reset-restrictions` - Resetear todas las restricciones
- `POST /set-personality` - Cambiar estado emocional

**Ejemplo de uso:**
```bash
# Ver métricas actuales
curl http://localhost:3001/metrics

# Forzar optimización
curl -X POST http://localhost:3001/optimize

# Cambiar personalidad a CAUTIOUS
curl -X POST http://localhost:3001/set-personality \
  -H "Content-Type: application/json" \
  -d '{"state": "CAUTIOUS"}'
```

### Prueba del Sistema

Ejecutar el script de prueba:
```bash
node test-optimization.js
```

## 📈 Métricas Clave

### Tasa de Éxito
- Calculada sobre las últimas 50 operaciones
- Umbral mínimo: 55%
- Dispara optimización automática si cae por debajo

### Factores de Inversión
- **Normal**: 1.0x
- **Eufórico**: Hasta 2.0x
- **Cauteloso**: Hasta 0.5x

### Restricciones Adaptativas
- **Horarias**: Evita operar en horas problemáticas
- **Por Activo**: Limita operaciones en activos con mal desempeño
- **Por Repetición**: Máximo 3 operaciones consecutivas en el mismo activo

## 🔧 Personalización

### Ajustar Umbrales
En `Humanizer.js`:
```javascript
this.successRateWindow = 50; // Ventana de cálculo
this.successRateThreshold = 0.55; // Umbral mínimo
```

### Modificar Pesos del Scoring
En `_calculateInterestScore()`:
```javascript
let score = signal.confidence * 0.4; // Peso de confianza
score += personalityMultiplier * 0.3; // Peso de personalidad
score += assetNovelty * 0.2; // Peso de novedad
score += temporalContext * 0.1; // Peso temporal
```

## 🎯 Mejores Prácticas

1. **Dejar que el sistema aprenda**: No resetear restricciones frecuentemente
2. **Monitorear regularmente**: Usar la API para verificar el estado
3. **Ajustar según el mercado**: Los umbrales pueden necesitar ajustes según volatilidad
4. **Backup del estado**: Guardar copias de `trading_persona.json` periódicamente

## 🚨 Troubleshooting

### El bot no mejora su rendimiento
1. Verificar que los resultados se estén capturando correctamente
2. Revisar el historial de trades en la API
3. Comprobar que las restricciones no sean demasiado estrictas

### La optimización no se activa
1. Verificar que la tasa de éxito esté por debajo del umbral
2. Comprobar que no haya una optimización ya en progreso
3. Forzar manualmente vía API si es necesario

### Estado corrupto
1. Eliminar `trading_persona.json`
2. El bot creará un nuevo estado limpio
3. Perderás el historial pero el bot funcionará normalmente

## 🔮 Futuras Mejoras

1. **Integración real con API de búsqueda** para obtener insights reales
2. **Machine Learning** para predicción de patrones más complejos
3. **Backtesting automático** de nuevas estrategias
4. **Compartir aprendizajes** entre múltiples instancias del bot
5. **Visualización en tiempo real** del proceso de aprendizaje