// Script de prueba para verificar el sistema de auto-optimización
import Humanizer from './modules/Humanizer.js';
import logger from './utils/logger.js';

async function testOptimizationSystem() {
  logger.info('🧪 Iniciando prueba del sistema de auto-optimización...');
  
  const humanizer = new Humanizer();
  
  // Mostrar estado inicial
  logger.info('📊 Estado inicial:');
  const metrics = humanizer.getTradingMetrics();
  logger.info(JSON.stringify(metrics, null, 2));
  
  // Simular algunas operaciones perdedoras
  logger.info('\n🔴 Simulando operaciones perdedoras...');
  
  for (let i = 0; i < 8; i++) {
    const fakeResult = {
      id: `test-${Date.now()}-${i}`,
      profit: -1,
      percentProfit: -100,
      asset: i % 2 === 0 ? 'EURUSD' : 'GBPUSD',
      openPrice: 1.1000,
      closePrice: 1.0990,
      command: 1,
      openTime: new Date().toISOString(),
      closeTime: new Date().toISOString()
    };
    
    // Primero registrar la operación como pendiente
    humanizer.pendingTrades.set(fakeResult.id, {
      signal: { asset: fakeResult.asset, decision: 'green' },
      confidence: 0.75,
      timestamp: Date.now(),
      personality: humanizer.getPersonalityState()
    });
    
    // Luego procesar el resultado
    humanizer.processTradeResult(fakeResult);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Mostrar estado después de pérdidas
  logger.info('\n📊 Estado después de pérdidas:');
  const metricsAfterLosses = humanizer.getTradingMetrics();
  logger.info(JSON.stringify(metricsAfterLosses, null, 2));
  
  // Esperar a que termine la optimización si se activó
  if (humanizer.isOptimizing) {
    logger.info('\n⏳ Esperando a que termine la optimización automática...');
    while (humanizer.isOptimizing) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Forzar una optimización manual
  logger.info('\n🔧 Forzando optimización manual...');
  await humanizer.forceOptimization();
  
  // Mostrar estado final
  logger.info('\n📊 Estado final después de optimización:');
  const finalMetrics = humanizer.getTradingMetrics();
  logger.info(JSON.stringify(finalMetrics, null, 2));
  
  // Mostrar restricciones aplicadas
  logger.info('\n🚫 Restricciones de trading aplicadas:');
  logger.info(JSON.stringify(humanizer.state.tradingRestrictions || {}, null, 2));
  
  logger.info('\n✅ Prueba completada');
}

// Ejecutar la prueba
testOptimizationSystem().catch(error => {
  logger.error('❌ Error en la prueba:', error);
});
