// /modules/Humanizer.js
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { saveState, loadState } from '../utils/StateManager.js';

// ELIMINADO: La función gaussianRandom ya no es necesaria.

class Humanizer extends EventEmitter {
constructor(telegramConnector, accountMode, learningManager) {
    super();
    this.telegramConnector = telegramConnector;
    this.learningManager = learningManager;
    this.accountMode = accountMode || 'demo';
    this.liveBalance = 0;
    this.demoBalance = 0;

    this.state = loadState();
    this.state.persona = this.state.persona || { state: 'CALM', consecutiveWins: 0, consecutiveLosses: 0 };
    this.state.assetBehavior = this.state.assetBehavior || {};
    this.state.tradeHistory = this.state.tradeHistory || []; 
    this.state.lastSignalPattern = this.state.lastSignalPattern || '';
    
    // ELIMINADO: El búfer y los estados de decisión ya no son necesarios.
    // this.opportunityBuffer = [];
    // this.isDeciding = false;
    // this.decisionWindowMs = 2000;

    logger.info(`Humanizer v9.0 (Ejecución Rápida) inicializado en modo [${this.accountMode.toUpperCase()}]`);
  }

  updateBalances(balanceData) {
    this.liveBalance = balanceData.liveBalance || this.liveBalance;
    this.demoBalance = balanceData.demoBalance || this.demoBalance;
    logger.warn(`HUMANIZER: Conciencia actualizada. Modo: [${this.accountMode.toUpperCase()}]. Balance en uso: ${this.getCurrentBalance().toFixed(2)}`);
  }

  getCurrentBalance() {
    return this.accountMode === 'live' ? this.liveBalance : this.demoBalance;
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

  // CAMBIO RADICAL: El análisis ahora es inmediato.
  analyzeSignal(signal) {
    // Ya no hay búfer ni espera. Se llama a la decisión directamente.
    this._makeFocusedDecision(signal);
  }

  async _makeFocusedDecision(signal) {
    // --- INICIO DE LA CONSULTA A LA IA ---
    let finalConfidence = signal.confidence;

    if (this.learningManager && this.learningManager.isReady()) {
        const mlOpinion = await this.learningManager.predict(signal.marketSnapshot);

        if (mlOpinion) {
            logger.info(`HUMANIZER: Opinión de la IA recibida -> Decisión: ${mlOpinion.decision.toUpperCase()}, Confianza: ${(mlOpinion.confidence * 100).toFixed(1)}%`);

            if (mlOpinion.decision !== signal.decision) {
                logger.warn(`HUMANIZER: ¡Conflicto de opinión! Señal: ${signal.decision.toUpperCase()}, IA: ${mlOpinion.decision.toUpperCase()}. Abortando trade.`);
                finalConfidence = 0;
            } else {
                finalConfidence = (finalConfidence + mlOpinion.confidence) / 2;
            }
        }
    } else {
        logger.info('HUMANIZER: Modelo de IA no está listo, se procede con la lógica de confianza estándar.');
    }
    // --- FIN DE LA CONSULTA A LA IA ---

    const reviewedSignal = { ...signal, confidence: finalConfidence };

    // Por defecto, la disciplina está activada.
    // Se desactiva solo si la variable de entorno está explícitamente en 'false'.
    const disciplineEnabled = process.env.HUMANIZER_DISCIPLINE_ENABLED !== 'false';

    if (!disciplineEnabled) {
        logger.warn('HUMANIZER: La disciplina ha sido desactivada por configuración. Procediendo directamente a la ejecución.');
    }

    if (disciplineEnabled && !this._isTradeApprovedByDiscipline(reviewedSignal)) {
        // Si la disciplina está activada y no aprueba el trade, se detiene aquí.
        return; 
    }

    // Si la disciplina está desactivada, o si está activada y aprueba el trade, continuamos.
    const executionParams = this._generateExecutionParams(reviewedSignal);

    const finalSignal = { 
        ...reviewedSignal, 
        executionParams, 
        timestamp: Date.now(),
        personaState: this.state.persona.state,
        accountMode: this.accountMode
    };

    this.logApprovedTrade(finalSignal);
    this.emit('decisionFinal', { approved: true, signal: finalSignal });

    this.state.tradeHistory.push(finalSignal);
    saveState(this.state);
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
        logger.warn(`HUMANIZER: Trade rechazado. Enfriamiento de ${config.humanizer.minTradeIntervalMs / 1000}s activo.`);
        return false;
      }
    }
    
    return true;
  }

  _generateExecutionParams(signal) {
    const balance = this.getCurrentBalance();
    const { minInvestment, maxInvestment } = config.trading;

    if (balance <= 0) {
        logger.warn(`HUMANIZER: Balance es cero o inválido. Usando inversión mínima de seguridad de $${minInvestment}.`);
        // CAMBIO: Delay se establece en 0.
        return { investment: minInvestment, delayMs: 0, expiration: 5 };
    }

    const RISK_PERCENTAGE = config.trading.riskPerTrade || 0.01; 
    let baseInvestment = balance * RISK_PERCENTAGE;

    let investmentMultiplier = 1.0;
    if (this.state.persona.state === 'FOCUSED') investmentMultiplier = 1.15;
    if (this.state.persona.state === 'CAUTIOUS') investmentMultiplier = 0.80;

    let calculatedInvestment = baseInvestment * investmentMultiplier;

    const finalInvestment = Math.max(minInvestment, Math.min(maxInvestment, calculatedInvestment));
    const formattedInvestment = parseFloat(finalInvestment.toFixed(2));

    logger.info(`HUMANIZER (Inversión): Balance: $${balance.toFixed(2)}, Riesgo: ${RISK_PERCENTAGE*100}%, Calculado: $${calculatedInvestment.toFixed(2)}, Final: $${formattedInvestment}`);

    let expiration = 5;
    if (signal.triggeredBy.startsWith('live_')) {
        const timePart = signal.triggeredBy.split('_')[1];
        expiration = parseInt(timePart, 10);
    } else {
        expiration = parseInt(signal.triggeredBy, 10);
    }
    if (isNaN(expiration) || expiration <= 0) {
        expiration = 1;
    }

    // CAMBIO RADICAL: El delay artificial se elimina por completo.
    const delayMs = 0;

    return { investment: formattedInvestment, delayMs, expiration };
  }

  logApprovedTrade(signal) {
    const { asset, decision, confidence, executionParams } = signal;
    logger.warn(`HUMANIZER: !ORDEN APROBADA! | ${asset} | ${decision.toUpperCase()} | Conf: ${confidence.toFixed(2)} | Invest: $${executionParams.investment}`, { asset: asset });
  }
}

export default Humanizer;