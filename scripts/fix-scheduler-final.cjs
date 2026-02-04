#!/usr/bin/env node

/**
 * Final fix for scheduler.ts errors
 */

const fs = require('fs');

const schedulerPath = 'src/reports/scheduler.ts';

if (!fs.existsSync(schedulerPath)) {
  console.error('scheduler.ts not found!');
  process.exit(1);
}

console.log('Applying final fixes to scheduler.ts...\n');

let content = fs.readFileSync(schedulerPath, 'utf8');

// Fix all schedule.schedule to schedule._schedule
content = content.replace(/schedule\.schedule\./g, 'schedule._schedule.');

// Fix job.schedule.schedule to job.schedule._schedule  
content = content.replace(/job\.schedule\.schedule/g, 'job.schedule._schedule');

// Fix updates.schedule to updates._schedule
content = content.replace(/if \(updates\.schedule\)/g, 'if (updates._schedule)');

// Fix variable references where schedule is used alone
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Fix schedule variable references in specific contexts
  if (line.includes('if (!schedule.timezone)')) {
    // This should remain as is - it's accessing the schedule object
  } else if (line.includes('schedule.schedule.cron')) {
    lines[i] = line.replace(/schedule\.schedule\.cron/g, 'schedule._schedule.cron');
  } else if (line.includes('schedule.schedule.')) {
    lines[i] = line.replace(/schedule\.schedule\./g, 'schedule._schedule.');
  }
  
  // Fix function parameter names
  if (line.includes('private createCronJob(_schedule: ReportSchedule)')) {
    lines[i] = line.replace('_schedule: ReportSchedule', 'schedule: ReportSchedule');
  }
  if (line.includes('private calculateReportPeriod(_schedule: ReportSchedule)')) {
    lines[i] = line.replace('_schedule: ReportSchedule', 'schedule: ReportSchedule');
  }
  if (line.includes('private async saveSchedule(_schedule: ReportSchedule)')) {
    lines[i] = line.replace('_schedule: ReportSchedule', 'schedule: ReportSchedule');
  }
  if (line.includes('_schedule: ReportSchedule,')) {
    lines[i] = line.replace('_schedule: ReportSchedule,', 'schedule: ReportSchedule,');
  }
  
  // Fix data property
  if (line.includes('_data: schedule,')) {
    lines[i] = line.replace('_data: schedule,', 'data: schedule,');
  }
}

content = lines.join('\n');

// Fix the object property in ReportSchedule initialization
content = content.replace(/schedule: pattern,/g, '_schedule: pattern,');

// Write the fixed content
fs.writeFileSync(schedulerPath, content, 'utf8');

console.log('✓ Applied final fixes to scheduler.ts\n');

// Check specific errors
const { execSync } = require('child_process');

console.log('Checking scheduler.ts specific errors...\n');
try {
  const output = execSync('npm run build 2>&1 || true', { encoding: 'utf8' });
  const schedulerErrors = output.split('\n').filter(line => line.includes('src/reports/scheduler.ts') && line.includes('error TS'));
  
  if (schedulerErrors.length > 0) {
    console.log(`scheduler.ts still has ${schedulerErrors.length} errors:\n`);
    schedulerErrors.slice(0, 10).forEach(err => console.log(`  ${err}`));
  } else {
    console.log('✅ No TypeScript errors in scheduler.ts!');
  }
} catch (e) {
  console.log('Failed to check build');
}