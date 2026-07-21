import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileCode,
  Layers,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  Table,
} from 'lucide-react';
import { AuditItem, ComparisonDelta, HlrObject, LlrObject, MatrixRowObject, NormalizedStatus, ParseResults, RepoValidation, RequirementKind } from './types';
import { buildNeighborhoodGraph } from './lib/graph';
import { tokenizeMatrixRowText, MatrixRowTokenCategory } from './lib/matrixRowHighlighting';
import { REPLAY_PRESENTATION_PROFILE } from './lib/replayPresentation';
import { DerivedImplementationStatus, DerivedTraceStatus, deriveImplementationStatus, deriveTraceStatus } from './lib/status';
import { tokenizeRequirementText } from './lib/textTinting';

const EMPTY_RESULTS: ParseResults = {
  validation: { ok: false, repoPath: '', sourceMode: 'github_snapshot', warnings: [], errors: ['No precision-replay snapshot loaded.'] },
  sourceFiles: [],
  hlrs: [],
  llrs: [],
  matrixRows: [],
  evidencePaths: [],
  referencedOnly: [],
  missingIds: [],
  audits: [],
  workPackets: [],
  comparison: undefined,
};

type Tab = 'requirements' | 'trace' | 'audit' | 'work';
type DiffFilter = 'all' | 'added' | 'removed' | 'changed' | 'status_changed';
type RequirementSummary = ReturnType<typeof summarizeRequirement>;
type MatrixRowLinkContext = Pick<RepoValidation, 'repoUrl' | 'resolvedSha'>;
type ScanSettings = {
  repoUrl: string;
  baseRef: string;
  compareEnabled: boolean;
  compareRef: string;
};

const DEFAULT_REPO_URL = 'https://github.com/delk73/precision-replay.git';
const DEFAULT_REF = 'main';
const DEFAULT_LEFT_WIDTH = 380;
const DEFAULT_RIGHT_WIDTH = 360;
const TRACE_STATUS_BREAKDOWN_ORDER: DerivedTraceStatus[] = ['traced', 'pending', 'untraced', 'unknown'];
const IMPLEMENTATION_STATUS_BREAKDOWN_ORDER: DerivedImplementationStatus[] = ['tested', 'proof_partial', 'implemented', 'boundary_only', 'pending', 'unknown'];

function resolveCompareRef(baseRef: string, requestedCompareRef: string, branches: string[], preferredFallback = ''): string {
  const fallbackCandidates = [preferredFallback, ...branches].filter((branch) => branch && branch !== baseRef);
  if (!requestedCompareRef || requestedCompareRef === baseRef) return fallbackCandidates[0] || '';
  if (!branches.length) return requestedCompareRef;
  return branches.includes(requestedCompareRef) ? requestedCompareRef : fallbackCandidates[0] || '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function storedNumber(key: string, fallback: number): number {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function statusClass(status: NormalizedStatus): string {
  switch (status) {
    case 'implemented':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    case 'tested':
      return 'bg-teal-500/10 text-teal-300 border-teal-500/30';
    case 'pending':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'proof_partial':
      return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
    case 'boundary_only':
      return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30';
    case 'traced':
      return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
    case 'untraced':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    default:
      return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
  }
}

function domainFrom(id: string, sourceFile = ''): string {
  const text = `${id} ${sourceFile}`.toLowerCase();
  if (text.includes('target-io') || text.includes('target_io')) return 'Target IO';
  if (text.includes('witness')) return 'Witness';
  if (text.includes('math')) return 'Math';
  if (text.includes('replay')) return 'Replay';
  if (text.includes('runner')) return 'Runner';
  return 'General';
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function githubBlobUrl(context: MatrixRowLinkContext, sourceFile: string, sourceLine: number): string | null {
  if (!context.repoUrl || !context.resolvedSha || !sourceFile || !sourceLine) return null;
  const repo = parseGitHubRepoUrl(context.repoUrl);
  if (!repo) return null;
  const filePath = sourceFile.split('/').map(encodeURIComponent).join('/');
  const plain = /\.md$/i.test(sourceFile) ? '?plain=1' : '';
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${context.resolvedSha}/${filePath}${plain}#L${sourceLine}`;
}

function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const trimmed = repoUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/#?]+?)(?:\.git)?$/i);
  if (sshMatch?.groups?.owner && sshMatch.groups.repo) {
    return { owner: sshMatch.groups.owner, repo: sshMatch.groups.repo };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
  } catch {
    return null;
  }
}

