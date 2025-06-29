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
 */
export const TIMEFRAMES = {
  '5s': 5 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
};