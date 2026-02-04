#!/usr/bin/env node

/**
 * Systematic build error fixer
 * Fix TypeScript errors in a more organized way
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Common replacements that need to be made
const replacements = [
  // Fix property name mismatches
  { pattern: /\.stats\b/g, replacement: '._stats' },
  { pattern: /\.calculateMetrics\(/g, replacement: '._calculateMetrics(' },
  { pattern: /'stage:_transition'/g, replacement: "'stage:transition'" },
  
  // Fix variable references
  { pattern: /\bmetric\./g, replacement: '_metric.' },
  { pattern: /\bmetric\[/g, replacement: '_metric[' },
  { pattern: /Cannot find name 'metric'/g, replacement: '_metric' },
  { pattern: /Cannot find name 'stats'/g, replacement: '_stats' },
  
  // Fix object literal property names
  { pattern: /data:\s*data,/g, replacement: '_data: data,' },
  { pattern: /\bdata,\s*$/gm, replacement: '_data: data,' },
];

// Files that commonly have these issues
const targetFiles = [
  'src/events/engine.ts',
  'src/events/queue.ts',
  'src/events/builder.ts',
  'src/analyzers/metrics-collector.ts',
  'src/analyzers/stage-analyzer.ts',
];

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  for (const { pattern, replacement } of replacements) {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      modified = true;
      console.log(`  Applied: ${pattern} -> ${replacement}`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed ${filePath}`);
    return true;
  }
  
  return false;
}

console.log('Fixing TypeScript build errors systematically...\n');

let fixedCount = 0;
for (const file of targetFiles) {
  console.log(`Processing ${file}...`);
  if (fixFile(file)) {
    fixedCount++;
  }
  console.log('');
}

// Fix specific issues in specific files
console.log('Applying specific fixes...\n');

// Fix events/builder.ts data property
const builderPath = 'src/events/builder.ts';
if (fs.existsSync(builderPath)) {
  let content = fs.readFileSync(builderPath, 'utf8');
  // Fix the object literal issue
  content = content.replace(/(\s+)data,(\s*\/\/.*)?$/gm, '$1_data: data,$2');
  content = content.replace(/data:\s*data/g, '_data: data');
  fs.writeFileSync(builderPath, content, 'utf8');
  console.log('✓ Fixed events/builder.ts data property');
}

// Fix metrics-collector.ts metric references
const metricsPath = 'src/analyzers/metrics-collector.ts';
if (fs.existsSync(metricsPath)) {
  let content = fs.readFileSync(metricsPath, 'utf8');
  content = content.replace(/\bmetric\./g, '_metric.');
  content = content.replace(/\bmetric\[/g, '_metric[');
  content = content.replace(/Cannot find name 'metric'/g, '_metric');
  fs.writeFileSync(metricsPath, content, 'utf8');
  console.log('✓ Fixed metrics-collector.ts metric references');
}

// Fix stage-analyzer.ts event emission
const stagePath = 'src/analyzers/stage-analyzer.ts';
if (fs.existsSync(stagePath)) {
  let content = fs.readFileSync(stagePath, 'utf8');
  content = content.replace(/'stage:_transition'/g, "'stage:transition'");
  fs.writeFileSync(stagePath, content, 'utf8');
  console.log('✓ Fixed stage-analyzer.ts event names');
}

console.log(`\n✓ Applied fixes to ${fixedCount} files`);

// Run build to check
console.log('\nRunning build check...\n');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('\n✅ Build successful!');
} catch (error) {
  // Count remaining errors
  try {
    const output = execSync('npm run build 2>&1 || true', { encoding: 'utf8' });
    const errorCount = (output.match(/error TS/g) || []).length;
    console.log(`\n⚠️  Build still has ${errorCount} errors`);
  } catch (e) {
    console.log('\n⚠️  Build failed - check errors above');
  }
}