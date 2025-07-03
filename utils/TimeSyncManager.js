// utils/TimeSyncManager.js
import logger from './logger.js';

/**
 * @class TimeSyncManager
 * @description Gestiona la sincronización del tiempo entre el bot y el servidor del bróker.
 * Su misión es calcular y mantener un desfase (offset) promedio entre el reloj local
 * y los timestamps que llegan del bróker. Esto permite al bot operar con una
 * noción del tiempo mucho más precisa y cercana a la realidad del mercado.
 */
class TimeSyncManager {
  constructor(smoothingFactor = 0.05) {
    // El desfase: la diferencia en milisegundos entre nuestro reloj y el del bróker.
    // Un valor positivo significa que nuestro reloj está adelantado al del bróker.
    this.offset = 0;

    // Factor de suavizado para la media móvil exponencial.
    // Un valor bajo da más peso a la historia (más suave).
    // Un valor alto da más peso a las mediciones recientes (más reactivo).
    this.smoothingFactor = smoothingFactor;

    this.lastBrokerTimestamp = 0;
    this.initialized = false;

    logger.info('[TimeSync] Sincronizador de Tiempo Dinámico inicializado.');
  }

  /**
   * Actualiza el desfase con cada nuevo pip recibido del bróker.
   * Utiliza una media móvil exponencial para suavizar el cálculo y evitar
   * que picos de latencia de red afecten drásticamente la sincronización.
   * @param {number} brokerTimestamp - El timestamp (en ms) que viene en el pip del bróker.
   */
  update(brokerTimestamp) {
    // Asegurarse de que el timestamp del bróker es un número válido y más reciente que el último.
    if (typeof brokerTimestamp !== 'number' || brokerTimestamp <= this.lastBrokerTimestamp) {
      return;
    }

    this.lastBrokerTimestamp = brokerTimestamp;
    const localTimestamp = Date.now();
    const currentOffset = localTimestamp - brokerTimestamp;

    if (!this.initialized) {
      // Para la primera medición, establecemos el desfase directamente.
      this.offset = currentOffset;
      this.initialized = true;
      logger.info(`[TimeSync] Primera sincronización completa. Desfase inicial: ${this.offset.toFixed(2)} ms.`);
    } else {
      // Aplicamos la media móvil exponencial para las siguientes mediciones.
      // offset = (alpha * nueva_medicion) + ((1 - alpha) * offset_anterior)
      this.offset = (this.smoothingFactor * currentOffset) + (1 - this.smoothingFactor) * this.offset;
    }
  }

  /**
   * Obtiene el tiempo actual del bot, corregido con el desfase calculado.
   * Esta es la función que el resto del sistema debe usar en lugar de Date.now().
   * @returns {number} El timestamp actual estimado del bróker.
   */
  getCorregido() {
    return Date.now() - this.offset;
  }

  /**
   * Devuelve el desfase actual para propósitos de logging o diagnóstico.
   * @returns {number} El desfase promedio actual en milisegundos.
   */
  getOffset() {
    return this.offset;
  }
}

// Exportamos una única instancia (Singleton) para que todo el bot comparta el mismo sincronizador.
const timeSyncManager = new TimeSyncManager();
export default timeSyncManager;
