import logger from '../utils/logger.js';

const REQUIRED_TIMEFRAMES = new Set([60, 300, 600, 900, 1800]); // 1m, 5m, 10m, 15m, 30m

/**
 * Gestiona el estado de precarga de velas históricas para cada activo.
 * Asegura que el bot no opere hasta que todos los datos iniciales requeridos
 * hayan sido recibidos y procesados.
 */
export class AssetStateManager {
    constructor() {
        this.states = {}; // Ej: { "USDTRY_otc": { 60: true, 300: false, ... } }
        logger.info("Gestor de Estado de Activos inicializado.");
    }

    _getOrCreateAsset(assetName) {
        if (!this.states[assetName]) {
            this.states[assetName] = {};
            REQUIRED_TIMEFRAMES.forEach(tf => {
                this.states[assetName][tf] = false;
            });
            logger.info(`Nuevo activo detectado: ${assetName}. Estado de precarga inicializado.`);
        }
        return this.states[assetName];
    }

    /**
     * Marca un timeframe como recibido para un activo específico.
     * @param {string} assetName - El nombre del activo (ej. "USDTRY_otc").
     * @param {number} timeframe - El timeframe en segundos (ej. 60).
     */
    markReceived(assetName, timeframe) {
        if (!REQUIRED_TIMEFRAMES.has(timeframe)) return;

        const state = this._getOrCreateAsset(assetName);
        if (!state[timeframe]) {
            state[timeframe] = true;
            logger.info(`Precarga para ${assetName} en timeframe ${timeframe}s [OK]`);
            this.checkIfReady(assetName);
        }
    }

    /**
     * Verifica si un timeframe es uno de los requeridos para la precarga.
     * @param {number} timeframe - El timeframe en segundos.
     * @returns {boolean}
     */
    isRequired(timeframe) {
        return REQUIRED_TIMEFRAMES.has(timeframe);
    }

    /**
     * Verifica si un timeframe específico ya ha sido recibido para un activo.
     * @param {string} assetName
     * @param {number} timeframe
     * @returns {boolean}
     */
    isReceived(assetName, timeframe) {
        const state = this._getOrCreateAsset(assetName);
        return state[timeframe];
    }

    /**
     * Verifica si un activo ha completado toda la precarga requerida.
     * @param {string} assetName
     * @returns {boolean}
     */
    isReady(assetName) {
        const state = this.states[assetName];
        if (!state) return false;
        return Array.from(REQUIRED_TIMEFRAMES).every(tf => state[tf]);
    }

    checkIfReady(assetName) {
        if (this.isReady(assetName)) {
            logger.warn(`¡PRECARGA COMPLETA! El activo ${assetName} está listo. Flujo de pips en tiempo real habilitado.`);
        }
    }
}
