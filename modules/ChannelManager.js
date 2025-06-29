import logger from '../utils/logger.js';
import ChannelWorker from './ChannelWorker.js';

class ChannelManager {
    constructor() {
        this.channels = {}; // Almacena un ChannelWorker por cada activo.
        logger.info('CHANNEL-MANAGER: Gestor de Canales inicializado.');
    }

    getChannel(asset, createIfNotExist = false) {
        if (!this.channels[asset] && createIfNotExist) {
            logger.info(`CHANNEL-MANAGER: Creando nuevo canal de trabajo para: ${asset}`);
            this.channels[asset] = new ChannelWorker(asset);
        }
        return this.channels[asset];
    }

    /**
     * Procesa una vela cerrada y la dirige al canal (y temporalidad) correcta.
     * @param {object} candleData - La vela cerrada desde pip-worker.
     * @returns La señal de trading si se genera una.
     */
    processCandle(candleData) {
        const { asset, timeframe } = candleData;
        
        if (!asset || !timeframe) {
            logger.warn('CHANNEL-MANAGER: Recibida vela sin activo o temporalidad. Descartando.');
            return null;
        }

        const channel = this.getChannel(asset, true);

        if (channel) {
            // El ChannelWorker ahora es responsable de manejar las diferentes temporalidades.
            const signal = channel.handleCandle(candleData);
            
            if (signal) {
                logger.warn(`CHANNEL-MANAGER: ¡SEÑAL GENERADA por ${asset} en temporalidad ${timeframe}!`);
                return signal;
            }
        }
        
        return null;
    }
}

export default ChannelManager;
