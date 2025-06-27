import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const defaultStateFilePath = path.join(process.cwd(), 'trading_persona.json');

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
 * @param {string} [filePath=defaultStateFilePath] - La ruta del archivo donde se guardará el estado.
 */
function saveState(state, filePath = defaultStateFilePath) {
  try {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
    logger.debug(`[StateManager] Estado guardado exitosamente en ${path.basename(filePath)}.`);
  } catch (error) {
    logger.error(`[StateManager] Error al guardar el estado en ${path.basename(filePath)}:`, error);
  }
}

/**
 * Carga el estado del bot desde un archivo JSON.
 * Si el archivo no existe, devuelve un estado por defecto.
 * @param {string} [filePath=defaultStateFilePath] - La ruta del archivo desde donde se cargará el estado.
 * @returns {object} El estado cargado o el estado por defecto.
 */
function loadState(filePath = defaultStateFilePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      logger.info(`[StateManager] Estado anterior cargado desde ${path.basename(filePath)}.`);
      return JSON.parse(data);
    } else {
      logger.warn(`[StateManager] No se encontró ${path.basename(filePath)}. Se usará un estado por defecto.`);
      return defaultState;
    }
  } catch (error) {
    logger.error('[StateManager] Error al cargar el estado, usando estado por defecto:', error);
    return defaultState;
  }
}

export { saveState, loadState };
