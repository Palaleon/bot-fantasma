// /modules/Humanizer.js
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { saveState, loadState } from '../utils/StateManager.js';

function gaussianRandom(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + num * stdDev;
}

class Humanizer extends EventEmitter {
  constructor(telegramConnector) {
    super();
    this.state = loadState();
    this.state.persona = this.state.persona || { state: 'CALM', consecutiveWins: 0, consecutiveLosses: 0 };
    this.state.assetBehavior = this.state.assetBehavior || {};
    this.state.lastSignalPattern = this.state.lastSignalPattern || '';
    this.opportunityBuffer = [];
    this.isDeciding = false;
    this.decisionWindowMs = 2000;
    this.telegramConnector = telegramConnector;
    logger.info('Humanizer v8.1 (Psicologia Rentable) inicializado');
  }

  processTradeResult(tradeData) {
    const { isWin, signal } = tradeData;
    const { asset, triggeredBy, requestId } = signal;
    logger.info(`HUMANIZER (Aprendizaje): Resultado para ID [${requestId}] en ${asset} -> ${isWin ? 'GANADA' : 'PERDIDA'}`, { asset: asset });

    if (isWin) {
      this.state.persona.consecutiveLosses = 0;
      this.state.persona.consecutiveWins = (this.state.persona.consecutiveWins || 0) + 1;
      this.state.persona.state = this.state.persona.consecutiveWins >= 2 ? 'FOCUSED' : 'CALM';
      if (this.state.assetBehavior[asset]) {
        this.state.assetBehavior[asset].losses = 0;
      }
    } else {
      this.state.persona.consecutiveWins = 0;
      this.state.persona.consecutiveLosses = (this.state.persona.consecutiveLosses || 0) + 1;
      this.state.persona.state = this.state.persona.consecutiveLosses >= 2 ? 'CAUTIOUS' : 'CALM';
      
      if (!this.state.assetBehavior[asset]) this.state.assetBehavior[asset] = { losses: 0, probationEnd: 0 };
      this.state.assetBehavior[asset].losses++;
      
      if (this.state.assetBehavior[asset].losses >= 2) {
        const probationDuration = 15 * 60 * 1000;
        this.state.assetBehavior[asset].probationEnd = Date.now() + probationDuration;
        logger.warn(`HUMANIZER: El activo ${asset} entra en 'periodo de prueba' por 15 minutos.`, { asset: asset });
      }
    }
    
    this.state.lastSignalPattern = `${asset}-${triggeredBy}-${signal.decision}`;
    saveState(this.state);
    logger.warn(`HUMANIZER: Nuevo estado de personalidad -> ${this.state.persona.state}`);
  }

  analyzeSignal(signal) {
    this.opportunityBuffer.push(signal);
    if (!this.isDeciding) {
      this.isDeciding = true;
      setTimeout(() => this._makeFocusedDecision(), this.decisionWindowMs);
    }
  }

  async _makeFocusedDecision() {
    if (this.opportunityBuffer.length === 0) {
      this.isDeciding = false;
      return;
    }

    const bestOpportunity = this.opportunityBuffer.reduce((a, b) => a.confidence > b.confidence ? a : b);
    this.opportunityBuffer = [];
    this.isDeciding = false;

    if (this._isTradeApprovedByDiscipline(bestOpportunity)) {
        const executionParams = this._generateExecutionParams(bestOpportunity);
        
        // Añadimos el estado de la persona para que el Operador lo use en la notificación.
        const finalSignal = { 
            ...bestOpportunity, 
            executionParams, 
            timestamp: Date.now(),
            personaState: this.state.persona.state // <-- DATO CLAVE PARA EL OPERADOR
        };
        
        this.logApprovedTrade(finalSignal);
        this.emit('decisionFinal', { approved: true, signal: finalSignal });
        
        this.state.tradeHistory.push(finalSignal);
        saveState(this.state);
    }
  }

