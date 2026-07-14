import { 
  HlrObject, 
  LlrObject, 
  MatrixRowObject, 
  EvidencePathObject, 
  GraphNode, 
  GraphEdge,
  NormalizedStatus,
} from '../types';

export interface ColumnarGraph {
  hlrNodes: GraphNode[];
  llrNodes: GraphNode[];
  rowNodes: GraphNode[];
  leafNodes: GraphNode[];
  edges: GraphEdge[];
}

function isImplementedLikeStatus(status: NormalizedStatus): boolean {
  return status === 'implemented' || status === 'tested' || status === 'proof_partial';
}

export function buildNeighborhoodGraph(
  selectedId: string,
  selectedType: 'hlr' | 'llr' | 'matrix_row' | null,
  hlrs: HlrObject[],
  llrs: LlrObject[],
  matrixRows: MatrixRowObject[],
  filters: {
    includeLlrs: boolean;
    includeRows: boolean;
    includePaths: boolean;
    pendingOnly: boolean;
    implementedOnly: boolean;
  }
): ColumnarGraph {
  const hlrNodesMap = new Map<string, GraphNode>();
  const llrNodesMap = new Map<string, GraphNode>();
  const rowNodesMap = new Map<string, GraphNode>();
  const leafNodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  if (!selectedId) {
    return { hlrNodes: [], llrNodes: [], rowNodes: [], leafNodes: [], edges: [] };
  }

  // Identify core items in focus based on selected item
  let focusedHlrIds = new Set<string>();
  let focusedLlrIds = new Set<string>();
  let focusedRowNumbers = new Set<number>();

  if (selectedType === 'hlr') {
    focusedHlrIds.add(selectedId);
    
    // Find LLRs that trace to this HLR
    llrs.forEach(l => {
      if (l.tracedHlrIds.includes(selectedId)) {
        focusedLlrIds.add(l.id);
      }
    });

    // Find Matrix rows referencing this HLR
    matrixRows.forEach(row => {
      if (row.detectedHlrIds.includes(selectedId)) {
        focusedRowNumbers.add(row.rowNumber);
        row.detectedLlrIds.forEach(lId => focusedLlrIds.add(lId));
      }
    });
  } else if (selectedType === 'llr') {
    focusedLlrIds.add(selectedId);

    // Find HLRs that this LLR traces to
    const llr = llrs.find(l => l.id === selectedId);
    if (llr) {
      llr.tracedHlrIds.forEach(hId => focusedHlrIds.add(hId));
    }

    // Find Matrix rows referencing this LLR
    matrixRows.forEach(row => {
      if (row.detectedLlrIds.includes(selectedId)) {
        focusedRowNumbers.add(row.rowNumber);
        row.detectedHlrIds.forEach(hId => focusedHlrIds.add(hId));
      }
    });
  } else if (selectedType === 'matrix_row') {
    const rowNum = parseInt(selectedId, 10);
    const row = matrixRows.find(r => r.rowNumber === rowNum);
    if (row) {
      focusedRowNumbers.add(rowNum);
      row.detectedHlrIds.forEach(hId => focusedHlrIds.add(hId));
      row.detectedLlrIds.forEach(lId => focusedLlrIds.add(lId));
    }
  }

  // Construct nodes according to the filters
  // 1. Add HLR Nodes
  hlrs.forEach(h => {
    if (focusedHlrIds.has(h.id)) {
      // Find row status for this HLR
      const associatedRows = matrixRows.filter(r => r.detectedHlrIds.includes(h.id));
      const status = associatedRows.length > 0 ? associatedRows[0].normalizedStatus : 'unknown';

      // Status filters
      if (filters.pendingOnly && status !== 'pending') return;
      if (filters.implementedOnly && !isImplementedLikeStatus(status)) return;

      hlrNodesMap.set(h.id, {
        id: h.id,
        label: `${h.id}: ${h.title}`,
        type: 'hlr',
        status
      });
    }
  });

  // 2. Add LLR Nodes if filter permits
  if (filters.includeLlrs) {
    llrs.forEach(l => {
      if (focusedLlrIds.has(l.id)) {
        // Status checks based on tracing HLR status
        const associatedHlrs = l.tracedHlrIds;
        const associatedRows = matrixRows.filter(r => 
          r.detectedLlrIds.includes(l.id) || 
          r.detectedHlrIds.some(hId => associatedHlrs.includes(hId))
        );
        const status = associatedRows.length > 0 ? associatedRows[0].normalizedStatus : 'unknown';

        if (filters.pendingOnly && status !== 'pending') return;
        if (filters.implementedOnly && !isImplementedLikeStatus(status)) return;

        llrNodesMap.set(l.id, {
          id: l.id,
          label: `${l.id}: ${l.title}`,
          type: 'llr',
          status
        });
      }
    });
  }

  // 3. Add Matrix Row Nodes if filter permits
  if (filters.includeRows) {
    matrixRows.forEach(row => {
      if (focusedRowNumbers.has(row.rowNumber)) {
        if (filters.pendingOnly && row.normalizedStatus !== 'pending') return;
        if (filters.implementedOnly && !isImplementedLikeStatus(row.normalizedStatus)) return;

        rowNodesMap.set(`row-${row.rowNumber}`, {
          id: `row-${row.rowNumber}`,
          label: `Matrix Row ${row.rowNumber}: ${row.rawStatusText}`,
          type: 'matrix_row',
          status: row.normalizedStatus
        });
      }
    });
  }

  // 4. Add Leaf Nodes (Evidence Paths and Status Markers) if filter permits
  if (filters.includePaths) {
    matrixRows.forEach(row => {
      if (focusedRowNumbers.has(row.rowNumber)) {
        if (filters.pendingOnly && row.normalizedStatus !== 'pending') return;
        if (filters.implementedOnly && !isImplementedLikeStatus(row.normalizedStatus)) return;

        // Add Evidence Paths
        row.detectedPaths.forEach(path => {
          leafNodesMap.set(`path-${path}`, {
            id: `path-${path}`,
            label: `Evidence: ${path}`,
            type: 'evidence_path',
            status: row.normalizedStatus
          });
        });

        // Add Status Marker node
        const markerId = `status-${row.rowNumber}`;
        leafNodesMap.set(markerId, {
          id: markerId,
          label: `Status: ${row.rawStatusText.toUpperCase()}`,
          type: 'status',
          status: row.normalizedStatus
        });
      }
    });
  }

  // Draw Allowed Edges
  // Edge 1: HLR to LLR from LLR Traces-to lines
  if (filters.includeLlrs) {
    llrs.forEach(l => {
      if (llrNodesMap.has(l.id)) {
        l.tracedHlrIds.forEach(hlrId => {
          if (hlrNodesMap.has(hlrId)) {
            edges.push({
              id: `edge-${hlrId}-${l.id}`,
              source: hlrId,
              target: l.id,
              label: 'Traced'
            });
          }
        });
      }
    });
  }

  // Edge 2: HLR to matrix row when row references HLR
  if (filters.includeRows) {
    matrixRows.forEach(row => {
      const rowNodeId = `row-${row.rowNumber}`;
      if (rowNodesMap.has(rowNodeId)) {
        row.detectedHlrIds.forEach(hlrId => {
          if (hlrNodesMap.has(hlrId)) {
            edges.push({
              id: `edge-${hlrId}-${rowNodeId}`,
              source: hlrId,
              target: rowNodeId,
              label: 'Refs HLR'
            });
          }
        });
      }
    });
  }

  // Edge 3: LLR to matrix row when row references LLR
  if (filters.includeLlrs && filters.includeRows) {
    matrixRows.forEach(row => {
      const rowNodeId = `row-${row.rowNumber}`;
      if (rowNodesMap.has(rowNodeId)) {
        row.detectedLlrIds.forEach(llrId => {
          if (llrNodesMap.has(llrId)) {
            edges.push({
              id: `edge-${llrId}-${rowNodeId}`,
              source: llrId,
              target: rowNodeId,
              label: 'Refs LLR'
            });
          }
        });
      }
    });
  }

  // Edge 4: matrix row to evidence path when row names a path
  if (filters.includeRows && filters.includePaths) {
    matrixRows.forEach(row => {
      const rowNodeId = `row-${row.rowNumber}`;
      if (rowNodesMap.has(rowNodeId)) {
        row.detectedPaths.forEach(path => {
          const pathNodeId = `path-${path}`;
          if (leafNodesMap.has(pathNodeId)) {
            edges.push({
              id: `edge-${rowNodeId}-${pathNodeId}`,
              source: rowNodeId,
              target: pathNodeId,
              label: 'Names Path'
            });
          }
        });

        // Edge 5: matrix row to status marker
        const markerId = `status-${row.rowNumber}`;
        if (leafNodesMap.has(markerId)) {
          edges.push({
            id: `edge-${rowNodeId}-${markerId}`,
            source: rowNodeId,
            target: markerId,
            label: 'Declares'
          });
        }
      }
    });
  }

  return {
    hlrNodes: Array.from(hlrNodesMap.values()),
    llrNodes: Array.from(llrNodesMap.values()),
    rowNodes: Array.from(rowNodesMap.values()),
    leafNodes: Array.from(leafNodesMap.values()),
    edges
  };
}
