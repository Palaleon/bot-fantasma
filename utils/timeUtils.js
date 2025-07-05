
// Se establece un "tiempo cero" universal para todo el sistema.
// Esto garantiza que el cálculo de IDs sea determinista y consistente a través de reinicios y para datos históricos.
// La fecha es 1 de Enero de 2024, a medianoche UTC.
const GENESIS_TIME = 1704067200000; 

/**
 * Devuelve el timestamp de inicio de la vela a la que pertenece un timestamp dado.
 * @param {number} timestamp - El timestamp en milisegundos.
 * @param {number} durationMs - La duración de la vela en milisegundos.
 * @returns {number} - El timestamp de inicio de la vela.
 */
export function getCandleStartTimestamp(timestamp, durationMs) {
  return Math.floor(timestamp / durationMs) * durationMs;
}

/**
 * Mapeo de duraciones de velas estándar en milisegundos.
 * Se mantiene para compatibilidad y uso en todo el sistema.
 */
export const TIMEFRAMES = {
  '5s': 5 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
};

/**
 * Genera un ID de vela único y determinista basado en el timestamp.
 * Formato: {activo}-{timeframe}-{id_secuencial_desde_genesis}
 * @param {string} asset - El nombre del activo (ej. "EURUSD").
 * @param {string} timeframe - El timeframe de la vela (ej. "5s", "1m").
 * @param {number} timestamp - El timestamp (en ms) para el que se generará el ID.
 * @returns {string|null} - El ID de vela único y compuesto, o null si el timeframe no es válido.
 */
export function generateCandleId(asset, timeframe, timestamp) {
  const durationMs = TIMEFRAMES[timeframe];
  if (!durationMs) {
    return null; // Timeframe no válido
  }

  // Se calcula el inicio de la vela para asegurar que cualquier pip dentro de la misma vela tenga el mismo ID.
  const candleStart = getCandleStartTimestamp(timestamp, durationMs);
  
  // El ID secuencial es simplemente cuántas velas de esta duración han pasado desde el GÉNESIS.
  const sequentialId = Math.floor((candleStart - GENESIS_TIME) / durationMs);
  
  return `${asset}-${timeframe}-${sequentialId}`;
}

/**
 * Pre-calcula los IDs de todas las velas que serán afectadas por una operación, 
 * respetando los timestamps exactos de inicio y fin.
 * @param {string} asset - El activo de la operación.
 * @param {number} openTime - El timestamp exacto (ms) de apertura de la operación.
 * @param {number} durationSeconds - La duración de la operación en segundos.
 * @returns {object} - Un objeto con los IDs esperados para cada temporalidad estratégica.
 */
export function getExpectedCandleIds(asset, openTime, durationSeconds) {
    const expectedIds = {};
    const closeTime = openTime + durationSeconds * 1000;

    // Para cada timeframe que monitoreamos...
    for (const tf in TIMEFRAMES) {
        const tfDurationMs = TIMEFRAMES[tf];
        const ids = new Set(); // Usamos un Set para evitar duplicados automáticamente.

        // Calculamos el timestamp de inicio de la primera vela que la operación toca.
        let currentCandleStart = getCandleStartTimestamp(openTime, tfDurationMs);

        // Iteramos de vela en vela hasta superar el tiempo de cierre de la operación.
        while (currentCandleStart < closeTime) {
            const id = generateCandleId(asset, tf, currentCandleStart);
            if (id) {
                ids.add(id);
            }
            // Avanzamos al inicio de la siguiente vela.
            currentCandleStart += tfDurationMs;
        }

        expectedIds[tf] = Array.from(ids);
    }

    return expectedIds;
}
