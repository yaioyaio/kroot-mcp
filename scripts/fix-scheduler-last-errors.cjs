#!/usr/bin/env node

/**
 * Fix last remaining scheduler.ts errors
 */

const fs = require('fs');

const schedulerPath = 'src/reports/scheduler.ts';

if (!fs.existsSync(schedulerPath)) {
  console.error('scheduler.ts not found!');
  process.exit(1);
}

console.log('Fixing last scheduler.ts errors...\n');

let content = fs.readFileSync(schedulerPath, 'utf8');

// Fix 1: Remove unused _storageManager - comment it out since it's not used yet
content = content.replace(
  'private _storageManager: StorageManager;',
  '// private _storageManager: StorageManager; // TODO: Implement persistence'
);

content = content.replace(
  'this._storageManager = storageManager;',
  '// this._storageManager = storageManager; // TODO: Implement persistence'
);

// Fix 2: Fix optional string assignment
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('job.lastError = undefined;')) {
    // Since lastError is optional (lastError?: string), we can delete it instead
    lines[i] = '      delete job.lastError;';
  }
}
content = lines.join('\n');

// Fix 3: Fix setHours calls - add null checks for time parts
content = content.replace(
  /next\.setHours\(hours, minutes, 0, 0\);/g,
  'next.setHours(hours || 0, minutes || 0, 0, 0);'
);

// Write the fixed content
fs.writeFileSync(schedulerPath, content, 'utf8');

console.log('✓ Applied last fixes to scheduler.ts\n');

// Check remaining errors
const { execSync } = require('child_process');

console.log('Checking scheduler.ts errors...\n');
try {
  const output = execSync('npm run build 2>&1 || true', { encoding: 'utf8' });
  const schedulerErrors = output.split('\n').filter(line => 
    line.includes('src/reports/scheduler.ts') && line.includes('error TS')
  );
  
  console.log(`scheduler.ts has ${schedulerErrors.length} errors\n`);
  
  if (schedulerErrors.length > 0) {
    schedulerErrors.forEach(err => console.log(`  ${err}`));
  } else {
    console.log('✅ No TypeScript errors in scheduler.ts!');
  }
  
  // Count total errors
  const totalErrors = output.split('\n').filter(line => line.includes('error TS')).length;
  console.log(`\nTotal project errors: ${totalErrors}`);
  
} catch (e) {
  console.log('Failed to check build');
}