export default function App() {
  const [repoUrl, setRepoUrl] = useState(localStorage.getItem('precision_replay_repo_url') || DEFAULT_REPO_URL);
  const [repoRef, setRepoRef] = useState(localStorage.getItem('precision_replay_repo_ref') || DEFAULT_REF);
  const [compareEnabled, setCompareEnabled] = useState(localStorage.getItem('precision_replay_compare_enabled') === 'true');
  const [compareRef, setCompareRef] = useState(localStorage.getItem('precision_replay_compare_ref') || '');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [diffFilterTouched, setDiffFilterTouched] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [results, setResults] = useState<ParseResults>(EMPTY_RESULTS);
  const [lastScanSettings, setLastScanSettings] = useState<ScanSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('requirements');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedKind, setSelectedKind] = useState<RequirementKind>('hlr');
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [leftWidth, setLeftWidth] = useState(() => storedNumber('precision_replay_left_width', DEFAULT_LEFT_WIDTH));
  const [rightWidth, setRightWidth] = useState(() => storedNumber('precision_replay_right_width', DEFAULT_RIGHT_WIDTH));

  const startLeftResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftWidth;
    const onMove = (moveEvent: MouseEvent) => {
      setLeftWidth(clamp(startWidth + moveEvent.clientX - startX, 320, 560));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startRightResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightWidth;
    const onMove = (moveEvent: MouseEvent) => {
      setRightWidth(clamp(startWidth - (moveEvent.clientX - startX), 280, 560));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    localStorage.setItem('precision_replay_left_width', String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem('precision_replay_right_width', String(rightWidth));
  }, [rightWidth]);

  const scan = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const effectiveCompareRef = compareEnabled ? resolveCompareRef(repoRef, compareRef, branches) : '';
      if (compareEnabled && effectiveCompareRef !== compareRef) setCompareRef(effectiveCompareRef);
      const params = new URLSearchParams({ mode: 'github_snapshot', repoUrl, ref: repoRef });
      if (compareEnabled && effectiveCompareRef && effectiveCompareRef !== repoRef) params.set('compareRef', effectiveCompareRef);
      const response = await fetch(`/api/scan?${params.toString()}`);
      const body = (await response.json()) as ParseResults;
      setResults(body);
      localStorage.setItem('precision_replay_repo_url', repoUrl);
      localStorage.setItem('precision_replay_repo_ref', repoRef);
      localStorage.setItem('precision_replay_compare_enabled', String(compareEnabled));
      localStorage.setItem('precision_replay_compare_ref', effectiveCompareRef);
      setLastScanSettings({ repoUrl, baseRef: repoRef, compareEnabled, compareRef: effectiveCompareRef });
      const first = body.hlrs[0] || body.llrs[0];
      if (first && !body.hlrs.some((h) => h.id === selectedId) && !body.llrs.some((l) => l.id === selectedId)) {
        setSelectedId(first.id);
        setSelectedKind(first.kind);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setResults(EMPTY_RESULTS);
      setLastScanSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const effectiveCompareRef = compareEnabled ? resolveCompareRef(repoRef, compareRef, branches) : '';
  const comparisonRequested = compareEnabled && Boolean(effectiveCompareRef);
  const comparisonSettingsChanged = Boolean(
    compareEnabled
    && results.comparison
    && lastScanSettings
    && (
      lastScanSettings.repoUrl !== repoUrl
      || lastScanSettings.baseRef !== repoRef
      || lastScanSettings.compareEnabled !== compareEnabled
      || lastScanSettings.compareRef !== effectiveCompareRef
    ),
  );
  const comparisonActive = compareEnabled && Boolean(results.comparison) && !comparisonSettingsChanged;

  const loadBranches = async () => {
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const response = await fetch(`/api/branches?repoUrl=${encodeURIComponent(repoUrl)}`);
      const rawBody = await response.text();
      let body: { branches: string[]; error?: string };
      try {
        body = JSON.parse(rawBody) as { branches: string[]; error?: string };
      } catch {
        throw new Error('Branch endpoint returned HTML; restart the dev server so /api/branches is available.');
      }
      if (!response.ok) throw new Error(body.error || 'Unable to load branches.');
      setBranches(body.branches);
      if (body.branches.length > 0 && !body.branches.includes(repoRef)) {
        setRepoRef(body.branches.includes(DEFAULT_REF) ? DEFAULT_REF : body.branches[0]);
      }
      if (body.branches.length > 0 && (!compareRef || !body.branches.includes(compareRef))) {
        setCompareRef(body.branches.find((branch) => branch !== repoRef) || body.branches[0]);
      }
    } catch (error) {
      setBranches([]);
      setBranchesError(error instanceof Error ? error.message : String(error));
    } finally {
      setBranchesLoading(false);
    }
  };

  useEffect(() => {
    void scan();
    // Run once on startup; the refresh button owns subsequent scans.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadBranches();
    // Branch population is refreshed when the repo URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  useEffect(() => {
    if (comparisonActive && !diffFilterTouched) {
      setDiffFilter('changed');
    }
    if (!comparisonActive && !diffFilterTouched) {
      setDiffFilter('all');
    }
  }, [comparisonActive, diffFilterTouched]);

  const activeDiffFilter = comparisonActive ? diffFilter : 'all';

  const requirements = useMemo(() => {
    const rows = results.matrixRows;
    const baseRequirements = [
      ...results.hlrs.map((req) => summarizeRequirement(req, rows)),
      ...results.llrs.map((req) => summarizeRequirement(req, rows)),
    ];
    const combined = activeDiffFilter === 'all'
      ? baseRequirements
      : (results.comparison?.deltas || [])
        .filter((delta) => delta.kind === 'hlr' || delta.kind === 'llr')
        .filter((delta) => delta.change === activeDiffFilter)
        .map((delta) => summarizeDelta(delta, results.hlrs, results.llrs, rows));
    const needle = searchQuery.trim().toLowerCase();
    return combined.filter((req) => {
      if (!needle) return true;
      const terms = needle.split(/\s+/).filter(Boolean);
      const positiveTerms = terms.filter((term) => !term.startsWith('-'));
      const negativeTerms = terms
        .filter((term) => term.startsWith('-'))
        .map((term) => term.slice(1))
        .filter(Boolean);
      const haystack = `${req.id} ${req.title} ${req.sourceFile} ${req.traceStatus} ${req.implementationStatus} ${req.kind} ${domainFrom(req.id, req.sourceFile)}`.toLowerCase();
      return positiveTerms.every((term) => haystack.includes(term))
        && negativeTerms.every((term) => !haystack.includes(term));
    });
  }, [results, searchQuery, activeDiffFilter]);

  useEffect(() => {
    if (requirements.length === 0) {
      setSelectedId('');
      setSelectedRow(null);
      return;
    }
    if (!requirements.some((req) => req.id === selectedId && req.kind === selectedKind)) {
      setSelectedId(requirements[0].id);
      setSelectedKind(requirements[0].kind);
      const row = results.matrixRows.find((item) => (
        requirements[0].kind === 'hlr' ? item.detectedHlrIds.includes(requirements[0].id) : item.detectedLlrIds.includes(requirements[0].id)
      ));
      setSelectedRow(row?.rowNumber ?? null);
    }
  }, [requirements, results.matrixRows, selectedId, selectedKind]);

  const selectedRequirement = useMemo(() => {
    const baseRequirement = selectedKind === 'hlr'
      ? results.hlrs.find((h) => h.id === selectedId) || null
      : results.llrs.find((l) => l.id === selectedId) || null;
    if (baseRequirement || activeDiffFilter === 'all') return baseRequirement;
    const delta = results.comparison?.deltas.find((item) => item.id === selectedId && item.kind === selectedKind);
    return delta ? deltaToRequirement(delta) : null;
  }, [results, selectedId, selectedKind, activeDiffFilter]);

  const selectedRows = useMemo(() => {
    return results.matrixRows.filter((row) =>
      selectedKind === 'hlr' ? row.detectedHlrIds.includes(selectedId) : row.detectedLlrIds.includes(selectedId),
    );
  }, [results.matrixRows, selectedId, selectedKind]);

  const linkedLlrs = useMemo(() => {
    if (selectedKind !== 'hlr') return [];
    return results.llrs.filter((llr) => llr.tracedHlrIds.includes(selectedId));
  }, [results.llrs, selectedId, selectedKind]);

  const linkedHlrs = useMemo(() => {
    if (selectedKind !== 'llr') return [];
    const llr = results.llrs.find((item) => item.id === selectedId);
    return results.hlrs.filter((hlr) => llr?.tracedHlrIds.includes(hlr.id));
  }, [results.hlrs, results.llrs, selectedId, selectedKind]);

  const activeRow = useMemo(() => {
    return results.matrixRows.find((row) => row.rowNumber === selectedRow) || selectedRows[0] || null;
  }, [results.matrixRows, selectedRow, selectedRows]);

  const selectedComparisonDelta = useMemo(() => {
    if (!comparisonActive) return null;
    return results.comparison?.deltas.find((delta) => delta.id === selectedId && delta.kind === selectedKind) || null;
  }, [comparisonActive, results.comparison, selectedId, selectedKind]);

  const graph = useMemo(
    () =>
      buildNeighborhoodGraph(selectedId, selectedKind, results.hlrs, results.llrs, results.matrixRows, {
        includeLlrs: true,
        includeRows: true,
        includePaths: true,
        pendingOnly: false,
        evidenceBearingOnly: false,
      }),
    [results, selectedId, selectedKind],
  );

  const isAuditScoped = searchQuery.trim().length > 0 || activeDiffFilter !== 'all';

  const visibleAuditGroups = useMemo(() => {
    if (!isAuditScoped) return groupAudits(results.audits);

    const visibleHlrIds = new Set(requirements.filter((req) => req.kind === 'hlr').map((req) => req.id));
    const visibleLlrIds = new Set(requirements.filter((req) => req.kind === 'llr').map((req) => req.id));
    const visibleRowNumbers = new Set<number>();

    results.matrixRows.forEach((row) => {
      const isLinkedToVisibleRequirement = row.detectedHlrIds.some((id) => visibleHlrIds.has(id))
        || row.detectedLlrIds.some((id) => visibleLlrIds.has(id));
      if (isLinkedToVisibleRequirement) visibleRowNumbers.add(row.rowNumber);
    });

    const visibleAudits = results.audits.filter((audit) => (
      Boolean(audit.hlrId && visibleHlrIds.has(audit.hlrId))
      || Boolean(audit.llrId && visibleLlrIds.has(audit.llrId))
      || Boolean(audit.rowNumber && visibleRowNumbers.has(audit.rowNumber))
    ));

    return groupAudits(visibleAudits);
  }, [activeDiffFilter, isAuditScoped, requirements, results.audits, results.matrixRows, searchQuery]);

  const loadedRequired = results.sourceFiles.filter((file) => file.required && file.loaded).length;
  const totalRequired = results.sourceFiles.filter((file) => file.required).length;
  const comparisonFreshResults = comparisonActive ? results : { ...results, comparison: undefined };
  const diffLabels = useMemo(() => buildDiffLabels(comparisonFreshResults, repoRef, compareRef), [comparisonFreshResults, repoRef, compareRef]);
  const activeDiffSummary = useMemo(() => (comparisonActive ? buildActiveDiffSummary(results, activeDiffFilter) : null), [activeDiffFilter, comparisonActive, results]);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const visibleRequirementSummary = useMemo(() => ({
    hlrCount: requirements.filter((req) => req.kind === 'hlr').length,
    llrCount: requirements.filter((req) => req.kind === 'llr').length,
    requirementCount: requirements.length,
  }), [requirements]);
  const orderedRequirements = useMemo(() => buildSidebarItems(requirements), [requirements]);

  const selectRequirement = (id: string, kind: RequirementKind) => {
    setSelectedId(id);
    setSelectedKind(kind);
    const row = results.matrixRows.find((item) => (kind === 'hlr' ? item.detectedHlrIds.includes(id) : item.detectedLlrIds.includes(id)));
    setSelectedRow(row?.rowNumber ?? null);
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-slate-200">
      <header className="border-b border-slate-800 bg-[#111419] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">precision-replay Requirements Browser</h1>
            <p className="text-xs text-slate-400">Fresh precision-replay snapshot by default. Truth comes only from parsed repo files at the resolved SHA.</p>
          </div>
          <div className="grid gap-2 lg:min-w-[46rem]">
            <div className="text-[10px] font-semibold uppercase text-sky-300">Fresh GitHub snapshot</div>
            <div className="grid gap-2 sm:grid-cols-[minmax(18rem,1fr)_minmax(12rem,18rem)_auto]">
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="w-full rounded border border-slate-700 bg-[#0A0B0E] px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-500"
                aria-label="GitHub repository URL"
              />
              <label className="grid gap-1">
                <span className="text-[10px] uppercase text-slate-500">Base branch</span>
                <select
                  value={repoRef}
                      onChange={(event) => {
                        const nextRef = event.target.value;
                        setRepoRef(nextRef);
                        setCompareRef((current) => resolveCompareRef(nextRef, current, branches, repoRef));
                      }}
                  className="w-full rounded border border-slate-700 bg-[#0A0B0E] px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-500"
                  aria-label="Base branch"
                  disabled={branchesLoading}
                >
                  {!branches.includes(repoRef) && <option value={repoRef}>{repoRef}</option>}
                  {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
              </label>
              <ScanButton loading={loading} scan={scan} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(12rem,1fr)]">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={compareEnabled}
                    onChange={(event) => {
                      setCompareEnabled(event.target.checked);
                      if (event.target.checked) setCompareRef((current) => resolveCompareRef(repoRef, current, branches));
                    }}
                  className="h-4 w-4 accent-sky-500"
                />
                Compare branch
              </label>
              {compareEnabled && (
                <label className="grid gap-1">
                  <span className="text-[10px] uppercase text-slate-500">Compare against</span>
                  <select
                    value={compareRef}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCompareRef(next);
                      }}
                    className="w-full rounded border border-slate-700 bg-[#0A0B0E] px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-500"
                    aria-label="Compare against branch"
                    disabled={branchesLoading}
                  >
                    {!branches.includes(compareRef) && compareRef && <option value={compareRef}>{compareRef}</option>}
                    {branches.filter((branch) => branch !== repoRef).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className="grid h-[calc(100vh-117px)] grid-cols-1 overflow-hidden lg:grid-cols-[var(--left-width)_6px_minmax(0,1fr)]"
        style={{ '--left-width': `${leftWidth}px` } as React.CSSProperties}
      >
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-[#111419]/70">
          <div className="border-b border-slate-800 p-4">
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              {activeDiffSummary ? (
                <>
                  <Metric label="HLR affected" value={activeDiffSummary.hlrCount} secondary={`${results.hlrs.length} total`} />
                  <Metric label="LLR affected" value={activeDiffSummary.llrCount} secondary={`${results.llrs.length} total`} />
                  <Metric label={compactDiffLabel(activeDiffFilter)} value={activeDiffSummary.activeDeltaCount} secondary={`${activeDiffSummary.totalDeltaCount} total deltas`} />
                </>
              ) : (
                <>
                  {hasSearchQuery ? (
                    <>
                      <Metric label="HLR shown" value={visibleRequirementSummary.hlrCount} secondary={`${results.hlrs.length} total`} />
                      <Metric label="LLR shown" value={visibleRequirementSummary.llrCount} secondary={`${results.llrs.length} total`} />
                      <Metric label="Requirements shown" value={visibleRequirementSummary.requirementCount} secondary={`${results.hlrs.length + results.llrs.length} total`} />
                    </>
                  ) : (
                    <>
                      <Metric label="HLR" value={results.hlrs.length} secondary={comparisonSettingsChanged ? 'stale comparison' : compareEnabled ? 'no comparison' : undefined} muted={comparisonSettingsChanged} />
                      <Metric label="LLR" value={results.llrs.length} secondary={comparisonSettingsChanged ? 'stale comparison' : compareEnabled ? 'no comparison' : undefined} muted={comparisonSettingsChanged} />
                      <Metric label="Rows" value={results.matrixRows.length} secondary={comparisonSettingsChanged ? 'stale comparison' : compareEnabled ? 'no comparison' : undefined} muted={comparisonSettingsChanged} />
                    </>
                  )}
                </>
              )}
            </div>
            <div className={`rounded border p-3 text-xs ${results.validation.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
              <div className="flex items-center gap-2 font-semibold">
                {results.validation.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertCircle className="h-4 w-4 text-rose-300" />}
                <span>{results.validation.ok ? 'Source snapshot validated' : 'Validation needed'}</span>
              </div>
              <SourceSummary results={results} />
              <ComparisonStatus results={results} requested={Boolean(comparisonRequested)} stale={comparisonSettingsChanged} />
              {branchesError && <p className="mt-1 text-amber-200">Branch list unavailable: {branchesError}</p>}
              {branchesLoading && <p className="mt-1 text-slate-400">Loading branches...</p>}
              <p className="mt-2 text-slate-400">Required files loaded: {loadedRequired} / {totalRequired || 9}</p>
              {[...results.validation.errors, ...results.validation.warnings, ...(loadError ? [loadError] : [])].map((item) => (
                <p key={item} className="mt-1 text-amber-200">{item}</p>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 rounded border border-slate-800 bg-[#0A0B0E] px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search ID, status, source; use -term to exclude"
                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-600"
              />
            </label>
            {(comparisonActive || comparisonRequested) && (
              <label className="mt-2 block">
                <span className="mb-1 block text-[10px] uppercase text-slate-500">Diff filter</span>
                <select
                  value={activeDiffFilter}
                  onChange={(event) => {
                    setDiffFilterTouched(true);
                    setDiffFilter(event.target.value as DiffFilter);
                  }}
                  className="w-full rounded border border-slate-800 bg-[#0A0B0E] px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="all">{diffLabels.all}</option>
                  <option value="removed">{diffLabels.removed}</option>
                  <option value="added">{diffLabels.added}</option>
                  <option value="changed">{diffLabels.changed}</option>
                  <option value="status_changed">{diffLabels.status_changed}</option>
                </select>
              </label>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {orderedRequirements.map((item) =>
              item.type === 'section' ? (
                <div
                  key={item.key}
                  className="mb-2 mt-3 border-b border-slate-800 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0"
                >
                  {item.label}
                </div>
              ) : item.type === 'bucket' ? (
                <div
                  key={item.key}
                  className="sticky top-0 z-10 mb-2 rounded border border-slate-800 bg-[#111419] px-2 py-1 text-[10px] font-semibold uppercase text-slate-500"
                >
                  {item.label}
                </div>
              ) : (
                <RequirementListItem
                  key={`${item.req.kind}-${item.req.id}`}
                  req={item.req}
                  selected={selectedId === item.req.id && selectedKind === item.req.kind}
                  groupKey={item.groupKey}
                  onSelect={() => selectRequirement(item.req.id, item.req.kind)}
                />
              ),
            )}
          </div>
        </aside>
        <div
          role="separator"
          aria-label="Resize requirements list"
          onMouseDown={startLeftResize}
          className="hidden cursor-col-resize border-x border-slate-900 bg-slate-800/40 hover:bg-sky-500/30 lg:block"
        />

        <section className="flex min-h-0 flex-col">
          <nav className="flex border-b border-slate-800 bg-[#111419] px-4">
            <TabButton active={activeTab === 'requirements'} onClick={() => setActiveTab('requirements')} icon={<BookOpen className="h-4 w-4" />} label="Requirement" />
            <TabButton active={activeTab === 'trace'} onClick={() => setActiveTab('trace')} icon={<Network className="h-4 w-4" />} label="Trace Path" />
            <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ShieldAlert className="h-4 w-4" />} label="Audit" />
            <TabButton active={activeTab === 'work'} onClick={() => setActiveTab('work')} icon={<Layers className="h-4 w-4" />} label="System View" />
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeTab === 'requirements' && requirements.length === 0 && activeDiffFilter !== 'all' ? (
              <EmptyState
                title={comparisonActive ? 'No matching diff requirements' : 'Comparison not scanned'}
                body={comparisonActive ? 'This diff filter has no parsed HLR or LLR matches.' : 'Click Scan to load comparison data before browsing a diff subset.'}
              />
            ) : activeTab === 'requirements' && (
              <RequirementDetail
                requirement={selectedRequirement}
                rows={selectedRows}
                activeRow={activeRow}
                comparisonDelta={selectedComparisonDelta}
                hasComparison={comparisonActive}
                linkContext={results.validation}
                linkedHlrs={linkedHlrs}
                linkedLlrs={linkedLlrs}
                rightWidth={rightWidth}
                onRightResize={startRightResize}
                onRowSelect={setSelectedRow}
              />
            )}
            {activeTab === 'trace' && <TraceView graph={graph} rows={results.matrixRows} activeRow={activeRow} linkContext={results.validation} />}
            {activeTab === 'audit' && <AuditView groups={visibleAuditGroups} isScoped={isAuditScoped} rows={results.matrixRows} linkContext={results.validation} onFocus={selectRequirement} onRowFocus={(row) => { setSelectedRow(row); setActiveTab('requirements'); }} />}
            {activeTab === 'work' && <WorkPacketView results={results} requirements={requirements} linkContext={results.validation} isScoped={isAuditScoped} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function ScanButton({ loading, scan }: { loading: boolean; scan: () => Promise<void> }) {
  return (
            <button
              type="button"
              onClick={() => void scan()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Scan
            </button>
  );
}

function SourceSummary({ results }: { results: ParseResults }) {
  const validation = results.validation;
  return (
    <div className="mt-2 space-y-1 text-slate-400">
      <p>Mode: GitHub snapshot</p>
      <p className="break-all font-mono text-[10px]">{validation.repoUrl || DEFAULT_REPO_URL}@{validation.ref || DEFAULT_REF}</p>
      {validation.resolvedSha && <p className="break-all font-mono text-[10px]">SHA {validation.resolvedSha}</p>}
    </div>
  );
}

function ComparisonStatus({ results, requested, stale }: { results: ParseResults; requested: boolean; stale: boolean }) {
  const comparison = results.comparison;
  if (comparison && stale) {
    return (
      <div className="mt-2 rounded border border-amber-400/50 bg-amber-400/10 p-2 text-[11px] text-amber-100">
        <p className="font-semibold">Comparison settings changed. Results below are from the previous scan.</p>
        <p className="mt-1 break-all font-mono text-[10px] text-amber-200">
          Previous scan: {comparison.baseRef} {'->'} {comparison.compareRef}
        </p>
        <p className="mt-1 text-amber-200">Click Scan before using comparison counters, diff filters, trace summaries, or branch-delta review.</p>
      </div>
    );
  }
  if (comparison) {
    const counts = comparison.deltas.reduce<Record<string, number>>((acc, delta) => {
      acc[delta.change] = (acc[delta.change] || 0) + 1;
      return acc;
    }, {});
    return (
      <div className="mt-2 rounded border border-sky-500/20 bg-sky-500/5 p-2 text-[11px] text-sky-100">
        <p className="font-semibold">Comparing {comparison.baseRef} against {comparison.compareRef}</p>
        <p className="break-all font-mono text-[10px] text-sky-200">
          Base {comparison.baseRef} {'->'} compare {comparison.compareRef}
        </p>
        <p className="mt-1 text-sky-200">
          {comparison.deltas.length} deltas: {counts.removed || 0} only in base, {counts.added || 0} only in compare, {counts.changed || 0} definition differs, {counts.status_changed || 0} status differs
        </p>
      </div>
    );
  }
  if (requested) {
    return (
      <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-100">
        Compare branch selected. Click Scan to compare base branch against the selected branch.
      </div>
    );
  }
  return null;
}

export function summarizeRequirement(req: HlrObject | LlrObject, rows: MatrixRowObject[]) {
  const matching = rows.filter((row) => (req.kind === 'hlr' ? row.detectedHlrIds.includes(req.id) : row.detectedLlrIds.includes(req.id)));
  const implementationEvidencePaths = Array.from(new Set(matching.flatMap((row) => row.detectedPaths).filter(isImplementationEvidencePath)));
  const hasSameRowSupportingRelation = matching.some((row) => row.detectedHlrIds.length + row.detectedLlrIds.length > 2);
  return {
    id: req.id,
    kind: req.kind,
    title: req.title,
    sourceFile: req.sourceFile,
    sourceLine: req.sourceLine,
    traceStatus: deriveTraceStatus(matching),
    implementationStatus: deriveImplementationStatus(matching),
    evidenceCount: implementationEvidencePaths.length,
    hasSameRowSupportingRelation,
    diffType: undefined as ComparisonDelta['change'] | undefined,
  };
}

function groupAudits(audits: AuditItem[]): Record<string, AuditItem[]> {
  return audits.reduce<Record<string, AuditItem[]>>((groups, audit) => {
    groups[audit.category] = groups[audit.category] || [];
    groups[audit.category].push(audit);
    return groups;
  }, {});
}

function buildDiffLabels(results: ParseResults, fallbackBase: string, fallbackCompare: string): Record<DiffFilter, string> {
  const base = results.comparison?.baseRef || fallbackBase || 'base';
  const compare = results.comparison?.compareRef || fallbackCompare || 'compare';
  return {
    all: `All requirements in ${base}`,
    added: `Only in ${compare}`,
    removed: `Only in ${base}`,
    changed: `Definition differs: ${base} vs ${compare}`,
    status_changed: `Status differs: ${base} vs ${compare}`,
  };
}

function compactDiffLabel(activeDiffFilter: DiffFilter): string {
  return {
    all: 'All deltas',
    added: 'Only in compare',
    removed: 'Only in base',
    changed: 'Definition differs',
    status_changed: 'Status differs',
  }[activeDiffFilter];
}

export function summarizeDelta(delta: ComparisonDelta, hlrs: HlrObject[], llrs: LlrObject[], rows: MatrixRowObject[]): RequirementSummary {
  const loadedRequirement = delta.kind === 'hlr'
    ? hlrs.find((hlr) => hlr.id === delta.id)
    : delta.kind === 'llr'
      ? llrs.find((llr) => llr.id === delta.id)
      : null;
  if (loadedRequirement) return { ...summarizeRequirement(loadedRequirement, rows), diffType: delta.change };

  return {
    id: delta.id,
    kind: delta.kind as RequirementKind,
    title: delta.title || delta.message,
    sourceFile: delta.sourceFile || 'comparison',
    sourceLine: delta.sourceLine || 1,
    traceStatus: 'unknown' as DerivedTraceStatus,
    implementationStatus: 'unknown' as DerivedImplementationStatus,
    evidenceCount: 0,
    hasSameRowSupportingRelation: false,
    diffType: delta.change,
  };
}

function isImplementationEvidencePath(path: string): boolean {
  return Boolean(path) && !/^(docs|doc)\//i.test(path) && !/\.md$/i.test(path);
}

export type SidebarItem =
  | { type: 'section'; key: string; label: string }
  | { type: 'bucket'; key: string; label: string }
  | { type: 'requirement'; req: RequirementSummary; groupKey?: string };

export function buildSidebarItems(requirements: RequirementSummary[]): SidebarItem[] {
  const replayHlrs = requirements.filter((req) => req.kind === 'hlr' && req.id.startsWith('HLR-REPLAY-'));
  const replayLlrs = requirements.filter((req) => req.kind === 'llr' && req.id.startsWith('LLR-REPLAY-'));
  const otherRequirements = requirements.filter((req) => !req.id.includes('-REPLAY-'));
  const hasReplayStory = replayHlrs.length > 0 || replayLlrs.length > 0;
  if (!hasReplayStory) return requirements.map((req) => ({ type: 'requirement', req }));

  const items: SidebarItem[] = [];
  const { storyBuckets, plumbingBuckets, storySectionLabel, plumbingSectionLabel } = REPLAY_PRESENTATION_PROFILE;

  if (replayHlrs.some((req) => storyBuckets.some((bucket) => bucket.match(req.id)))) {
    items.push({ type: 'section', key: 'replay-story-section', label: storySectionLabel });
  }

  storyBuckets.forEach((bucket) => {
    const bucketRequirements = replayHlrs.filter((req) => bucket.match(req.id));
    if (bucketRequirements.length === 0) return;
    items.push({ type: 'bucket', key: bucket.key, label: bucket.label });
    bucketRequirements.forEach((req) => items.push({ type: 'requirement', req, groupKey: bucket.key }));
  });

  if (replayHlrs.some((req) => plumbingBuckets.some((bucket) => bucket.match(req.id)))) {
    items.push({ type: 'section', key: 'replay-plumbing-section', label: plumbingSectionLabel });
  }

  plumbingBuckets.forEach((bucket) => {
    const bucketRequirements = replayHlrs.filter((req) => bucket.match(req.id));
    if (bucketRequirements.length === 0) return;
    items.push({ type: 'bucket', key: bucket.key, label: bucket.label });
    bucketRequirements.forEach((req) => items.push({ type: 'requirement', req, groupKey: bucket.key }));
  });

  const uncategorizedReplay = replayHlrs.filter((req) => (
    !storyBuckets.some((bucket) => bucket.match(req.id))
    && !plumbingBuckets.some((bucket) => bucket.match(req.id))
  ));
  if (uncategorizedReplay.length > 0) {
    items.push({ type: 'bucket', key: 'replay-other', label: 'Replay Other' });
    uncategorizedReplay.forEach((req) => items.push({ type: 'requirement', req, groupKey: 'plumbing' }));
  }

  if (replayLlrs.length > 0) {
    items.push({ type: 'bucket', key: 'replay-llr', label: 'Replay LLRs' });
    replayLlrs.forEach((req) => items.push({ type: 'requirement', req, groupKey: 'plumbing' }));
  }

  if (otherRequirements.length > 0) {
    items.push({ type: 'bucket', key: 'outside-replay', label: 'Outside Replay Story' });
    otherRequirements.forEach((req) => items.push({ type: 'requirement', req }));
  }

  return items;
}

function RequirementListItem({ req, selected, groupKey, onSelect }: {
  req: RequirementSummary;
  selected: boolean;
  groupKey?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mb-2 w-full rounded border p-3 text-left text-xs transition ${
        selected
          ? 'border-sky-500/60 bg-sky-500/10'
          : `${sidebarCardTintClass(groupKey)} hover:border-slate-700`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-semibold text-slate-100">{req.id}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-slate-400">{req.title}</p>
      <div className="mt-2 flex items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[10px]">
        <span className={`shrink-0 rounded border px-1.5 py-0.5 uppercase ${cardTraceStatusClass(req.traceStatus)}`}>{req.traceStatus.toUpperCase()}</span>
        <span className="shrink-0 text-slate-600">&middot;</span>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 uppercase ${cardImplementationStatusClass(req.implementationStatus)}`}>IMPL {req.implementationStatus.toUpperCase()}</span>
        <span className="shrink-0 text-slate-600">&middot;</span>
        <span className="truncate text-slate-500">{codeTestLinkLabel(req.evidenceCount)}</span>
      </div>
      {req.diffType && <p className="mt-1 text-[10px] text-sky-300">{comparisonLabel(req.diffType)}</p>}
    </button>
  );
}

function codeTestLinkLabel(count: number): string {
  if (count === 0) return 'no code/test links';
  return `${count} code/test ${count === 1 ? 'link' : 'links'}`;
}

function cardTraceStatusClass(status: DerivedTraceStatus): string {
  switch (status) {
    case 'traced':
      return 'border-blue-400/20 bg-blue-400/10 text-blue-200/85';
    case 'pending':
      return 'border-slate-400/20 bg-slate-400/10 text-slate-300/80';
    case 'untraced':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-200/75';
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400';
  }
}

function cardImplementationStatusClass(status: DerivedImplementationStatus): string {
  switch (status) {
    case 'tested':
    case 'implemented':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200/85';
    case 'pending':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200/80';
    case 'proof_partial':
      return 'border-teal-400/20 bg-teal-400/10 text-teal-200/80';
    case 'boundary_only':
      return 'border-slate-400/20 bg-slate-400/10 text-slate-300/80';
    default:
      return 'border-slate-500/20 bg-slate-500/10 text-slate-400';
  }
}

function sidebarCardTintClass(groupKey?: string): string {
  switch (groupKey) {
    case 'system':
    case 'schema':
    case 'canonical-input':
      return 'border-slate-800 bg-[rgba(14,24,38,0.78)]';
    case 'run':
    case 'validation':
      return 'border-slate-800 bg-[rgba(12,31,24,0.72)]';
    case 'execution-record':
    case 'trace':
      return 'border-slate-800 bg-[rgba(9,29,35,0.72)]';
    case 'comparison':
    case 'evaluation':
      return 'border-slate-800 bg-[rgba(25,20,38,0.72)]';
    case 'profile':
    case 'timing':
      return 'border-slate-800 bg-[rgba(15,30,32,0.7)]';
    case 'operations':
    case 'envelope':
    case 'target':
      return 'border-slate-800 bg-[rgba(35,30,20,0.68)]';
    case 'parse':
    case 'projection':
    case 'checker':
    case 'initial-math':
    case 'plumbing':
      return 'border-slate-800 bg-[rgba(17,20,25,0.78)]';
    default:
      return 'border-slate-800 bg-[#0A0B0E]';
  }
}

export function buildActiveDiffSummary(results: ParseResults, activeDiffFilter: DiffFilter): { hlrCount: number; llrCount: number; activeDeltaCount: number; totalDeltaCount: number } | null {
  if (!results.comparison) return null;
  const activeDeltas = activeDiffFilter === 'all'
    ? results.comparison.deltas
    : results.comparison.deltas.filter((delta) => delta.change === activeDiffFilter);
  return {
    hlrCount: new Set(activeDeltas.filter((delta) => delta.kind === 'hlr').map((delta) => delta.id)).size,
    llrCount: new Set(activeDeltas.filter((delta) => delta.kind === 'llr').map((delta) => delta.id)).size,
    activeDeltaCount: activeDeltas.length,
    totalDeltaCount: results.comparison.deltas.length,
  };
}

export function countRequirementStatuses(requirements: RequirementSummary[]) {
  return {
    traceStatusCounts: requirements.reduce<Record<DerivedTraceStatus, number>>((counts, req) => {
      counts[req.traceStatus] = (counts[req.traceStatus] || 0) + 1;
      return counts;
    }, {} as Record<DerivedTraceStatus, number>),
    implementationStatusCounts: requirements.reduce<Record<DerivedImplementationStatus, number>>((counts, req) => {
      counts[req.implementationStatus] = (counts[req.implementationStatus] || 0) + 1;
      return counts;
    }, {} as Record<DerivedImplementationStatus, number>),
  };
}

function deltaToRequirement(delta: ComparisonDelta): HlrObject | LlrObject | null {
  if (delta.kind !== 'hlr' && delta.kind !== 'llr') return null;
  const base = {
    id: delta.id,
    kind: delta.kind,
    title: delta.title || delta.id,
    text: delta.text || delta.message,
    sourceFile: delta.sourceFile || 'comparison',
    sourceLine: delta.sourceLine || 1,
    rawSnippet: delta.rawSnippet || delta.text || delta.message,
  };
  return delta.kind === 'hlr' ? { ...base, kind: 'hlr' } : { ...base, kind: 'llr', tracedHlrIds: [], hasTraceDeclaration: false };
}

function Metric({ label, value, secondary, muted = false }: { label: string; value: number; secondary?: string; muted?: boolean }) {
  return (
    <div className={`rounded border p-2 ${muted ? 'border-amber-500/25 bg-amber-500/5 opacity-70' : 'border-slate-800 bg-[#0A0B0E]'}`}>
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      {secondary && <div className={`mt-1 text-[10px] ${muted ? 'font-semibold text-amber-200' : 'text-slate-600'}`}>{secondary}</div>}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold ${
        active ? 'border-sky-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RequirementDetail({
  requirement,
  rows,
  activeRow,
  comparisonDelta,
  hasComparison,
  linkContext,
  linkedHlrs,
  linkedLlrs,
  rightWidth,
  onRightResize,
  onRowSelect,
}: {
  requirement: HlrObject | LlrObject | null;
  rows: MatrixRowObject[];
  activeRow: MatrixRowObject | null;
  comparisonDelta: ComparisonDelta | null;
  hasComparison: boolean;
  linkContext: MatrixRowLinkContext;
  linkedHlrs: HlrObject[];
  linkedLlrs: LlrObject[];
  rightWidth: number;
  onRightResize: (event: React.MouseEvent) => void;
  onRowSelect: (row: number) => void;
}) {
  if (!requirement) {
    return <EmptyState title="No requirement selected" body="Scan a valid checkout, then select a parsed HLR or LLR." />;
  }

  const activeRowPaths = activeRow?.detectedPaths ?? [];
  const requirementEvidencePaths = Array.from(new Set(rows.flatMap((row) => row.detectedPaths)));
  const traceStatus = deriveTraceStatus(rows);
  const implementationStatus = deriveImplementationStatus(rows);
  const showTestedWithoutEvidenceWarning = implementationStatus === 'tested' && requirementEvidencePaths.length === 0;
  const statusSources = traceStatus === 'traced'
    ? rows.filter((row) => ['traced', 'implemented', 'tested', 'proof_partial', 'boundary_only'].includes(row.normalizedStatus))
    : rows;
  const statusSourceRows = statusSources.length > 0 ? statusSources : rows;
  const activeRowStatusDiffers = Boolean(
    activeRow
    && ['tested', 'proof_partial', 'implemented', 'boundary_only'].includes(activeRow.normalizedStatus)
    && activeRow.normalizedStatus !== implementationStatus,
  );
  const hasMixedStatuses = new Set(rows.map((row) => row.normalizedStatus)).size > 1;

  return (
    <div
      className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_6px_var(--right-width)]"
      style={{ '--right-width': `${rightWidth}px` } as React.CSSProperties}
    >
      <div className="space-y-5">
        <section className="rounded border border-slate-800 bg-[#111419] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-700 px-2 py-1 font-mono text-xs uppercase">{requirement.kind}</span>
            <h2 className="text-xl font-semibold">{requirement.id}</h2>
          </div>
          <p className="mt-2 text-slate-300">{requirement.title}</p>
          <div className="mt-4 text-xs text-slate-400">
            <p>
              <span className="text-slate-500">Source:</span>{' '}
              <SourceLocation sourceFile={requirement.sourceFile} sourceLine={requirement.sourceLine} linkContext={linkContext} />
            </p>
          </div>
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-slate-800 bg-[#0A0B0E] p-4 whitespace-pre-wrap text-xs leading-6 text-slate-300"><TintedRequirementText text={requirement.text} /></pre>
        </section>

        <section className="rounded border border-slate-800 bg-[#111419] p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Table className="h-4 w-4" /> Matrix Rows</h3>
          {rows.length === 0 && <p className="text-sm text-rose-300">No matrix row exists; status is untraced.</p>}
          <div className="space-y-2">
            {rows.map((row) => {
              const isActiveRow = row.rowNumber === activeRow?.rowNumber;
              return (
              <div
                key={row.rowNumber}
                className={`w-full rounded border p-3 text-left text-xs ${
                  isActiveRow
                    ? 'border-sky-500/70 bg-sky-500/10 shadow-[inset_3px_0_0_rgba(56,189,248,0.75)]'
                    : 'border-slate-800 bg-[#0A0B0E] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <button type="button" onClick={() => onRowSelect(row.rowNumber)} className="font-mono font-semibold text-slate-100 underline-offset-2 hover:text-sky-200 hover:underline">
                      <MatrixRowOrdinal row={row} compact />
                    </button>
                    <span className="text-slate-600">&middot;</span>
                    <MatrixRowSource row={row} linkContext={linkContext} />
                    {isActiveRow && <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-200">active row</span>}
                  </span>
                  <span className={`rounded border px-2 py-0.5 uppercase ${statusClass(row.normalizedStatus)}`}>{row.rawStatusText}</span>
                </div>
                <p className="mt-2 break-words font-mono text-slate-400"><MatrixRowText text={row.rawText} /></p>
              </div>
              );
            })}
          </div>
        </section>
      </div>

      <div
        role="separator"
        aria-label="Resize trace detail rail"
        onMouseDown={onRightResize}
        className="hidden cursor-col-resize bg-slate-800/30 hover:bg-sky-500/30 xl:block"
      />

      <aside className="space-y-5 pl-5">
        <LinkedRequirements linkedHlrs={linkedHlrs} linkedLlrs={linkedLlrs} requirement={requirement} />
        <TraceSummary
          traceStatus={traceStatus}
          implementationStatus={implementationStatus}
          statusSourceRows={statusSourceRows}
          activeRow={activeRow}
          requirementEvidencePaths={requirementEvidencePaths}
          comparisonDelta={comparisonDelta}
          hasComparison={hasComparison}
          showTestedWithoutEvidenceWarning={showTestedWithoutEvidenceWarning}
          hasMixedStatuses={hasMixedStatuses}
          activeRowStatusDiffers={activeRowStatusDiffers}
        />
        <section className="rounded border border-slate-800 bg-[#111419] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCode className="h-4 w-4" /> Requirement Evidence</h3>
          {requirementEvidencePaths.length > 0 ? (
            <div className="space-y-2">
              {requirementEvidencePaths.map((path) => <p key={path} className="break-all rounded border border-slate-800 bg-[#0A0B0E] p-2 font-mono text-xs text-slate-300">{path}</p>)}
            </div>
          ) : showTestedWithoutEvidenceWarning ? (
            <p className="text-sm text-amber-200">Status is tested, but no evidence path was parsed for this requirement.</p>
          ) : (
            <p className="text-sm text-slate-500">No implementation or evidence path parsed for this requirement.</p>
          )}
        </section>
        <section className="rounded border border-slate-800 bg-[#111419] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCode className="h-4 w-4" /> Active Row Evidence</h3>
          {activeRowPaths.length ? (
            <div className="space-y-2">
              {activeRowPaths.map((path) => <p key={path} className="break-all rounded border border-slate-800 bg-[#0A0B0E] p-2 font-mono text-xs text-slate-300">{path}</p>)}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No implementation or evidence path named in the active matrix row.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

const MATRIX_ROW_TOKEN_CLASSES: Record<MatrixRowTokenCategory, string | undefined> = {
  path: 'text-teal-200',
  hlrId: 'text-sky-300',
  llrId: 'text-indigo-300',
  separator: 'text-slate-600',
  prose: undefined,
};

function MatrixRowText({ text }: { text: string }) {
  return (
    <>
      {tokenizeMatrixRowText(text).map((token, index) => {
        const className = MATRIX_ROW_TOKEN_CLASSES[token.category];
        return className
          ? <span key={index} className={className}>{token.text}</span>
          : <React.Fragment key={index}>{token.text}</React.Fragment>;
      })}
    </>
  );
}

function TintedRequirementText({ text }: { text: string }) {
  return (
    <>
      {tokenizeRequirementText(text).map((token, index) => token.className
        ? <span key={index} className={token.className}>{token.text}</span>
        : <React.Fragment key={index}>{token.text}</React.Fragment>)}
    </>
  );
}

function LinkedRequirements({ linkedHlrs, linkedLlrs, requirement }: { linkedHlrs: HlrObject[]; linkedLlrs: LlrObject[]; requirement: HlrObject | LlrObject }) {
  const items = requirement.kind === 'hlr' ? linkedLlrs : linkedHlrs;
  return (
    <section className="rounded border border-slate-800 bg-[#111419] p-4">
      <h3 className="mb-3 text-sm font-semibold">{requirement.kind === 'hlr' ? 'Traced LLRs' : 'Parent HLRs'}</h3>
      {items.length === 0 ? <p className="text-sm text-slate-500">No explicit trace link found.</p> : (
        <div className="space-y-2">
          {items.map((item) => <p key={item.id} className="rounded border border-slate-800 bg-[#0A0B0E] p-2 font-mono text-xs">{item.id}</p>)}
        </div>
      )}
    </section>
  );
}

function TraceSummary({
  traceStatus,
  implementationStatus,
  statusSourceRows,
  activeRow,
  requirementEvidencePaths,
  comparisonDelta,
  hasComparison,
  showTestedWithoutEvidenceWarning,
  hasMixedStatuses,
  activeRowStatusDiffers,
}: {
  traceStatus: DerivedTraceStatus;
  implementationStatus: DerivedImplementationStatus;
  statusSourceRows: MatrixRowObject[];
  activeRow: MatrixRowObject | null;
  requirementEvidencePaths: string[];
  comparisonDelta: ComparisonDelta | null;
  hasComparison: boolean;
  showTestedWithoutEvidenceWarning: boolean;
  hasMixedStatuses: boolean;
  activeRowStatusDiffers: boolean;
}) {
  const statusRowText = statusSourceRows.length === 1 ? '1 matrix row' : `${statusSourceRows.length} matrix rows`;
  const evidenceSummary = requirementEvidencePaths.length > 0 ? requirementEvidencePaths.join(', ') : 'none parsed';
  const compareSummary = hasComparison ? comparisonLabel(comparisonDelta?.change) : 'not scanned';
  const activeStatusSource = activeRow?.statusSource === 'explicit' ? `Explicit Status: ${activeRow.normalizedStatus} in active row.` : null;
  return (
    <section className="rounded border border-slate-800 bg-[#111419] p-4">
      <h3 className="mb-3 text-sm font-semibold">Trace Summary</h3>
      <div className="space-y-1 text-xs text-slate-400">
        <p><span className="text-slate-500">Trace status:</span> <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(traceStatus)}`}>{traceStatus}</span> <span>from {statusRowText}</span></p>
        <p><span className="text-slate-500">Implementation status:</span> <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(implementationStatus)}`}>{implementationStatus}</span></p>
        <p className="break-words"><span className="text-slate-500">Evidence:</span> <span className="font-mono">{evidenceSummary}</span></p>
        <p><span className="text-slate-500">Active row:</span> <span className="font-mono">{activeRow ? `Row ${activeRow.rowNumber}` : 'none'}</span></p>
        <p><span className="text-slate-500">Compare:</span> <span className="font-mono">{compareSummary}</span></p>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <p className="text-slate-500">{activeStatusSource || 'Statuses are derived from linked matrix rows.'}</p>
        {showTestedWithoutEvidenceWarning && <p className="text-amber-200">Tested status has no parsed evidence path.</p>}
        {hasMixedStatuses && <p className="text-amber-200">Requirement has multiple rows with different statuses.</p>}
        {activeRowStatusDiffers && <p className="text-amber-200">Active row differs from requirement implementation status.</p>}
      </div>
    </section>
  );
}

function comparisonLabel(change?: ComparisonDelta['change']): string {
  switch (change) {
    case 'added':
      return 'Only in compare';
    case 'removed':
      return 'Only in base';
    case 'changed':
      return 'Definition differs';
    case 'status_changed':
      return 'Status differs';
    default:
      return 'Unchanged';
  }
}

function MatrixRowOrdinal({ row, compact = false }: { row: MatrixRowObject; compact?: boolean }) {
  return <>{compact ? `Row ${row.rowNumber}` : `Matrix Row ${row.rowNumber}`}</>;
}

function MatrixRowSource({ row, linkContext }: { row: MatrixRowObject; linkContext: MatrixRowLinkContext }) {
  return <SourceLocation sourceFile={row.sourceFile} sourceLine={row.sourceLine} linkContext={linkContext} />;
}

function SourceLocation({ sourceFile, sourceLine, linkContext }: { sourceFile: string; sourceLine: number; linkContext: MatrixRowLinkContext }) {
  const sourceLabel = `${basename(sourceFile)}:${sourceLine}`;
  const href = githubBlobUrl(linkContext, sourceFile, sourceLine);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200">
      {sourceLabel}
    </a>
  ) : (
    <span className="font-mono text-slate-500">{sourceLabel}</span>
  );
}

function MatrixRowLabel({ row, linkContext, compact = false }: { row: MatrixRowObject; linkContext: MatrixRowLinkContext; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="font-mono font-semibold text-slate-100"><MatrixRowOrdinal row={row} compact={compact} /></span>
      <span className="text-slate-600">&middot;</span>
      <MatrixRowSource row={row} linkContext={linkContext} />
    </span>
  );
}

function numberRanges(values: number[]): string {
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  sorted.forEach((value) => {
    if (start === null || previous === null) {
      start = value;
      previous = value;
      return;
    }
    if (value === previous + 1) {
      previous = value;
      return;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = value;
    previous = value;
  });

  if (start !== null && previous !== null) {
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  }
  return ranges.join(', ');
}

function TraceView({ graph, rows, activeRow, linkContext }: { graph: ReturnType<typeof buildNeighborhoodGraph>; rows: MatrixRowObject[]; activeRow: MatrixRowObject | null; linkContext: MatrixRowLinkContext }) {
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  const directIds = new Set([...graph.hlrNodes.map((node) => node.id), ...graph.llrNodes.map((node) => node.id)]);
  const displayedRows = graph.rowNodes
    .map((node) => rowByNumber.get(Number(node.id.replace('row-', ''))))
    .filter((row): row is MatrixRowObject => Boolean(row));
  const rowItems = graph.rowNodes.map((node) => {
    const rowNumber = Number(node.id.replace('row-', ''));
    const row = rowByNumber.get(rowNumber);
    return row ? <MatrixRowLabel row={row} linkContext={linkContext} /> : node.label;
  });
  const sameRowContext = Array.from(new Set(displayedRows.flatMap((row) => [...row.detectedHlrIds, ...row.detectedLlrIds])))
    .filter((id) => !directIds.has(id))
    .sort();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <TraceColumn title="HLR" items={graph.hlrNodes.map((node) => node.label)} />
        <TraceColumn title="LLR" items={graph.llrNodes.map((node) => node.label)} />
        <TraceColumn title="Matrix Row" items={rowItems} />
        <TraceColumn title="Implementation / Evidence" items={graph.leafNodes.map((node) => node.label)} />
      </div>
      <section className="rounded border border-slate-800 bg-[#111419] p-4">
        <h3 className="mb-2 text-sm font-semibold">Active Trace Path</h3>
        <p className="font-mono text-xs text-slate-400">HLR -&gt; LLR -&gt; matrix row -&gt; implementation/evidence</p>
        {activeRow && (
          <div className="mt-3 space-y-2">
            <p className="text-xs"><MatrixRowLabel row={activeRow} linkContext={linkContext} /></p>
            <p className="break-words font-mono text-xs text-slate-300">{activeRow.rawText}</p>
          </div>
        )}
      </section>
      <section className="rounded border border-slate-800 bg-[#111419] p-4">
        <h3 className="mb-3 text-sm font-semibold">Other requirements in the same matrix row</h3>
        {sameRowContext.length === 0 ? (
          <p className="text-xs text-slate-600">No additional same-row requirements.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sameRowContext.map((id) => (
              <span key={id} className="rounded border border-slate-800 bg-[#0A0B0E] px-2 py-1 font-mono text-xs text-slate-300">{id}</span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TraceColumn({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <section className="min-h-64 rounded border border-slate-800 bg-[#111419] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase text-slate-400">{title}</h3>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-xs text-slate-600">No linked item.</p> : items.map((item, index) => <p key={index} className="rounded border border-slate-800 bg-[#0A0B0E] p-2 text-xs">{item}</p>)}
      </div>
    </section>
  );
}

function AuditView({
  groups,
  isScoped,
  rows,
  linkContext,
  onFocus,
  onRowFocus,
}: {
  groups: Record<string, AuditItem[]>;
  isScoped: boolean;
  rows: MatrixRowObject[];
  linkContext: MatrixRowLinkContext;
  onFocus: (id: string, kind: RequirementKind) => void;
  onRowFocus: (row: number) => void;
}) {
  const entries = Object.entries(groups);
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  if (entries.length === 0 && !isScoped) return <EmptyState title="No audit warnings" body="The loaded requirement graph has no parser audit findings." />;
  return (
    <div className="space-y-5">
      {isScoped && (
        <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100">
          Audit filtered by left requirement list.
        </div>
      )}
      {entries.length === 0 && (
        <section className="rounded border border-slate-800 bg-[#111419] p-4">
          <h3 className="text-sm font-semibold">No scoped audit warnings</h3>
          <p className="mt-2 text-sm text-slate-500">No audit findings are connected to the visible requirements.</p>
        </section>
      )}
      {entries.map(([category, audits]) => (
        <section key={category} className="rounded border border-slate-800 bg-[#111419] p-4">
          <h3 className="mb-3 text-sm font-semibold">{category} <span className="text-slate-500">({audits.length})</span></h3>
          <div className="space-y-2">
            {audits.map((audit) => (
              <div
                key={audit.id}
                className={`w-full rounded border p-3 text-left text-xs ${audit.severity === 'Error' ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (audit.hlrId) onFocus(audit.hlrId, 'hlr');
                      else if (audit.llrId) onFocus(audit.llrId, 'llr');
                      else if (audit.rowNumber) onRowFocus(audit.rowNumber);
                    }}
                    className="font-mono font-semibold underline-offset-2 hover:text-sky-200 hover:underline"
                  >
                    {audit.severity}
                  </button>
                  {audit.missingState && <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px]">{audit.missingState}</span>}
                  {audit.rowNumber && rowByNumber.has(audit.rowNumber) && (
                    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <button
                        type="button"
                        onClick={() => onRowFocus(audit.rowNumber!)}
                        className="font-mono font-semibold text-slate-100 underline-offset-2 hover:text-sky-200 hover:underline"
                      >
                        <MatrixRowOrdinal row={rowByNumber.get(audit.rowNumber)!} compact />
                      </button>
                      <span className="text-slate-600">&middot;</span>
                      <MatrixRowSource row={rowByNumber.get(audit.rowNumber)!} linkContext={linkContext} />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-slate-300">{audit.message}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function WorkPacketView({
  results,
  requirements,
  linkContext,
  isScoped,
}: {
  results: ParseResults;
  requirements: RequirementSummary[];
  linkContext: MatrixRowLinkContext;
  isScoped: boolean;
}) {
  const rowByNumber = new Map(results.matrixRows.map((row) => [row.rowNumber, row]));
  const auditById = new Map(results.audits.map((audit) => [audit.id, audit]));
  return (
    <div className="space-y-4">
      {isScoped && (
        <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100">
          System view filtered by left requirement list.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
      {results.workPackets.map((packet) => {
        const packetRequirements = requirements.filter((req) => (
          req.kind === 'hlr' ? packet.hlrIds.includes(req.id) : packet.llrIds.includes(req.id)
        ));
        const packetHlrIds = new Set(packetRequirements.filter((req) => req.kind === 'hlr').map((req) => req.id));
        const packetLlrIds = new Set(packetRequirements.filter((req) => req.kind === 'llr').map((req) => req.id));
        const packetRows = packet.rowNumbers
          .map((rowNumber) => rowByNumber.get(rowNumber))
          .filter((row): row is MatrixRowObject => Boolean(row))
          .filter((row) => (
            row.detectedHlrIds.some((id) => packetHlrIds.has(id))
            || row.detectedLlrIds.some((id) => packetLlrIds.has(id))
            || (!isScoped && packetRequirements.length === 0)
          ));
        const packetRowNumbers = new Set(packetRows.map((row) => row.rowNumber));
        const packetAudits = packet.auditIds
          .map((auditId) => auditById.get(auditId))
          .filter((audit): audit is AuditItem => Boolean(audit))
          .filter((audit) => (
            !isScoped
            || Boolean(audit.hlrId && packetHlrIds.has(audit.hlrId))
            || Boolean(audit.llrId && packetLlrIds.has(audit.llrId))
            || Boolean(audit.rowNumber && packetRowNumbers.has(audit.rowNumber))
          ));
        const actionableErrors = packetAudits.filter((audit) => audit.severity === 'Error');
        if (packetRequirements.length === 0 && packetRows.length === 0 && actionableErrors.length === 0) return null;

        const hlrCount = packetRequirements.filter((req) => req.kind === 'hlr').length;
        const llrCount = packetRequirements.filter((req) => req.kind === 'llr').length;
        const rowRange = numberRanges(packetRows.map((row) => row.rowNumber));
        const sourceFiles = Array.from(new Set(packetRows.map((row) => basename(row.sourceFile))));
        const lineRanges = sourceFiles.map((file) => {
          const lines = packetRows.filter((row) => basename(row.sourceFile) === file).map((row) => row.sourceLine);
          return `${file}:${numberRanges(lines)}`;
        });
        const { traceStatusCounts, implementationStatusCounts } = countRequirementStatuses(packetRequirements);
        return (
          <section key={packet.id} className="rounded border border-slate-800 bg-[#111419] p-4">
            <h3 className="text-base font-semibold">{packet.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{hlrCount} HLR / {llrCount} LLR / {packetRows.length} rows / {packetAudits.length} audits</p>
            {packetRequirements.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase text-slate-500">Trace</span>
                  {TRACE_STATUS_BREAKDOWN_ORDER.filter((status) => traceStatusCounts[status]).map((status) => (
                    <span key={status} className={`rounded border px-2 py-0.5 text-[10px] uppercase ${statusClass(status)}`}>
                      {status} {traceStatusCounts[status]}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase text-slate-500">Implementation</span>
                  {IMPLEMENTATION_STATUS_BREAKDOWN_ORDER.filter((status) => implementationStatusCounts[status]).map((status) => (
                    <span key={status} className={`rounded border px-2 py-0.5 text-[10px] uppercase ${statusClass(status)}`}>
                      {status} {implementationStatusCounts[status]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {packetRows.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-slate-400">
                <p><span className="text-slate-500">Rows:</span> <span className="font-mono">{rowRange}</span></p>
                <p><span className="text-slate-500">Source:</span> <span className="font-mono">{lineRanges.join(', ')}</span></p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {packetRequirements.slice(0, 32).map((req) => {
                const href = githubBlobUrl(linkContext, req.sourceFile, req.sourceLine);
                return href ? (
                  <a key={`${req.kind}-${req.id}`} href={href} target="_blank" rel="noreferrer" className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-100 hover:border-sky-500 hover:text-sky-200">
                    {req.id}
                  </a>
                ) : (
                  <span key={`${req.kind}-${req.id}`} className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-100">
                    {req.id}
                  </span>
                );
              })}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded border border-slate-800 bg-[#111419] p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-500" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{body}</p>
      </div>
    </div>
  );
}
