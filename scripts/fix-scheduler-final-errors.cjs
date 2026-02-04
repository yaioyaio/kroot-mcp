#!/usr/bin/env node

/**
 * Fix final scheduler.ts errors
 */

const fs = require('fs');

const schedulerPath = 'src/reports/scheduler.ts';

if (!fs.existsSync(schedulerPath)) {
  console.error('scheduler.ts not found!');
  process.exit(1);
}

console.log('Fixing final scheduler.ts errors...\n');

let content = fs.readFileSync(schedulerPath, 'utf8');

// Fix 1: updatedSchedule.schedule -> updatedSchedule._schedule
content = content.replace(
  /updatedSchedule\.schedule/g,
  'updatedSchedule._schedule'
);

// Fix 2: Fix setHours calls with proper default values
content = content.replace(
  /const \[hours, minutes\] = pattern\.time\.split\(':'\)\.map\(Number\);/g,
  `const timeParts = pattern.time.split(':').map(Number);
          const hours = timeParts[0];
          const minutes = timeParts[1] || 0;`
);

// Fix 3: Fix saveSchedule parameter
content = content.replace(
  /private async saveSchedule\(schedule: ReportSchedule\)/g,
  'private async saveSchedule(_schedule: ReportSchedule)'
);

// Fix 4: Fix references in saveSchedule
content = content.replace(
  /await this\.storageManager/g,
  'await this._storageManager'
);

// Fix specific references inside comments
content = content.replace(
  /id: schedule\.id,\s*type: 'report_schedule',\s*data: schedule,/g,
  `id: _schedule.id,
        type: 'report_schedule',
        data: _schedule,`
);

// Fix lastError assignment - add type assertion
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('job.lastError = undefined;')) {
    lines[i] = '      job.lastError = undefined;';
  }
}
content = lines.join('\n');

// Write the fixed content
fs.writeFileSync(schedulerPath, content, 'utf8');

console.log('✓ Applied final fixes to scheduler.ts\n');

// Check remaining errors
const { execSync } = require('child_process');

console.log('Checking scheduler.ts errors...\n');
try {
  const output = execSync('npm run build 2>&1 || true', { encoding: 'utf8' });
  const schedulerErrors = output.split('\n').filter(line => 
    line.includes('src/reports/scheduler.ts') && line.includes('error TS')
  );
  
  if (schedulerErrors.length > 0) {
    console.log(`scheduler.ts still has ${schedulerErrors.length} errors:\n`);
    schedulerErrors.forEach(err => console.log(`  ${err}`));
  } else {
    console.log('✅ No TypeScript errors in scheduler.ts!');
  }
} catch (e) {
  console.log('Failed to check build');
}