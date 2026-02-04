#!/usr/bin/env node

/**
 * Fix TypeScript "Object is possibly 'undefined'" errors
 */

const fs = require('fs');
const path = require('path');

// Target files with undefined object access issues
const fixes = [
  {
    file: 'src/events/engine.ts',
    replacements: [
      // Fix _stats property access
      { from: /this\._stats\.eventsByCategory\.set\(/g, to: 'this._stats!.eventsByCategory.set(' },
      { from: /this\._stats\.eventsBySeverity\.set\(/g, to: 'this._stats!.eventsBySeverity.set(' },
      { from: /this\._stats\.totalEvents/g, to: 'this._stats!.totalEvents' },
      { from: /this\._stats\.lastEventTime/g, to: 'this._stats!.lastEventTime' },
      { from: /this\._stats\.eventsByCategory\.get\(/g, to: 'this._stats!.eventsByCategory.get(' },
      { from: /this\._stats\.eventsBySeverity\.get\(/g, to: 'this._stats!.eventsBySeverity.get(' },
      { from: /this\._stats\.eventsPerHour\[/g, to: 'this._stats!.eventsPerHour[' },
      { from: /this\._stats\.eventsPerHour\.reduce\(/g, to: 'this._stats!.eventsPerHour.reduce(' },
      // Fix stats reference
      { from: /\bstats\./g, to: '_stats.' },
    ]
  },
  {
    file: 'src/events/queue.ts',
    replacements: [
      // Fix _stats property access
      { from: /this\._stats\.processingTime/g, to: 'this._stats!.processingTime' },
      { from: /this\._stats\.throughput/g, to: 'this._stats!.throughput' },
      { from: /this\._stats\.failedCount/g, to: 'this._stats!.failedCount' },
      { from: /this\._stats\.size/g, to: 'this._stats!.size' },
      { from: /this\._stats\.priorityDistribution/g, to: 'this._stats!.priorityDistribution' },
      { from: /this\._stats\.memoryUsage/g, to: 'this._stats!.memoryUsage' },
      { from: /this\._stats\.enqueuedCount/g, to: 'this._stats!.enqueuedCount' },
      { from: /this\._stats\.dequeuedCount/g, to: 'this._stats!.dequeuedCount' },
      { from: /this\._stats\.droppedCount/g, to: 'this._stats!.droppedCount' },
      { from: /this\._stats\.oldestEventAge/g, to: 'this._stats!.oldestEventAge' },
    ]
  },
  {
    file: 'src/analyzers/metrics-collector.ts',
    replacements: [
      // Prefix unused function with underscore
      { from: /private calculateMetrics\(\)/g, to: 'private _calculateMetrics()' },
    ]
  }
];

function applyFixes() {
  console.log('Fixing TypeScript undefined errors...\n');
  
  for (const { file, replacements } of fixes) {
    if (!fs.existsSync(file)) {
      console.log(`Skipping ${file} - file not found`);
      continue;
    }
    
    console.log(`Processing ${file}...`);
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;
    
    for (const { from, to } of replacements) {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
        console.log(`  Applied: ${from} -> ${to}`);
      }
    }
    
    if (modified) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`✓ Fixed ${file}\n`);
    } else {
      console.log(`  No changes needed\n`);
    }
  }
}

// Also fix stats initialization issues
function fixStatsInitialization() {
  const enginePath = 'src/events/engine.ts';
  if (fs.existsSync(enginePath)) {
    let content = fs.readFileSync(enginePath, 'utf8');
    
    // Ensure stats is always initialized
    const initPattern = /private _stats: EventStatistics \| undefined;/;
    if (initPattern.test(content)) {
      content = content.replace(initPattern, 'private _stats!: EventStatistics;');
      fs.writeFileSync(enginePath, content, 'utf8');
      console.log('✓ Fixed EventEngine stats initialization\n');
    }
  }
  
  const queuePath = 'src/events/queue.ts';
  if (fs.existsSync(queuePath)) {
    let content = fs.readFileSync(queuePath, 'utf8');
    
    // Ensure stats is always initialized
    const initPattern = /private _stats: QueueStatistics \| undefined;/;
    if (initPattern.test(content)) {
      content = content.replace(initPattern, 'private _stats!: QueueStatistics;');
      fs.writeFileSync(queuePath, content, 'utf8');
      console.log('✓ Fixed EventQueue stats initialization\n');
    }
  }
}

// Run fixes
applyFixes();
fixStatsInitialization();

console.log('Done! Run npm run build to check results.');