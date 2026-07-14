import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { parseRepoSources, RawSourceFile } from './src/lib/parser';
import { ComparisonDelta, ComparisonSummary, ParseResults, RepoValidation, SourceFileStatus, RequirementDefinition } from './src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const execFileAsync = promisify(execFile);

const REQUIRED_NORMATIVE = ['HLR_math.md', 'HLR_replay.md', 'HLR_target_io.md', 'HLR_witness.md'];
const REQUIRED_DESIGN = ['LLR_math.md', 'LLR_replay.md', 'LLR_target_io.md', 'LLR_witness.md'];
const MATRIX_PATH = 'docs/normative/traceability_matrix.md';
const DEFAULT_REPO_URL = 'https://github.com/delk73/precision-replay.git';
const DEFAULT_REF = 'main';
const SNAPSHOT_ROOT = path.join(os.tmpdir(), 'precision-replay-requirements-browser');

function resolveInsideRepo(repoPath: string, relativePath: string): string {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Refusing to read outside repo root: ${relativePath}`);
  }
  return target;
}

async function exists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function readIfPresent(repoPath: string, relativePath: string, required: boolean): Promise<{ status: SourceFileStatus; file?: RawSourceFile }> {
  const fullPath = resolveInsideRepo(repoPath, relativePath);
  if (!(await exists(fullPath))) {
    return { status: { path: relativePath, required, loaded: false, reason: 'not found' } };
  }

  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    return { status: { path: relativePath, required, loaded: false, reason: 'not a file' } };
  }

  const content = await fs.readFile(fullPath, 'utf8');
  return {
    status: { path: relativePath, required, loaded: true },
    file: { path: relativePath, content, required },
  };
}

async function listMarkdownFiles(repoPath: string, relativeDir: string, prefix?: string): Promise<string[]> {
  const fullDir = resolveInsideRepo(repoPath, relativeDir);
  if (!(await exists(fullDir))) return [];
  const entries = await fs.readdir(fullDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && (!prefix || entry.name.startsWith(prefix)))
    .map((entry) => `${relativeDir}/${entry.name}`.replace(/\\/g, '/'));
}

async function validateRepoPath(repoPath: string): Promise<RepoValidation> {
  const resolved = path.resolve(repoPath || '');
  const validation: RepoValidation = { ok: true, repoPath: resolved, sourceMode: 'local', warnings: [], errors: [] };

  if (!repoPath || !(await exists(resolved))) {
    validation.ok = false;
    validation.errors.push('repoPath does not exist.');
    return validation;
  }

  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    validation.ok = false;
    validation.errors.push('repoPath is not a directory.');
    return validation;
  }

  for (const requiredDir of ['docs/normative', 'docs/design']) {
    if (!(await exists(resolveInsideRepo(resolved, requiredDir)))) {
      validation.ok = false;
      validation.errors.push(`${requiredDir} does not exist.`);
    }
  }

  if (!(await exists(resolveInsideRepo(resolved, MATRIX_PATH)))) {
    validation.ok = false;
    validation.errors.push(`${MATRIX_PATH} does not exist.`);
  }

  const basename = path.basename(resolved).toLowerCase();
  if (basename !== 'precision-replay') {
    validation.warnings.push('repoPath does not end with precision-replay; verify this is the intended target checkout.');
  }

  return validation;
}

function sanitizeSnapshotPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'snapshot';
}

function snapshotPathFor(repoUrl: string, ref: string): string {
  const urlTail = repoUrl.replace(/\.git$/i, '').split(/[/:\\]/).filter(Boolean).slice(-2).join('-');
  return path.join(SNAPSHOT_ROOT, `${sanitizeSnapshotPart(urlTail)}-${sanitizeSnapshotPart(ref)}`);
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  });
  return stdout.trim();
}

async function listRemoteBranches(repoUrl: string): Promise<string[]> {
  const output = await runGit(['ls-remote', '--heads', repoUrl || DEFAULT_REPO_URL]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((refName): refName is string => Boolean(refName?.startsWith('refs/heads/')))
    .map((refName) => refName.replace('refs/heads/', ''))
    .sort((a, b) => {
      if (a === DEFAULT_REF) return -1;
      if (b === DEFAULT_REF) return 1;
      return a.localeCompare(b);
    });
}

async function ensureGitSnapshot(repoUrl: string, ref: string): Promise<RepoValidation> {
  const safeRepoUrl = repoUrl || DEFAULT_REPO_URL;
  const safeRef = ref || DEFAULT_REF;
  const targetPath = snapshotPathFor(safeRepoUrl, safeRef);
  await fs.mkdir(SNAPSHOT_ROOT, { recursive: true });

  if (!(await exists(path.join(targetPath, '.git')))) {
    await fs.rm(targetPath, { recursive: true, force: true });
    await runGit(['clone', '--filter=blob:none', '--no-checkout', safeRepoUrl, targetPath]);
  } else {
    await runGit(['remote', 'set-url', 'origin', safeRepoUrl], targetPath);
  }

  await runGit(['fetch', '--depth=1', 'origin', safeRef], targetPath);
  await runGit(['checkout', '--detach', 'FETCH_HEAD'], targetPath);
  const resolvedSha = await runGit(['rev-parse', 'HEAD'], targetPath);
  const validation = await validateRepoPath(targetPath);
  validation.sourceMode = 'github_snapshot';
  validation.repoUrl = safeRepoUrl;
  validation.ref = safeRef;
  validation.resolvedSha = resolvedSha;
  validation.repoPath = targetPath;
  validation.warnings = validation.warnings.filter((warning) => !warning.includes('repoPath does not end with precision-replay'));
  return validation;
}

async function scanRepo(validation: RepoValidation) {
  const requiredPaths = [
    ...REQUIRED_NORMATIVE.map((name) => `docs/normative/${name}`),
    ...REQUIRED_DESIGN.map((name) => `docs/design/${name}`),
    MATRIX_PATH,
  ];

  const optionalPaths = Array.from(new Set([
    ...(await listMarkdownFiles(validation.repoPath, 'docs/normative', 'HLR_')),
    ...(await listMarkdownFiles(validation.repoPath, 'docs/design', 'LLR_')),
    ...(await listMarkdownFiles(validation.repoPath, 'docs/verification')),
  ])).filter((relativePath) => !requiredPaths.includes(relativePath));

  const sourceFiles: SourceFileStatus[] = [];
  const files: RawSourceFile[] = [];

  for (const relativePath of requiredPaths) {
    const result = await readIfPresent(validation.repoPath, relativePath, true);
    sourceFiles.push(result.status);
    if (result.file) files.push(result.file);
  }

  for (const relativePath of optionalPaths) {
    const result = await readIfPresent(validation.repoPath, relativePath, false);
    sourceFiles.push(result.status);
    if (result.file) files.push(result.file);
  }

  return parseRepoSources({ validation, sourceFiles, files });
}

function requirementStatus(results: ParseResults, id: string, kind: 'hlr' | 'llr'): string {
  const row = results.matrixRows.find((matrixRow) => (
    kind === 'hlr' ? matrixRow.detectedHlrIds.includes(id) : matrixRow.detectedLlrIds.includes(id)
  ));
  return row?.normalizedStatus || 'untraced';
}

function buildComparison(base: ParseResults, compare: ParseResults): ComparisonSummary {
  const deltas: ComparisonDelta[] = [];
  const baseReqs = new Map<string, RequirementDefinition>([
    ...base.hlrs.map((req): [string, RequirementDefinition] => [`hlr:${req.id}`, req]),
    ...base.llrs.map((req): [string, RequirementDefinition] => [`llr:${req.id}`, req]),
  ]);
  const compareReqs = new Map<string, RequirementDefinition>([
    ...compare.hlrs.map((req): [string, RequirementDefinition] => [`hlr:${req.id}`, req]),
    ...compare.llrs.map((req): [string, RequirementDefinition] => [`llr:${req.id}`, req]),
  ]);

  compareReqs.forEach((req, key) => {
    const baseReq = baseReqs.get(key);
    if (!baseReq) {
      deltas.push({
        id: req.id,
        kind: req.kind,
        change: 'added',
        title: req.title,
        sourceFile: req.sourceFile,
        sourceLine: req.sourceLine,
        text: req.text,
        rawSnippet: req.rawSnippet,
        status: requirementStatus(compare, req.id, req.kind) as ComparisonDelta['status'],
        message: `${req.id} exists only in compare branch ${compare.validation.ref}; it is absent from base branch ${base.validation.ref}.`,
      });
      return;
    }
    if (baseReq.text !== req.text || baseReq.title !== req.title) {
      deltas.push({
        id: req.id,
        kind: req.kind,
        change: 'changed',
        title: req.title,
        sourceFile: req.sourceFile,
        sourceLine: req.sourceLine,
        text: req.text,
        rawSnippet: req.rawSnippet,
        status: requirementStatus(compare, req.id, req.kind) as ComparisonDelta['status'],
        message: `${req.id} definition differs between base ${base.validation.ref} and compare ${compare.validation.ref}.`,
      });
    }
    const baseStatus = requirementStatus(base, req.id, req.kind);
    const compareStatus = requirementStatus(compare, req.id, req.kind);
    if (baseStatus !== compareStatus) {
      deltas.push({
        id: req.id,
        kind: req.kind,
        change: 'status_changed',
        title: req.title,
        sourceFile: req.sourceFile,
        sourceLine: req.sourceLine,
        text: req.text,
        rawSnippet: req.rawSnippet,
        status: compareStatus as ComparisonDelta['status'],
        message: `${req.id} status differs: base ${base.validation.ref} is ${baseStatus}, compare ${compare.validation.ref} is ${compareStatus}.`,
      });
    }
  });

  baseReqs.forEach((req, key) => {
    if (!compareReqs.has(key)) {
      deltas.push({
        id: req.id,
        kind: req.kind,
        change: 'removed',
        title: req.title,
        sourceFile: req.sourceFile,
        sourceLine: req.sourceLine,
        text: req.text,
        rawSnippet: req.rawSnippet,
        status: requirementStatus(base, req.id, req.kind) as ComparisonDelta['status'],
        message: `${req.id} exists only in base branch ${base.validation.ref}; it is absent from compare branch ${compare.validation.ref}.`,
      });
    }
  });

  const compareRows = new Map(compare.matrixRows.map((row) => [row.rowNumber, row]));
  base.matrixRows.forEach((baseRow) => {
    const compareRow = compareRows.get(baseRow.rowNumber);
    if (compareRow && baseRow.normalizedStatus !== compareRow.normalizedStatus) {
      deltas.push({
        id: `row-${baseRow.rowNumber}`,
        kind: 'matrix_row',
        change: 'status_changed',
        message: `Matrix row ${baseRow.rowNumber} status changed from ${baseRow.normalizedStatus} to ${compareRow.normalizedStatus}.`,
      });
    }
  });

  return {
    baseRef: base.validation.ref || 'base',
    baseSha: base.validation.resolvedSha,
    compareRef: compare.validation.ref || 'compare',
    compareSha: compare.validation.resolvedSha,
    deltas: deltas.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

app.get('/api/scan', async (req, res) => {
  const repoPath = String(req.query.repoPath || '');
  const mode = String(req.query.mode || (repoPath ? 'local' : 'github_snapshot'));
  const repoUrl = String(req.query.repoUrl || DEFAULT_REPO_URL);
  const ref = String(req.query.ref || DEFAULT_REF);
  const compareRef = String(req.query.compareRef || '');
  try {
    const validation = mode === 'github_snapshot'
      ? await ensureGitSnapshot(repoUrl, ref)
      : await validateRepoPath(repoPath);
    const results = await scanRepo(validation);
    if (mode === 'github_snapshot' && compareRef && compareRef !== ref) {
      const compareValidation = await ensureGitSnapshot(repoUrl, compareRef);
      const compareResults = await scanRepo(compareValidation);
      results.comparison = buildComparison(results, compareResults);
    }
    res.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({
      validation: { ok: false, repoPath, sourceMode: mode === 'github_snapshot' ? 'github_snapshot' : 'local', repoUrl, ref, warnings: [], errors: [message] },
      sourceFiles: [],
      hlrs: [],
      llrs: [],
      matrixRows: [],
      evidencePaths: [],
      referencedOnly: [],
      missingIds: [],
      audits: [],
      workPackets: [],
    });
  }
});

app.get('/api/branches', async (req, res) => {
  const repoUrl = String(req.query.repoUrl || DEFAULT_REPO_URL);
  try {
    const branches = await listRemoteBranches(repoUrl);
    res.json({ repoUrl, branches });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ repoUrl, branches: [], error: message });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Requirements browser listening on http://localhost:${port}`);
});
