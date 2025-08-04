/**
 * Dashboard entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TUIDashboard } from './tui/dashboard.js';
import { CLIDashboard } from './cli/dashboard.js';

export { TUIDashboard } from './tui/dashboard.js';
export { CLIDashboard } from './cli/dashboard.js';

/**
 * Dashboard launcher function
 */
export async function launchDashboard(options: {
  mode?: 'tui' | 'cli';
  refreshInterval?: number;
  maxEvents?: number;
  compact?: boolean;
} = {}): Promise<void> {
  const { mode = 'tui', refreshInterval = 1000, maxEvents = 100, compact = false } = options;

  console.log(chalk.cyan('🚀 Starting DevFlow Monitor Dashboard...'));
  console.log(chalk.gray(`Mode: ${mode.toUpperCase()}`));

  try {
    if (mode === 'tui') {
      const dashboard = new TUIDashboard({
        title: 'DevFlow Monitor Dashboard',
        refreshInterval,
        maxEvents
      });
      
      dashboard.start();
    } else {
      const dashboard = new CLIDashboard({
        refreshInterval,
        maxEvents,
        compact
      });
      
      dashboard.start();
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to start dashboard:'), error);
    process.exit(1);
  }
}

/**
 * CLI program setup
 */
export function createDashboardCLI(): Command {
  const program = new Command();

  program
    .name('devflow-dashboard')
    .description('DevFlow Monitor Dashboard')
    .version('1.0.0');

  program
    .command('start')
    .description('Start the dashboard')
    .option('-m, --mode <mode>', 'Dashboard mode (tui|cli)', 'tui')
    .option('-r, --refresh <ms>', 'Refresh interval in milliseconds', '1000')
    .option('-e, --max-events <count>', 'Maximum events to keep', '100')
    .option('-c, --compact', 'Compact mode (CLI only)', false)
    .action(async (options) => {
      await launchDashboard({
        mode: options.mode as 'tui' | 'cli',
        refreshInterval: parseInt(options.refresh),
        maxEvents: parseInt(options.maxEvents),
        compact: options.compact
      });
    });

  program
    .command('tui')
    .description('Start TUI dashboard')
    .option('-r, --refresh <ms>', 'Refresh interval in milliseconds', '1000')
    .option('-e, --max-events <count>', 'Maximum events to keep', '100')
    .action(async (options) => {
      await launchDashboard({
        mode: 'tui',
        refreshInterval: parseInt(options.refresh),
        maxEvents: parseInt(options.maxEvents)
      });
    });

  program
    .command('cli')
    .description('Start CLI dashboard')
    .option('-r, --refresh <ms>', 'Refresh interval in milliseconds', '5000')
    .option('-e, --max-events <count>', 'Maximum events to keep', '50')
    .option('-c, --compact', 'Compact mode', false)
    .action(async (options) => {
      await launchDashboard({
        mode: 'cli',
        refreshInterval: parseInt(options.refresh),
        maxEvents: parseInt(options.maxEvents),
        compact: options.compact
      });
    });

  return program;
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = createDashboardCLI();
  program.parse();
}