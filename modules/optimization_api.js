// API para interactuar con el sistema de optimización
import express from 'express';
import logger from '../utils/logger.js';

class OptimizationAPI {
  constructor(humanizer, port = 3001) {
    this.humanizer = humanizer;
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());

    // Obtener métricas actuales
    this.app.get('/metrics', (req, res) => {
      const metrics = this.humanizer.getTradingMetrics();
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    });

    // Obtener historial de trades
    this.app.get('/history', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const history = this.humanizer.state.tradeHistory.slice(-limit);
      
      res.json({
        success: true,
        data: {
          trades: history,
          count: history.length,
          totalInHistory: this.humanizer.state.tradeHistory.length
        }
      });
    });

    // Obtener estado completo
    this.app.get('/state', (req, res) => {
      res.json({
        success: true,
        data: {
          persona: this.humanizer.state.persona,
          restrictions: this.humanizer.state.tradingRestrictions || {},
          weeklyActivity: this.humanizer.state.weeklyActivity,
          isOptimizing: this.humanizer.isOptimizing,
          successRate: this.humanizer.getSuccessRate()
        }
      });
    });

    // Forzar optimización
    this.app.post('/optimize', async (req, res) => {
      try {
        logger.info('[API] Optimización manual solicitada');
        
        if (this.humanizer.isOptimizing) {
          return res.json({
            success: false,
            error: 'Optimización ya en progreso'
          });
        }

        // Iniciar optimización en background
        this.humanizer.forceOptimization().catch(error => {
          logger.error('[API] Error en optimización:', error);
        });

        res.json({
          success: true,
          message: 'Optimización iniciada'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Resetear restricciones
    this.app.post('/reset-restrictions', (req, res) => {
      this.humanizer.state.tradingRestrictions = {};
      this.humanizer.state.minConfidenceThreshold = 0.6;
      logger.info('[API] Restricciones reseteadas');
      
      res.json({
        success: true,
        message: 'Restricciones reseteadas'
      });
    });

    // Actualizar estado emocional manualmente
    this.app.post('/set-personality', (req, res) => {
      const { state } = req.body;
      const validStates = ['CALM', 'EUPHORIC', 'CAUTIOUS', 'FRUSTRATED'];
      
      if (!validStates.includes(state)) {
        return res.status(400).json({
          success: false,
          error: `Estado inválido. Debe ser uno de: ${validStates.join(', ')}`
        });
      }

      this.humanizer.state.persona.state = state;
      logger.info(`[API] Personalidad cambiada a: ${state}`);
      
      res.json({
        success: true,
        data: {
          newState: state,
          persona: this.humanizer.state.persona
        }
      });
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      logger.info(`🌐 API de Optimización iniciada en puerto ${this.port}`);
      logger.info('Endpoints disponibles:');
      logger.info('  GET  /metrics - Métricas actuales');
      logger.info('  GET  /history - Historial de trades');
      logger.info('  GET  /state - Estado completo');
      logger.info('  POST /optimize - Forzar optimización');
      logger.info('  POST /reset-restrictions - Resetear restricciones');
      logger.info('  POST /set-personality - Cambiar personalidad');
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('🛑 API de Optimización detenida');
    }
  }
}

export default OptimizationAPI;
