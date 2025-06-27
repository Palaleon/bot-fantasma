#!/usr/bin/env node

// CLI para gestionar el Bot Fantasma
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { loadState, saveState } from './utils/StateManager.js';
import Humanizer from './modules/Humanizer.js';
import logger from './utils/logger.js';

const program = new Command();

program
  .name('bot-fantasma')
  .description('CLI para gestionar el Bot Fantasma de Trading')
  .version('3.0.0');

// Comando para ver el estado
program
  .command('status')
  .description('Ver el estado actual del bot')
  .action(() => {
    try {
      const state = loadState();
      console.log('\n📊 Estado del Bot Fantasma:\n');
      console.log(`🤖 Personalidad: ${state.persona.state}`);
      console.log(`📈 Racha de victorias: ${state.persona.winStreak}`);
      console.log(`📉 Racha de derrotas: ${state.persona.lossStreak}`);
      console.log(`💰 Factor de inversión: ${state.persona.investmentFactor}x`);
      
      if (state.tradeHistory && state.tradeHistory.length > 0) {
        const recent = state.tradeHistory.slice(-10);
        const wins = recent.filter(t => t.result === 'win').length;
        console.log(`\n📊 Últimas 10 operaciones: ${wins} victorias, ${10 - wins} derrotas`);
      }
      
      if (state.tradingRestrictions && Object.keys(state.tradingRestrictions).length > 0) {
        console.log('\n🚫 Restricciones activas:');
        Object.entries(state.tradingRestrictions).forEach(([key, value]) => {
          console.log(`   - ${key}: ${value}`);
        });
      }
    } catch (error) {
      console.error('❌ Error leyendo el estado:', error.message);
    }
  });

// Comando para resetear el estado
program
  .command('reset')
  .description('Resetear el estado del bot')
  .option('-f, --force', 'Forzar reset sin confirmación')
  .action(async (options) => {
    if (!options.force) {
      console.log('⚠️  Esto borrará todo el historial y aprendizaje del bot.');
      console.log('Usa --force para confirmar.');
      return;
    }
    
    try {
      const statePath = path.join(process.cwd(), 'trading_persona.json');
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
        console.log('✅ Estado reseteado exitosamente');
      } else {
        console.log('ℹ️  No hay estado que resetear');
      }
    } catch (error) {
      console.error('❌ Error reseteando:', error.message);
    }
  });

// Comando para ver estadísticas
program
  .command('stats')
  .description('Ver estadísticas detalladas')
  .option('-d, --days <number>', 'Número de días a analizar', '7')
  .action((options) => {
    try {
      const state = loadState();
      const days = parseInt(options.days);
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      const recentTrades = state.tradeHistory.filter(t => t.timestamp > cutoffTime);
      
      if (recentTrades.length === 0) {
        console.log(`\nℹ️  No hay operaciones en los últimos ${days} días`);
        return;
      }
      
      // Estadísticas generales
      const wins = recentTrades.filter(t => t.result === 'win').length;
      const losses = recentTrades.filter(t => t.result === 'loss').length;
      const winRate = (wins / recentTrades.length * 100).toFixed(1);
      
      console.log(`\n📊 Estadísticas de los últimos ${days} días:\n`);
      console.log(`Total de operaciones: ${recentTrades.length}`);
      console.log(`Victorias: ${wins} (${winRate}%)`);
      console.log(`Derrotas: ${losses}`);
      
      // Por activo
      const byAsset = {};
      recentTrades.forEach(t => {
        if (!byAsset[t.asset]) {
          byAsset[t.asset] = { wins: 0, losses: 0 };
        }
        if (t.result === 'win') {
          byAsset[t.asset].wins++;
        } else {
          byAsset[t.asset].losses++;
        }
      });
      
      console.log('\n📈 Por activo:');
      Object.entries(byAsset).forEach(([asset, stats]) => {
        const total = stats.wins + stats.losses;
        const rate = (stats.wins / total * 100).toFixed(1);
        console.log(`   ${asset}: ${stats.wins}W/${stats.losses}L (${rate}%)`);
      });
      
      // Por hora del día
      const byHour = {};
      recentTrades.forEach(t => {
        const hour = new Date(t.timestamp).getHours();
        if (!byHour[hour]) {
          byHour[hour] = { wins: 0, losses: 0 };
        }
        if (t.result === 'win') {
          byHour[hour].wins++;
        } else {
          byHour[hour].losses++;
        }
      });
      
      console.log('\n🕐 Por hora del día:');
      Object.entries(byHour)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .forEach(([hour, stats]) => {
          const total = stats.wins + stats.losses;
          const rate = (stats.wins / total * 100).toFixed(1);
          console.log(`   ${hour}:00 - ${stats.wins}W/${stats.losses}L (${rate}%)`);
        });
        
    } catch (error) {
      console.error('❌ Error generando estadísticas:', error.message);
    }
  });

