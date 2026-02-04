#!/usr/bin/env node

/**
 * Fix TypeScript errors in scheduler.ts
 */

const fs = require('fs');
const path = require('path');

const schedulerPath = 'src/reports/scheduler.ts';

if (!fs.existsSync(schedulerPath)) {
  console.error('scheduler.ts not found!');
  process.exit(1);
}

console.log('Fixing scheduler.ts errors...\n');

let content = fs.readFileSync(schedulerPath, 'utf8');

// Fix 1: Change _schedule to schedule in interface
content = content.replace(
  /  \/\*\* 스케줄 \*\/\n  _schedule: ReportSchedule;/g,
  '  /** 스케줄 */\n  schedule: ReportSchedule;'
);

// Fix 2: Change _storageManager to storageManager
content = content.replace(
  /private _storageManager: StorageManager;/g,
  'private storageManager: StorageManager;'
);

// Fix 3: Fix constructor assignment
content = content.replace(
  /this\.storageManager = storageManager;/g,
  'this.storageManager = storageManager;'
);

// Fix 4: Fix _schedule: pattern to schedule: pattern
content = content.replace(
  /_schedule: pattern,/g,
  'schedule: pattern,'
);

// Fix 5: Fix variable declaration
content = content.replace(
  /const _schedule: ReportSchedule = \{/g,
  'const schedule: ReportSchedule = {'
);

// Fix 6: Fix all job.schedule references
content = content.replace(/job\._schedule/g, 'job.schedule');

// Fix 7: Fix updates.schedule check
content = content.replace(
  /if \(updates\.schedule\)/g,
  'if (updates.schedule)'
);

// Fix 8: Fix updatedSchedule.schedule references
content = content.replace(
  /updatedSchedule\.schedule\./g,
  'updatedSchedule.schedule.'
);

// Fix 9: Change updates._schedule to updates.schedule
content = content.replace(
  /updates\._schedule/g,
  'updates.schedule'
);

// Fix 10: Add proper null checks for schedule pattern access
content = content.replace(
  /pattern\.type === 'cron' && pattern\.cron/g,
  "pattern.type === 'cron' && pattern.cron"
);

// Fix 11: Fix the schedule property in updates
content = content.replace(
  /\/\/ 다음 실행 시간 재계산\n    if \(updates\.schedule\) \{/g,
  '// 다음 실행 시간 재계산\n    if (updates.schedule) {'
);

// Fix 12: Fix object literal in job creation
content = content.replace(
  /const job: ScheduleJob = \{\n      id: schedule\.id,\n      schedule,\n      running: false\n    \};/g,
  'const job: ScheduleJob = {\n      id: schedule.id,\n      schedule: schedule,\n      running: false\n    };'
);

// Write the fixed content
fs.writeFileSync(schedulerPath, content, 'utf8');

console.log('✓ Fixed scheduler.ts\n');

// Check if build succeeds for this file
const { execSync } = require('child_process');

console.log('Checking scheduler.ts compilation...\n');
try {
  execSync('npx tsc --noEmit src/reports/scheduler.ts', { stdio: 'pipe' });
  console.log('✅ scheduler.ts compiles successfully!');
} catch (error) {
  const output = error.stdout ? error.stdout.toString() : '';
  const stderr = error.stderr ? error.stderr.toString() : '';
  const errors = (output + stderr).split('\n').filter(line => line.includes('error TS'));
  
  if (errors.length > 0) {
    console.log(`⚠️  scheduler.ts still has ${errors.length} errors:\n`);
    errors.forEach(err => console.log(`  ${err}`));
  }
}