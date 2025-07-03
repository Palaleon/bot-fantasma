import logger from '../utils/logger.js';
import ChannelWorker from './ChannelWorker.js';

/**
 * Gestiona y distribuye el trabajo de análisis entre múltiples ChannelWorkers,
 * asegurando que cada activo sea procesado en un canal aislado e independiente.
 */
class ChannelManager {
    constructor(getTime) {
        this.channels = {};
        this.getTime = getTime || (() => Date.now());
        logger.info('CHANNEL-MANAGER: Gestor de Canales v1.1 con Sincronización de Tiempo listo.');
    }

    /**
     * Obtiene el ChannelWorker para un activo específico. Si no existe,
     * tiene la opción de crearlo dinámicamente.
     * @param {string} asset - El nombre del activo a buscar (ej. "EURUSD_otc").
     * @param {boolean} [createIfNotExist=false] - Si es true, crea el worker si no se encuentra.
     * @returns {ChannelWorker|undefined} La instancia del ChannelWorker correspondiente o undefined.
     */
    getChannel(asset, createIfNotExist = false) {
        // Si no existe un canal para este activo y la bandera createIfNotExist es verdadera...
        if (!this.channels[asset] && createIfNotExist) {
            logger.info(`CHANNEL-MANAGER: No existe canal para ${asset}. Creando uno nuevo...`, { asset: asset });
            // ...se crea una nueva instancia de ChannelWorker y se almacena usando el nombre del activo como clave.
            this.channels[asset] = new ChannelWorker(asset, this.getTime);
        }
        // Devuelve el canal encontrado o recién creado.
        return this.channels[asset];
    }

    /**
     * Punto de entrada para las velas. Procesa una vela cerrada y la dirige
     * al ChannelWorker correcto para su análisis.
     * @param {object} candleData - El objeto de la vela proveniente del pip-worker.
     * @property {string} candleData.asset - El activo al que pertenece la vela.
     * @property {string} candleData.timeframe - La temporalidad de la vela (ej. "1m", "5s").
     * @returns {object|null} Una señal de trading si se genera una, de lo contrario null.
     */
    processCandle(candleData) {
        const { asset, timeframe } = candleData;
        
        // Verificación de seguridad para asegurar que la vela tiene la data mínima requerida.
        if (!asset || !timeframe) {
            logger.warn('CHANNEL-MANAGER: Recibida vela sin activo o temporalidad. Descartando.');
            return null;
        }

        // Obtiene el canal para el activo de la vela. Es crucial pasar 'true' para que
        // se cree un canal si es la primera vez que vemos este activo (post-arranque).
        const channel = this.getChannel(asset, true);

        if (channel) {
            // Delega el manejo de la vela al ChannelWorker específico del activo.
            // Este worker contiene su propio IndicatorEngine y gestiona su propio estado.
            const signal = channel.handleCandle(candleData);
            
            if (signal) {
                // Si el worker generó una señal, la notifica y la propaga hacia arriba.
                logger.warn(`CHANNEL-MANAGER: ¡SEÑAL GENERADA por ${asset} en temporalidad ${timeframe}!`, { asset: asset });
                return signal;
            }
        }
        
        // Si no se generó ninguna señal, devuelve null.
        return null;
    }
}

export default ChannelManager;