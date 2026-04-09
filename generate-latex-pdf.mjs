#!/usr/bin/env node

/**
 * generate-latex-pdf.mjs — Compile a LaTeX file to PDF
 *
 * Usage:
 *   node generate-latex-pdf.mjs <input.tex> <output.pdf>
 *
 * Requires: BasicTeX or MacTeX installed (brew install basictex)
 * Prefers xelatex (better font support), falls back to pdflatex.
 *
 * Compiles twice — standard practice to resolve internal references.
 * Aux files are written to a temp directory and cleaned up automatically.
 */

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, copyFileSync, statSync, readFileSync } from 'fs';
import { join, dirname, basename, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputArg = process.argv[2];
const outputArg = process.argv[3];

if (!inputArg || !outputArg) {
  console.error('Usage: node generate-latex-pdf.mjs <input.tex> <output.pdf>');
  process.exit(1);
}

const inputPath = resolvePath(inputArg);
const outputPath = resolvePath(outputArg);

if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

// ── Detect compiler ────────────────────────────────────────────────────────

function findCompiler() {
  // pdflatex preferred — cv.tex uses pdfTeX primitives (pdfgentounicode, glyphtounicode)
  for (const compiler of ['pdflatex', 'xelatex', 'lualatex']) {
    try {
      execSync(`which ${compiler}`, { stdio: 'pipe' });
      return compiler;
    } catch {
      // not found, try next
    }
  }
  return null;
}

const compiler = findCompiler();
if (!compiler) {
  console.error('No LaTeX compiler found. Install BasicTeX: brew install basictex');
  console.error('After install, open a new terminal and retry.');
  process.exit(1);
}

console.log(`Using compiler: ${compiler}`);

// ── Compile ────────────────────────────────────────────────────────────────

const texName = basename(inputPath);
const pdfName = texName.replace(/\.tex$/, '.pdf');
const tmpDir = mkdtempSync(join(tmpdir(), 'career-ops-latex-'));

// Copy tex file to tmp dir so aux files land there, not in project root.
// Compile from the directory containing the original tex so relative
// \input{} and \includegraphics{} paths resolve correctly.
const sourceDir = dirname(inputPath);

function compile() {
  execSync(
    `${compiler} -interaction=nonstopmode -output-directory="${tmpDir}" "${inputPath}"`,
    {
      cwd: sourceDir,
      stdio: 'pipe',
      timeout: 60_000,
    }
  );
}

try {
  compile(); // pass 1
} catch {
  // pdflatex exits non-zero on warnings too — check if PDF was created before failing
}

if (!existsSync(join(tmpDir, pdfName))) {
  // First pass failed hard — print errors from log and exit
  const logPath = join(tmpDir, texName.replace(/\.tex$/, '.log'));
  if (existsSync(logPath)) {
    const log = readFileSync(logPath, 'utf-8');
    const errors = log.split('\n').filter(l => l.startsWith('!'));
    if (errors.length) {
      console.error('\nLaTeX errors:\n' + errors.join('\n'));
    } else {
      console.error('\nCompilation failed. Check the .tex file.');
    }
  }
  process.exit(1);
}

try {
  compile(); // pass 2 — resolves cross-references
} catch {
  // Second pass warnings are usually safe to ignore if PDF exists
}

// ── Move PDF to requested output path ─────────────────────────────────────

const builtPdf = join(tmpDir, pdfName);

if (!existsSync(builtPdf)) {
  console.error('Compilation failed — no PDF produced.');
  process.exit(1);
}

copyFileSync(builtPdf, outputPath);

const sizeKb = Math.round(statSync(outputPath).size / 1024);
console.log(`PDF generated: ${outputPath} (${sizeKb} KB)`);
