#!/usr/bin/env tsx

/**
 * Dashboard launcher script
 */

import { createDashboardCLI } from '../src/dashboard/index.js';

const program = createDashboardCLI();
program.parse(process.argv);