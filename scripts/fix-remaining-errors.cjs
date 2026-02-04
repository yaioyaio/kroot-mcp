#!/usr/bin/env node

/**
 * Automated TypeScript error fixer - second pass
 * Fixes remaining property access and variable naming issues
 */

const fs = require('fs');
const path = require('path');

// List of files that need fixing based on the error output
const filesToFix = [
  'src/analyzers/ai-monitor.ts',
  'src/analyzers/bottleneck-detector.ts', 
  'src/analyzers/methodology-analyzer.ts',
  'src/analyzers/metrics-analyzer.ts',
  'src/analyzers/stage-analyzer.ts',
  'src/feedback/analyzer.ts',
  'src/feedback/collector.ts',
  'src/feedback/preference-learner.ts',
  'src/performance/async-optimizer.ts',
  'src/performance/memory-optimizer.ts', 
  'src/performance/performance-profiler.ts',
  'src/performance/scaling-manager.ts',
  'src/plugins/templates/basic-plugin/index.ts',
  'src/prediction/bottleneck-predictor.ts',
  'src/prediction/pattern-recognizer.ts',
  'src/prediction/velocity-predictor.ts',
  'src/projects/cross-analyzer.ts',
  'src/projects/sync-client.ts',
  'src/reports/delivery.ts',
  'src/reports/pdf-generator.ts',
  'src/reports/report-engine.ts',
  'src/workflow/engine.ts',
  'src/workflow/rule-engine.ts',
  'src/workflow/stage-builder.ts',
  'src/workflow/template-system.ts'
];

function fixFile(filePath) {
  console.log(`Fixing ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Common fixes
  const fixes = [
    // Fix property access issues - change _data to data where appropriate
    { from: /event\._data/g, to: 'event.data' },
    { from: /\.data\./g, to: '._data.' },
    
    // Fix variable naming issues  
    { from: /Cannot find name 'data'/g, to: 'event._data' },
    { from: /Cannot find name 'message'/g, to: '_message' },
    { from: /Cannot find name 'context'/g, to: '_context' },
    { from: /Cannot find name 'transition'/g, to: '_transition' },
    { from: /Cannot find name 'ruleId'/g, to: '_ruleId' },
    
    // Fix property existence issues
    { from: /\.context/g, to: '._context' },
    { from: /\.message/g, to: '._message' },
    
    // Fix unused variable declarations
    { from: /(\s+)(\w+): (.+) = (.+);(\s+)\/\/ TS6133/g, to: '$1_$2: $3 = $4;$5// TS6133 fixed' },
    
    // Fix specific method access issues
    { from: /\.calculateMetrics\(/g, to: '._calculateMetrics(' },
  ];

  fixes.forEach(fix => {
    const beforeLength = content.length;
    content = content.replace(fix.from, fix.to);
    if (content.length !== beforeLength) {
      changed = true;
      console.log(`  Applied fix: ${fix.from} -> ${fix.to}`);
    }
  });

  // More specific fixes for different file types
  if (filePath.includes('ai-monitor.ts')) {
    // Fix specific AI monitor issues
    content = content.replace(/event\.data/g, 'event._data');
    content = content.replace(/_context:/g, 'context:');
    changed = true;
  }

  if (filePath.includes('bottleneck-detector.ts')) {
    // Fix bottleneck detector data access
    content = content.replace(/event\.data/g, 'event._data');
    content = content.replace(/\bdata\./g, 'event._data.');
    content = content.replace(/\bdata\[/g, 'event._data[');
    changed = true;
  }

  if (filePath.includes('rule-engine.ts')) {
    // Fix rule engine context issues
    content = content.replace(/\bcontext\./g, '_context.');
    content = content.replace(/\bruleId\b/g, '_ruleId');
    content = content.replace(/console\(/g, 'console.log(');
    changed = true;
  }

  if (filePath.includes('stage-builder.ts')) {
    // Fix validation rule message access
    content = content.replace(/\.message/g, '._message');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Fixed ${filePath}`);
    return true;
  } else {
    console.log(`  - No changes needed in ${filePath}`);
    return false;
  }
}

console.log('Starting TypeScript error fixes (second pass)...\n');

let totalFixed = 0;
for (const file of filesToFix) {
  if (fixFile(file)) {
    totalFixed++;
  }
}

console.log(`\n✓ Fixed ${totalFixed} files`);
console.log('Running build check...');

// Run build to check results
const { execSync } = require('child_process');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('\n✓ Build successful!');
} catch (error) {
  console.log('\n⚠ Build still has errors. Manual fixes may be needed.');
  process.exit(1);
}