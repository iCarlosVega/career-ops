#!/usr/bin/env node

/**
 * doctor.mjs — Setup validation for career-ops
 * Checks all prerequisites and prints a pass/fail checklist.
 */

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

// ANSI colors (only on TTY)
const isTTY = process.stdout.isTTY;
const green = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const dim = (s) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0]);
  if (major >= 18) {
    return { pass: true, label: `Node.js >= 18 (v${process.versions.node})` };
  }
  return {
    pass: false,
    label: `Node.js >= 18 (found v${process.versions.node})`,
    fix: 'Install Node.js 18 or later from https://nodejs.org',
  };
}

function checkDependencies() {
  if (existsSync(join(projectRoot, 'node_modules'))) {
    return { pass: true, label: 'Dependencies installed' };
  }
  return {
    pass: false,
    label: 'Dependencies not installed',
    fix: 'Run: npm install',
  };
}

async function checkPlaywright() {
  try {
    const { chromium } = await import('playwright');
    const execPath = chromium.executablePath();
    if (existsSync(execPath)) {
      return { pass: true, label: 'Playwright chromium installed' };
    }
    return {
      pass: false,
      label: 'Playwright chromium not installed',
      fix: 'Run: npx playwright install chromium',
    };
  } catch {
    return {
      pass: false,
      label: 'Playwright chromium not installed',
      fix: 'Run: npx playwright install chromium',
    };
  }
}

function checkCv() {
  const hasTex = existsSync(join(projectRoot, 'cv.tex'));
  const hasMd = existsSync(join(projectRoot, 'cv.md'));
  if (hasTex) return { pass: true, label: 'cv.tex found (LaTeX pipeline active)' };
  if (hasMd) return { pass: true, label: 'cv.md found (HTML pipeline active)' };
  return {
    pass: false,
    label: 'No CV found (cv.tex or cv.md required)',
    fix: [
      'For LaTeX resume: paste your .tex file as cv.tex in the project root',
      'For markdown resume: create cv.md in the project root',
      'See examples/ for reference CVs',
    ],
  };
}

// ── LaTeX compiler paths to check (including post-brew-install locations) ──
// pdflatex preferred — cv.tex uses pdfTeX primitives (pdfgentounicode, glyphtounicode)
const LATEX_CANDIDATES = [
  'pdflatex', 'xelatex', 'lualatex',
  '/Library/TeX/texbin/pdflatex',
  '/Library/TeX/texbin/xelatex',
  '/usr/texbin/pdflatex',
  '/usr/local/bin/pdflatex',
];

// Required LaTeX packages for cv.tex (fontawesome, marvosym used in the resume template)
const REQUIRED_TEX_PACKAGES = ['fontawesome', 'marvosym'];

function findLatexCompiler() {
  for (const cmd of LATEX_CANDIDATES) {
    try {
      if (cmd.startsWith('/')) {
        if (existsSync(cmd)) return cmd;
      } else {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        return cmd;
      }
    } catch { /* not found, try next */ }
  }
  return null;
}

function findTlmgr() {
  const candidates = [
    'tlmgr',
    '/Library/TeX/texbin/tlmgr',
    '/usr/texbin/tlmgr',
  ];
  for (const cmd of candidates) {
    try {
      if (cmd.startsWith('/')) {
        if (existsSync(cmd)) return cmd;
      } else {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        return cmd;
      }
    } catch { /* not found */ }
  }
  return null;
}

function getMissingPackages(tlmgr) {
  try {
    const installed = execSync(`${tlmgr} list --only-installed`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 15_000,
    });
    return REQUIRED_TEX_PACKAGES.filter(pkg => !installed.includes(pkg));
  } catch {
    return REQUIRED_TEX_PACKAGES; // assume all missing if tlmgr list fails
  }
}

