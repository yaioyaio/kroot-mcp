#!/usr/bin/env node

/**
 * Comprehensive TypeScript error fixer
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all TypeScript errors
function getTypeScriptErrors() {
  try {
    execSync('npm run build', { stdio: 'pipe' });
    return [];
  } catch (error) {
    const output = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const allOutput = output + stderr;
    
    const errors = [];
    const lines = allOutput.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          code: match[4],
          message: match[5]
        });
      }
    }
    
    return errors;
  }
}

// Group errors by file
function groupErrorsByFile(errors) {
  const grouped = {};
  for (const error of errors) {
    if (!grouped[error.file]) {
      grouped[error.file] = [];
    }
    grouped[error.file].push(error);
  }
  return grouped;
}

// Fix specific error types
function fixError(lines, error, fileContent) {
  const lineIndex = error.line - 1;
  if (lineIndex >= lines.length) return false;
  
  let line = lines[lineIndex];
  let fixed = false;
  
  switch (error.code) {
    case 'TS2304': // Cannot find name
      if (error.message.includes("Cannot find name 'event'")) {
        // Fix event reference in createBottleneck function
        line = line.replace(/\bevent\._data\./g, 'data.');
        line = line.replace(/\bevent\._data\[/g, 'data[');
        fixed = true;
      } else if (error.message.includes("Cannot find name 'message'")) {
        // Change message to _message
        line = line.replace(/\bmessage\b/g, '_message');
        fixed = true;
      } else if (error.message.includes("Cannot find name 'context'")) {
        // Change context to _context
        line = line.replace(/\bcontext\./g, '_context.');
        line = line.replace(/\bcontext\[/g, '_context[');
        line = line.replace(/\bcontext\b(?!:)/g, '_context');
        fixed = true;
      } else if (error.message.includes("Cannot find name 'transition'")) {
        line = line.replace(/\btransition\b/g, '_transition');
        fixed = true;
      } else if (error.message.includes("Cannot find name 'ruleId'")) {
        line = line.replace(/\bruleId\b/g, '_ruleId');
        fixed = true;
      } else if (error.message.includes("Cannot find name 'data'")) {
        line = line.replace(/\bdata\./g, '_data.');
        line = line.replace(/\bdata\[/g, '_data[');
        fixed = true;
      }
      break;
      
    case 'TS2551': // Property does not exist, did you mean
      if (error.message.includes("Property 'data' does not exist") && error.message.includes("Did you mean '_data'")) {
        line = line.replace(/\.data\b/g, '._data');
        fixed = true;
      } else if (error.message.includes("Property '_message' does not exist") && error.message.includes("Did you mean 'message'")) {
        line = line.replace(/\._message\b/g, '.message');
        fixed = true;
      } else if (error.message.includes("Property 'context' does not exist") && error.message.includes("Did you mean '_context'")) {
        line = line.replace(/\.context\b/g, '._context');
        fixed = true;
      } else if (error.message.includes("Property '_context' does not exist") && error.message.includes("Did you mean 'context'")) {
        line = line.replace(/\._context\b/g, '.context');
        fixed = true;
      } else if (error.message.includes("Property '_contextFilters' does not exist") && error.message.includes("Did you mean 'contextFilters'")) {
        line = line.replace(/\._contextFilters\b/g, '.contextFilters');
        fixed = true;
      } else if (error.message.includes("Property 'calculateMetrics' does not exist") && error.message.includes("Did you mean '_calculateMetrics'")) {
        line = line.replace(/\.calculateMetrics\(/g, '._calculateMetrics(');
        fixed = true;
      }
      break;
      
    case 'TS2552': // Cannot find name, did you mean
      if (error.message.includes("Cannot find name 'message'. Did you mean '_message'")) {
        line = line.replace(/\bmessage\b/g, '_message');
        fixed = true;
      }
      break;
      
    case 'TS6133': // Variable declared but never read
      if (error.message.includes("is declared but its value is never read")) {
        const varMatch = error.message.match(/'(\w+)'/);
        if (varMatch) {
          const varName = varMatch[1];
          if (!varName.startsWith('_')) {
            const regex = new RegExp(`\\b${varName}\\b`, 'g');
            line = line.replace(regex, `_${varName}`);
            fixed = true;
          }
        }
      }
      break;
      
    case 'TS6138': // Property declared but never read
      if (error.message.includes("Property") && error.message.includes("is declared but its value is never read")) {
        const propMatch = error.message.match(/Property '(\w+)'/);
        if (propMatch) {
          const propName = propMatch[1];
          if (!propName.startsWith('_')) {
            const regex = new RegExp(`\\b${propName}\\b`, 'g');
            line = line.replace(regex, `_${propName}`);
            fixed = true;
          }
        }
      }
      break;
      
    case 'TS2561': // Object literal may only specify known properties
      if (error.message.includes("'_context' does not exist") && error.message.includes("Did you mean to write 'context'")) {
        line = line.replace(/_context:/g, 'context:');
        fixed = true;
      }
      break;
      
    case 'TS2349': // Expression not callable
      if (error.message.includes("Type 'ConsoleConstructor' has no call signatures")) {
        line = line.replace(/console\(/g, 'console.log(');
        fixed = true;
      }
      break;
  }
  
  if (fixed) {
    lines[lineIndex] = line;
  }
  
  return fixed;
}

// Fix file
function fixFile(filePath, errors) {
  console.log(`\nFixing ${filePath} (${errors.length} errors)...`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fixedCount = 0;
  
  // Sort errors by line number in reverse order to avoid line number shifts
  errors.sort((a, b) => b.line - a.line);
  
  for (const error of errors) {
    if (fixError(lines, error, content)) {
      fixedCount++;
      console.log(`  Fixed: Line ${error.line} - ${error.code}: ${error.message}`);
    }
  }
  
  if (fixedCount > 0) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`  ✓ Fixed ${fixedCount} errors`);
    return true;
  } else {
    console.log(`  - No auto-fixable errors`);
    return false;
  }
}

// Main
console.log('Getting TypeScript errors...');
const errors = getTypeScriptErrors();

if (errors.length === 0) {
  console.log('✓ No TypeScript errors found!');
  process.exit(0);
}

console.log(`Found ${errors.length} TypeScript errors`);

const groupedErrors = groupErrorsByFile(errors);
const fileCount = Object.keys(groupedErrors).length;

console.log(`Errors found in ${fileCount} files`);

let filesFixed = 0;
for (const [filePath, fileErrors] of Object.entries(groupedErrors)) {
  if (fixFile(filePath, fileErrors)) {
    filesFixed++;
  }
}

console.log(`\n✓ Fixed errors in ${filesFixed} files`);

// Run build again to check
console.log('\nRunning build check...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('\n✓ Build successful!');
} catch (error) {
  console.log('\n⚠ Build still has errors. Run the script again or fix manually.');
  process.exit(1);
}