// Comando para exportar datos
program
  .command('export')
  .description('Exportar historial de trades')
  .option('-f, --format <type>', 'Formato de salida (json|csv)', 'json')
  .option('-o, --output <file>', 'Archivo de salida', 'trades_export')
  .action((options) => {
    try {
      const state = loadState();
      const trades = state.tradeHistory || [];
      
      if (trades.length === 0) {
        console.log('ℹ️  No hay trades para exportar');
        return;
      }
      
      let output;
      let filename;
      
      if (options.format === 'csv') {
        // Generar CSV
        const headers = ['timestamp', 'asset', 'direction', 'result', 'profit', 'confidence', 'personality'];
        const rows = trades.map(t => [
          new Date(t.timestamp).toISOString(),
          t.asset,
          t.direction,
          t.result,
          t.profit,
          t.confidence,
          t.personality
        ]);
        
        output = [headers, ...rows].map(row => row.join(',')).join('\n');
        filename = `${options.output}.csv`;
      } else {
        // Generar JSON
        output = JSON.stringify(trades, null, 2);
        filename = `${options.output}.json`;
      }
      
      fs.writeFileSync(filename, output);
      console.log(`✅ Exportado ${trades.length} trades a ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exportando:', error.message);
    }
  });

// Comando para simular resultados (para testing)
program
  .command('simulate')
  .description('Simular resultados de trades para testing')
  .option('-w, --wins <number>', 'Número de victorias', '5')
  .option('-l, --losses <number>', 'Número de derrotas', '3')
  .action(async (options) => {
    logger.warn('⚠️  Esta función está destinada solo para pruebas y modificará el estado actual (`trading_persona.json`).');
    const wins = parseInt(options.wins);
    const losses = parseInt(options.losses);
    logger.info(`Simulando ${wins} victorias y ${losses} derrotas...`);

    // ¡CLAVE! Usamos un archivo de estado separado para la simulación.
    const simStateFile = path.join(process.cwd(), 'trading_persona_sim.json');
    logger.info(`Usando archivo de estado de simulación: ${simStateFile}`);

    // Instanciamos el Humanizer apuntando al archivo de simulación.
    const humanizer = new Humanizer(simStateFile);

    const simulateTrade = (result, index) => {
      const tradeId = `sim-${Date.now()}-${Math.random()}`;
      const isWin = result === 'win';
      // Alternamos entre dos activos para probar el análisis por activo
      const asset = index % 2 === 0 ? 'EURUSD_sim' : 'GBPUSD_sim';

      // 1. Registramos la operación como si el Humanizer la hubiera aprobado y estuviera pendiente.
      // Esto es CRUCIAL para que el Humanizer tenga el contexto de qué decisión llevó al resultado.
      humanizer.pendingTrades.set(tradeId, {
        signal: { asset: asset, decision: 'green' }, // Simulación simple de una señal
        confidence: Math.random() * (0.9 - 0.6) + 0.6, // Confianza aleatoria pero realista
        timestamp: Date.now(),
        personality: humanizer.getPersonalityState() // Captura el estado emocional en el momento de la "decisión"
      });

      // 2. Procesamos el resultado de esa operación pendiente.
      humanizer.processTradeResult({
        id: tradeId,
        profit: isWin ? 0.85 : -1, // Resultado monetario
        asset: asset
      });
      logger.info(`-> Trade simulado #${index + 1}: ${asset} -> ${result.toUpperCase()}`);
    };

    const totalTrades = wins + losses;
    for (let i = 0; i < totalTrades; i++) {
      // Mezclamos victorias y derrotas
      const result = i < wins ? 'win' : 'loss';
      simulateTrade(result, i);
    }

    // Guardamos el estado en el archivo de simulación.
    saveState(humanizer.state, simStateFile);
    logger.info('✅ Simulación completada. El nuevo estado del Humanizer ha sido guardado.');
  });

program.parse();