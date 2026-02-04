#!/usr/bin/env node
/**
 * Auto-install correct better-sqlite3 binary for current environment
 */

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const isClaudeDesktop = process.env.MCP_SERVER_NAME === 'devflow-monitor';
const platform = os.platform();
const arch = process.arch;

console.log('=== Better-SQLite3 Auto Installer ===');
console.log(`Platform: ${platform}`);
console.log(`Architecture: ${arch}`);
console.log(`Claude Desktop: ${isClaudeDesktop ? 'Yes' : 'No'}`);

// Check if already installed
const sqlitePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(sqlitePath)) {
  try {
    const output = execSync(`file "${sqlitePath}"`, { encoding: 'utf8' });
    console.log(`Current binary: ${output.trim()}`);
    
    // Check architecture match
    if (isClaudeDesktop && output.includes('x86_64')) {
      console.log('✓ Correct x86_64 binary for Claude Desktop');
      process.exit(0);
    } else if (!isClaudeDesktop && output.includes(arch)) {
      console.log(`✓ Correct ${arch} binary for development`);
      process.exit(0);
    }
  } catch (e) {
    // file command not available, continue with reinstall
  }
}

// Need to install correct version
console.log('Installing correct better-sqlite3 binary...');

try {
  // Remove existing installation
  if (fs.existsSync(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'))) {
    console.log('Removing existing better-sqlite3...');
    execSync('rm -rf node_modules/better-sqlite3', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit' 
    });
  }

  // Install based on environment
  if (platform === 'darwin' && isClaudeDesktop) {
    // Force x86_64 for Claude Desktop on macOS
    console.log('Installing x86_64 binary for Claude Desktop...');
    execSync('arch -x86_64 npm install better-sqlite3@9.6.0 --no-save', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit' 
    });
  } else {
    // Normal installation for development
    console.log(`Installing native ${arch} binary...`);
    execSync('npm install better-sqlite3@9.6.0 --no-save', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit' 
    });
  }

  console.log('✓ Better-SQLite3 installed successfully');
} catch (error) {
  console.error('✗ Failed to install better-sqlite3:', error.message);
  console.error('\nPlease install manually:');
  console.error('  Claude Desktop: arch -x86_64 npm install better-sqlite3@9.6.0');
  console.error('  Development: npm install better-sqlite3@9.6.0');
  process.exit(1);
}