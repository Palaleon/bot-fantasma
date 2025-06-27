import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { google_web_search } from '../../tools/google_web_search.js'; // Asumiendo la ruta
import { saveState, loadState } from '../utils/StateManager.js';

// ... (función gaussianRandom)

class Humanizer extends EventEmitter {
  constructor() {
    super();
    this.state = loadState();
    this.opportunityBuffer = [];
    this.isDeciding = false;
    this.decisionWindowMs = 2000; // 2 segundos
    logger.info('🤖 Humanizer v4.2 (Focus Funnel) inicializado');
  }

  analyzeSignal(signal) {
    this.opportunityBuffer.push(signal);
    if (!this.isDeciding) {
      this.isDeciding = true;
      setTimeout(() => this._makeFocusedDecision(), this.decisionWindowMs);
    }
  }

  _makeFocusedDecision() {
    if (this.opportunityBuffer.length === 0) {
      this.isDeciding = false;
      return;
    }

    // Calcular puntuación de "interés" para cada oportunidad
    const scoredOpportunities = this.opportunityBuffer.map(opp => ({
      ...opp,
      interestScore: this._calculateInterestScore(opp),
    }));

    // Elegir la mejor
    const bestOpportunity = scoredOpportunities.reduce((a, b) => a.interestScore > b.interestScore ? a : b);

    // Limpiar buffer y tomar decisión final
    this.opportunityBuffer = [];
    this.isDeciding = false;

    // Aquí iría la lógica de análisis de la mejor oportunidad (como antes)
    const executionParams = this._generateExecutionParams(bestOpportunity);
    this.logApprovedTrade(bestOpportunity, executionParams);
    this.emit('decisionFinal', { approved: true, signal: { ...bestOpportunity, executionParams } });
  }

  _calculateInterestScore(signal) {
    let score = signal.confidence * 0.4; // Peso de la confianza
    // ... (lógica de puntuación de personalidad, novedad, etc.)
    return score;
  }

  // ... (resto de los métodos)
}


export default Humanizer;