function checkLatex() {
  // Only required when cv.tex exists
  if (!existsSync(join(projectRoot, 'cv.tex'))) {
    return { pass: true, label: 'LaTeX (skipped — no cv.tex in project root)' };
  }

  const compiler = findLatexCompiler();

  if (!compiler) {
    // Auto-install BasicTeX via Homebrew
    console.log(`  ${dim('→ LaTeX not found. Installing BasicTeX via Homebrew (this may take a few minutes)...')}`);
    try {
      execSync('brew install --quiet basictex', { stdio: 'inherit', timeout: 300_000 });
    } catch {
      return {
        pass: false,
        label: 'LaTeX not installed (Homebrew install failed)',
        fix: [
          'Run manually: brew install basictex',
          'Then open a new terminal and run: npm run doctor',
        ],
      };
    }
  }

  // Re-detect after potential install
  const foundCompiler = findLatexCompiler();
  if (!foundCompiler) {
    return {
      pass: false,
      label: 'LaTeX installed but compiler not found in PATH yet',
      fix: ['Open a new terminal and run: npm run doctor'],
    };
  }

  // Check and install required packages
  const tlmgr = findTlmgr();
  if (tlmgr) {
    const missing = getMissingPackages(tlmgr);
    if (missing.length > 0) {
      console.log(`  ${dim(`→ Installing missing LaTeX packages: ${missing.join(', ')}...`)}`);
      try {
        execSync(`sudo ${tlmgr} update --self`, { stdio: 'inherit', timeout: 60_000 });
        execSync(`sudo ${tlmgr} install ${missing.join(' ')}`, { stdio: 'inherit', timeout: 120_000 });
      } catch {
        return {
          pass: false,
          label: `LaTeX found but missing packages: ${missing.join(', ')}`,
          fix: [
            `Run: sudo tlmgr update --self`,
            `Run: sudo tlmgr install ${missing.join(' ')}`,
          ],
        };
      }
    }
  }

  return { pass: true, label: `LaTeX ready (${foundCompiler})` };
}

function checkProfile() {
  if (existsSync(join(projectRoot, 'config', 'profile.yml'))) {
    return { pass: true, label: 'config/profile.yml found' };
  }
  return {
    pass: false,
    label: 'config/profile.yml not found',
    fix: [
      'Run: cp config/profile.example.yml config/profile.yml',
      'Then edit it with your details',
    ],
  };
}

function checkPortals() {
  if (existsSync(join(projectRoot, 'portals.yml'))) {
    return { pass: true, label: 'portals.yml found' };
  }
  return {
    pass: false,
    label: 'portals.yml not found',
    fix: [
      'Run: cp templates/portals.example.yml portals.yml',
      'Then customize with your target companies',
    ],
  };
}

function checkFonts() {
  const fontsDir = join(projectRoot, 'fonts');
  if (!existsSync(fontsDir)) {
    return {
      pass: false,
      label: 'fonts/ directory not found',
      fix: 'The fonts/ directory is required for PDF generation',
    };
  }
  try {
    const files = readdirSync(fontsDir);
    if (files.length === 0) {
      return {
        pass: false,
        label: 'fonts/ directory is empty',
        fix: 'The fonts/ directory must contain font files for PDF generation',
      };
    }
  } catch {
    return {
      pass: false,
      label: 'fonts/ directory not readable',
      fix: 'Check permissions on the fonts/ directory',
    };
  }
  return { pass: true, label: 'Fonts directory ready' };
}

function checkAutoDir(name) {
  const dirPath = join(projectRoot, name);
  if (existsSync(dirPath)) {
    return { pass: true, label: `${name}/ directory ready` };
  }
  try {
    mkdirSync(dirPath, { recursive: true });
    return { pass: true, label: `${name}/ directory ready (auto-created)` };
  } catch {
    return {
      pass: false,
      label: `${name}/ directory could not be created`,
      fix: `Run: mkdir ${name}`,
    };
  }
}

async function main() {
  console.log('\ncareer-ops doctor');
  console.log('================\n');

  const checks = [
    checkNodeVersion(),
    checkDependencies(),
    await checkPlaywright(),
    checkCv(),
    checkLatex(),
    checkProfile(),
    checkPortals(),
    checkFonts(),
    checkAutoDir('data'),
    checkAutoDir('output'),
    checkAutoDir('reports'),
  ];

  let failures = 0;

  for (const result of checks) {
    if (result.pass) {
      console.log(`${green('✓')} ${result.label}`);
    } else {
      failures++;
      console.log(`${red('✗')} ${result.label}`);
      const fixes = Array.isArray(result.fix) ? result.fix : [result.fix];
      for (const hint of fixes) {
        console.log(`  ${dim('→ ' + hint)}`);
      }
    }
  }

  console.log('');
  if (failures > 0) {
    console.log(`Result: ${failures} issue${failures === 1 ? '' : 's'} found. Fix them and run \`npm run doctor\` again.`);
    process.exit(1);
  } else {
    console.log('Result: All checks passed. You\'re ready to go! Run `claude` to start.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('doctor.mjs failed:', err.message);
  process.exit(1);
});