  _isTradeApprovedByDiscipline(signal) {
    const currentSignalPattern = `${signal.asset}-${signal.triggeredBy}-${signal.decision}`;
    if (currentSignalPattern === this.state.lastSignalPattern) {
      logger.warn(`HUMANIZER (Psicologia): Se omite senal por ser identica a la anterior.`);
      return false;
    }
    
    const assetBehavior = this.state.assetBehavior[signal.asset];
    if (assetBehavior && Date.now() < assetBehavior.probationEnd) {
      if (signal.confidence < 0.85) {
        logger.warn(`HUMANIZER: Trade en ${signal.asset} rechazado. Activo en 'periodo de prueba'.`, { asset: signal.asset });
        return false;
      }
      logger.info(`HUMANIZER: Se aprueba operar en ${signal.asset} (bajo prueba) por confianza excepcional.`, { asset: signal.asset });
    }

    if (this.state.persona.state === 'CAUTIOUS' && signal.confidence < 0.70) {
      logger.warn(`HUMANIZER: Trade rechazado. Modo CAUTELOSO requiere confianza > 70%.`);
      return false;
    }
    if (this.state.persona.state === 'FOCUSED' && signal.confidence < 0.60) {
        logger.warn(`HUMANIZER: Trade rechazado. Modo ENFOCADO es selectivo, requiere confianza > 60%.`);
        return false;
    }

    const { tradeHistory } = this.state;
    if (tradeHistory.length > 0) {
      if (Date.now() - tradeHistory[tradeHistory.length - 1].timestamp < config.humanizer.minTradeIntervalMs) {
        return false;
      }
    }
    
    return true;
  }

  _generateExecutionParams(signal) {
    let investmentMultiplier = 1.0;
    if (this.state.persona.state === 'FOCUSED') investmentMultiplier = 1.15;
    if (this.state.persona.state === 'CAUTIOUS') investmentMultiplier = 0.80;

    let expiration = 5; // Valor por defecto
    if (signal.triggeredBy.startsWith('live_')) {
        // Para señales en vivo, extraemos el número después de 'live_'
        const timePart = signal.triggeredBy.split('_')[1]; // '1m'
        expiration = parseInt(timePart, 10); // 1
    } else {
        // Para señales normales, usamos la lógica anterior
        expiration = parseInt(signal.triggeredBy, 10);
    }
    // Si algo falla, nos aseguramos de tener un valor sensato
    if (isNaN(expiration) || expiration <= 0) {
        expiration = 1; // Para señales en vivo, un defecto de 1 min es más seguro
    }
    const { minInvestment, maxInvestment } = config.trading;
    const investmentRatio = (signal.confidence - 0.5) / 0.5;
    const dynamicBaseInvestment = minInvestment + (investmentRatio * (maxInvestment - minInvestment));
    const finalInvestment = Math.max(minInvestment, Math.min(maxInvestment, parseFloat((dynamicBaseInvestment * investmentMultiplier).toFixed(2))));
    
    let delayMs = 0; // Por defecto, no hay retardo para las operaciones optimizadas.

    // Solo aplicamos el retardo "humano" a las señales de velas cerradas, no a las de tiempo real.
    if (!signal.triggeredBy.startsWith('live_')) {
        const { meanMs, stdDevMs } = config.humanizer.delay;
        delayMs = Math.max(500, gaussianRandom(meanMs, stdDevMs));
    }

    return { investment: finalInvestment, delayMs: Math.round(delayMs), expiration };
  }

  logApprovedTrade(signal) {
    const { asset, decision, confidence, executionParams } = signal;
    // Ya no tenemos requestId aquí, lo cual es correcto.
    logger.warn(`HUMANIZER: !ORDEN APROBADA! | ${asset} | ${decision.toUpperCase()} | Conf: ${confidence.toFixed(2)} | Invest: $${executionParams.investment}`, { asset: asset });
  }
}

export default Humanizer;
