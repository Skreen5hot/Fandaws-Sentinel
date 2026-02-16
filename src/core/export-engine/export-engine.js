/**
 * ExportEngine — orchestrator for knowledge graph export.
 *
 * Pure function: takes a KnowledgeGraph and format option, dispatches
 * to the appropriate format-specific exporter. Read-only, deterministic,
 * no mutations, no I/O, no external services.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { exportSKOS } from './skos-export.js';
import { exportOWL } from './owl-export.js';
import { exportTurtle } from './turtle-export.js';
import { exportRDF } from './rdf-xml-export.js';

const SUPPORTED_FORMATS = ['skos', 'owl', 'rdf', 'turtle'];

const EXPORTERS = {
  skos: exportSKOS,
  owl: exportOWL,
  rdf: exportRDF,
  turtle: exportTurtle,
};

/**
 * Export a KnowledgeGraph to a standard ontology format.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [options={}]
 * @param {string} options.format - "skos" | "owl" | "rdf" | "turtle"
 * @returns {string} Serialized output in the requested format
 * @throws {Error} If format is unsupported or graph is invalid
 */
export function exportGraph(graph, options = {}) {
  if (!graph || typeof graph !== 'object') {
    throw new Error('exportGraph: graph is required and must be an object');
  }

  if (!Array.isArray(graph['fandaws:concepts'])) {
    throw new Error('exportGraph: graph must contain a fandaws:concepts array');
  }

  const { format } = options;

  if (!format || typeof format !== 'string') {
    throw new Error(
      `exportGraph: format is required. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
    );
  }

  const normalizedFormat = format.toLowerCase();
  const exporter = EXPORTERS[normalizedFormat];

  if (!exporter) {
    throw new Error(
      `exportGraph: unknown format "${format}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
    );
  }

  return exporter(graph, options);
}
