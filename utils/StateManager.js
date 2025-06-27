import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const stateFilePath = path.join(process.cwd(), 'trading_persona.json');

const defaultState = {
  persona: {
    state: 'CALM',
    winStreak: 0,
    lossStreak: 0,
    investmentFactor: 1.0,
  },
  weeklyActivity: {
    Monday: {},
    Tuesday: {},
    Wednesday: {},
    Thursday: {},
    Friday: {},
    Saturday: {},
    Sunday: {},
  },
  tradeHistory: [], // Mantendremos un historial plano para facilitar el acceso reciente
};

/**
 * Guarda el estado actual del bot en un archivo JSON.
 * @param {object} state - El objeto de estado completo a guardar.
 */
function saveState(state) {
  try {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(stateFilePath, data, 'utf8');
    logger.debug('[StateManager] Estado guardado exitosamente.');
  } catch (error) {
    logger.error('[StateManager] Error al guardar el estado:', error);
  }
}

/**
 * Carga el estado del bot desde un archivo JSON.
 * Si el archivo no existe, devuelve un estado por defecto.
 * @returns {object} El estado cargado o el estado por defecto.
 */
function loadState() {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf8');
      logger.info('[StateManager] Estado anterior cargado exitosamente.');
      return JSON.parse(data);
    } else {
      logger.warn('[StateManager] No se encontró archivo de estado. Creando uno nuevo.');
      return defaultState;
    }
  } catch (error) {
    logger.error('[StateManager] Error al cargar el estado, usando estado por defecto:', error);
    return defaultState;
  }
}

export { saveState, loadState };
