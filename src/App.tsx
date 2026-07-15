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
import { strongestStatus } from './lib/status';
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

const DEFAULT_REPO_URL = 'https://github.com/delk73/precision-replay.git';
const DEFAULT_REF = 'main';
const DEFAULT_LEFT_WIDTH = 380;
const DEFAULT_RIGHT_WIDTH = 360;
const STATUS_BREAKDOWN_ORDER: NormalizedStatus[] = ['tested', 'proof_partial', 'implemented', 'boundary_only', 'traced', 'pending', 'unknown', 'untraced'];

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
      const params = new URLSearchParams({ mode: 'github_snapshot', repoUrl, ref: repoRef });
      if (compareEnabled && compareRef && compareRef !== repoRef) params.set('compareRef', compareRef);
      const response = await fetch(`/api/scan?${params.toString()}`);
      const body = (await response.json()) as ParseResults;
      setResults(body);
      localStorage.setItem('precision_replay_repo_url', repoUrl);
      localStorage.setItem('precision_replay_repo_ref', repoRef);
      localStorage.setItem('precision_replay_compare_enabled', String(compareEnabled));
      localStorage.setItem('precision_replay_compare_ref', compareRef);
      const first = body.hlrs[0] || body.llrs[0];
      if (first && !body.hlrs.some((h) => h.id === selectedId) && !body.llrs.some((l) => l.id === selectedId)) {
        setSelectedId(first.id);
        setSelectedKind(first.kind);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setResults(EMPTY_RESULTS);
    } finally {
      setLoading(false);
    }
  };

  const comparisonRequested = compareEnabled && compareRef && compareRef !== repoRef;

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
    if (results.comparison && !diffFilterTouched) {
      setDiffFilter('changed');
    }
    if (!results.comparison && !diffFilterTouched) {
      setDiffFilter('all');
    }
  }, [results.comparison, diffFilterTouched]);

  const activeDiffFilter = results.comparison ? diffFilter : 'all';

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
        .map((delta) => summarizeDelta(delta));
    const needle = searchQuery.trim().toLowerCase();
    return combined.filter((req) => {
      if (!needle) return true;
      const terms = needle.split(/\s+/).filter(Boolean);
      const positiveTerms = terms.filter((term) => !term.startsWith('-'));
      const negativeTerms = terms
        .filter((term) => term.startsWith('-'))
        .map((term) => term.slice(1))
        .filter(Boolean);
      const haystack = `${req.id} ${req.title} ${req.sourceFile} ${req.status} ${req.kind} ${domainFrom(req.id, req.sourceFile)}`.toLowerCase();
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
  const diffLabels = useMemo(() => buildDiffLabels(results, repoRef, compareRef), [results, repoRef, compareRef]);

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
                  onChange={(event) => setRepoRef(event.target.value)}
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
                  onChange={(event) => setCompareEnabled(event.target.checked)}
                  className="h-4 w-4 accent-sky-500"
                />
                Compare branch
              </label>
              {compareEnabled && (
                <label className="grid gap-1">
                  <span className="text-[10px] uppercase text-slate-500">Compare against</span>
                  <select
                    value={compareRef}
                    onChange={(event) => setCompareRef(event.target.value)}
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
              <Metric label="HLR" value={results.hlrs.length} />
              <Metric label="LLR" value={results.llrs.length} />
              <Metric label="Rows" value={results.matrixRows.length} />
            </div>
            <div className={`rounded border p-3 text-xs ${results.validation.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
              <div className="flex items-center gap-2 font-semibold">
                {results.validation.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertCircle className="h-4 w-4 text-rose-300" />}
                <span>{results.validation.ok ? 'Source snapshot validated' : 'Validation needed'}</span>
              </div>
              <SourceSummary results={results} />
              <ComparisonStatus results={results} requested={Boolean(comparisonRequested)} />
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
            {(results.comparison || comparisonRequested) && (
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
                  <option value="added">{diffLabels.added}</option>
                  <option value="removed">{diffLabels.removed}</option>
                  <option value="changed">{diffLabels.changed}</option>
                  <option value="status_changed">{diffLabels.status_changed}</option>
                </select>
              </label>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {requirements.map((req) => (
              <button
                key={`${req.kind}-${req.id}`}
                type="button"
                onClick={() => selectRequirement(req.id, req.kind)}
                className={`mb-2 w-full rounded border p-3 text-left text-xs transition ${
                  selectedId === req.id && selectedKind === req.kind
                    ? 'border-sky-500/60 bg-sky-500/10'
                    : 'border-slate-800 bg-[#0A0B0E] hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-100">{req.id}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${statusClass(req.status)}`}>{req.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-slate-400">{req.title}</p>
                <p className="mt-2 font-mono text-[10px] text-slate-500">{domainFrom(req.id, req.sourceFile)} / {req.sourceFile}</p>
              </button>
            ))}
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
                title={results.comparison ? 'No matching diff requirements' : 'Comparison not scanned'}
                body={results.comparison ? 'This diff filter has no parsed HLR or LLR matches.' : 'Click Scan to load comparison data before browsing a diff subset.'}
              />
            ) : activeTab === 'requirements' && (
              <RequirementDetail
                requirement={selectedRequirement}
                rows={selectedRows}
                activeRow={activeRow}
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

function ComparisonStatus({ results, requested }: { results: ParseResults; requested: boolean }) {
  const comparison = results.comparison;
  if (comparison) {
    const counts = comparison.deltas.reduce<Record<string, number>>((acc, delta) => {
      acc[delta.change] = (acc[delta.change] || 0) + 1;
      return acc;
    }, {});
    return (
      <div className="mt-2 rounded border border-sky-500/20 bg-sky-500/5 p-2 text-[11px] text-sky-100">
        <p className="font-semibold">Comparison loaded</p>
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

function summarizeRequirement(req: HlrObject | LlrObject, rows: MatrixRowObject[]) {
  const matching = rows.filter((row) => (req.kind === 'hlr' ? row.detectedHlrIds.includes(req.id) : row.detectedLlrIds.includes(req.id)));
  return {
    id: req.id,
    kind: req.kind,
    title: req.title,
    sourceFile: req.sourceFile,
    sourceLine: req.sourceLine,
    status: strongestStatus(matching.map((row) => row.normalizedStatus)),
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

function summarizeDelta(delta: ComparisonDelta): RequirementSummary {
  return {
    id: delta.id,
    kind: delta.kind as RequirementKind,
    title: delta.title || delta.message,
    sourceFile: delta.sourceFile || 'comparison',
    sourceLine: delta.sourceLine || 1,
    status: delta.status || 'unknown' as NormalizedStatus,
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
  return delta.kind === 'hlr' ? { ...base, kind: 'hlr' } : { ...base, kind: 'llr', tracedHlrIds: [] };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-800 bg-[#0A0B0E] p-2">
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
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
  const requirementStatus = strongestStatus(rows.map((row) => row.normalizedStatus));
  const showTestedWithoutEvidenceWarning = requirementStatus === 'tested' && requirementEvidencePaths.length === 0;

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
          <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <p><span className="text-slate-500">Source:</span> <span className="font-mono">{requirement.sourceFile}</span></p>
            <p><span className="text-slate-500">Line:</span> <span className="font-mono">{requirement.sourceLine}</span></p>
          </div>
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-slate-800 bg-[#0A0B0E] p-4 whitespace-pre-wrap text-xs text-slate-300"><TintedRequirementText text={requirement.text} /></pre>
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

function MatrixRowOrdinal({ row, compact = false }: { row: MatrixRowObject; compact?: boolean }) {
  return <>{compact ? `Row ${row.rowNumber}` : `Matrix Row ${row.rowNumber}`}</>;
}

function MatrixRowSource({ row, linkContext }: { row: MatrixRowObject; linkContext: MatrixRowLinkContext }) {
  const sourceLabel = `${basename(row.sourceFile)}:${row.sourceLine}`;
  const href = githubBlobUrl(linkContext, row.sourceFile, row.sourceLine);
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
  const rowItems = graph.rowNodes.map((node) => {
    const rowNumber = Number(node.id.replace('row-', ''));
    const row = rowByNumber.get(rowNumber);
    return row ? <MatrixRowLabel row={row} linkContext={linkContext} /> : node.label;
  });
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
        const statusCounts = packetRequirements.reduce<Record<NormalizedStatus, number>>((counts, req) => {
          counts[req.status] = (counts[req.status] || 0) + 1;
          return counts;
        }, {} as Record<NormalizedStatus, number>);
        return (
          <section key={packet.id} className="rounded border border-slate-800 bg-[#111419] p-4">
            <h3 className="text-base font-semibold">{packet.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{hlrCount} HLR / {llrCount} LLR / {packetRows.length} rows / {packetAudits.length} audits</p>
            {packetRequirements.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {STATUS_BREAKDOWN_ORDER.filter((status) => statusCounts[status]).map((status) => (
                  <span key={status} className={`rounded border px-2 py-0.5 text-[10px] uppercase ${statusClass(status)}`}>
                    {status} {statusCounts[status]}
                  </span>
                ))}
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
