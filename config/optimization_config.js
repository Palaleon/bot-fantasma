// Configuración del sistema de auto-optimización

export const optimizationConfig = {
  // Ventana de cálculo de tasa de éxito
  successRateWindow: 50,
  
  // Umbral mínimo de tasa de éxito antes de optimizar
  successRateThreshold: 0.55,
  
  // Ventana de decisión en milisegundos
  decisionWindowMs: 2000,
  
  // Pesos para el scoring de oportunidades
  scoringWeights: {
    confidence: 0.4,      // Peso de la confianza de la señal
    personality: 0.3,     // Peso del factor de personalidad
    assetNovelty: 0.2,    // Peso de la novedad del activo
    temporalContext: 0.1  // Peso del contexto temporal
  },
  
  // Configuración de estados emocionales
  emotionalStates: {
    winStreakForEuphoria: 3,
    lossStreakForCautious: 3,
    lossStreakForFrustrated: 2,
    maxInvestmentFactor: 2.0,
    minInvestmentFactor: 0.5,
    investmentFactorStep: 0.1
  },
  
  // Restricciones de trading
  restrictions: {
    maxConsecutiveTradesPerAsset: 3,
    avoidEarlyHours: { before: 9 },
    avoidLateHours: { after: 22 },
    minConfidenceThreshold: 0.6,
    confidenceThresholdStep: 0.05,
    maxConfidenceThreshold: 0.8
  },
  
  // Configuración temporal
  temporal: {
    bestHours: {
      morning: { start: 10, end: 11 },
      afternoon: { start: 14, end: 16 }
    },
    weekendPenalty: 0.5,
    regularHourScore: 0.8,
    offHourScore: 0.4
  },
  
  // Parámetros de análisis
  analysis: {
    recentTradesForNovelty: 20,
    recentTradesForWinPattern: 20,
    similarSignalConfidenceThreshold: 0.1,
    winPatternBonus: 1.2
  },
  
  // Delays humanizados por estado
  humanizedDelays: {
    CALM: 1.0,
    EUPHORIC: 0.8,
    CAUTIOUS: 1.3,
    FRUSTRATED: 1.1
  }
};

export default optimizationConfig;