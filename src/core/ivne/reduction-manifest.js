/**
 * Reduction Manifest Builder — accumulates compilation statistics.
 *
 * Created per compile() call. Records losses, rejections, IRI mappings,
 * and computes the fidelityScore when .build() is called.
 *
 * fidelityScore = 1.0 when total losses = 0 (perfect import).
 * Otherwise: informational count / total loss count.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 11
 */

import { createReductionManifest } from '../../types/ivne-types.js';
import { SEVERITY } from './semantic-loss.js';

export class ManifestBuilder {
  /**
   * @param {object} params
   * @param {string} params.ivneRunId - Unique run identifier
   * @param {string} params.sourceOntology - Source ontology IRI
   * @param {string} params.sourceHash - SHA-256 of the source input
   * @param {string} params.compiledAt - ISO 8601 run timestamp
   * @param {object} params.configUsed - Configuration for this run
   */
  constructor({ ivneRunId, sourceOntology, sourceHash, compiledAt, configUsed }) {
    this._ivneRunId = ivneRunId;
    this._sourceOntology = sourceOntology;
    this._sourceHash = sourceHash;
    this._compiledAt = compiledAt;
    this._configUsed = configUsed;
    this._startTime = Date.now();

    this._lossRecords = [];
    this._rejectedAxioms = [];
    this._validationFailures = [];
    this._iriMappings = [];
    this._generatedConcepts = [];

    this._stats = {
      totalSourceAxioms: 0,
      totalCompiledConcepts: 0,
      totalGeneratedConcepts: 0,
      totalProperties: 0,
      totalRelationships: 0,
      totalPropertyChains: 0,
    };
  }

  /**
   * Record a semantic loss from compilation.
   * @param {object} lossRecord - SemanticLossRecord JSON-LD
   */
  recordLoss(lossRecord) {
    this._lossRecords.push(lossRecord);
  }

  /**
   * Record multiple losses at once.
   * @param {object[]} lossRecords
   */
  recordLosses(lossRecords) {
    this._lossRecords.push(...lossRecords);
  }

  /**
   * Record a rejected axiom.
   * @param {object} rejection - { axiom, reason }
   */
  recordRejection(rejection) {
    this._rejectedAxioms.push(rejection);
  }

  /**
   * Record multiple rejections at once.
   * @param {object[]} rejections
   */
  recordRejections(rejections) {
    this._rejectedAxioms.push(...rejections);
  }

  /**
   * Record a validation failure from Stage 2.
   * @param {object} failure
   */
  recordValidationFailure(failure) {
    this._validationFailures.push(failure);
  }

  /**
   * Record an IRI mapping (source → Fandaws).
   * @param {object} mapping - { source, fandaws }
   */
  recordIriMapping(mapping) {
    this._iriMappings.push(mapping);
  }

  /**
   * Record multiple IRI mappings at once.
   * @param {object[]} mappings
   */
  recordIriMappings(mappings) {
    this._iriMappings.push(...mappings);
  }

  /**
   * Record generated concept IRIs.
   * @param {string[]} iris
   */
  recordGeneratedConcepts(iris) {
    this._generatedConcepts.push(...iris);
  }

  /**
   * Set aggregate statistics.
   * @param {object} stats
   */
  setStatistics(stats) {
    Object.assign(this._stats, stats);
  }

  /**
   * Compute fidelity score.
   *
   * fidelityScore = 1.0 when total losses = 0
   * Otherwise: count(informational) / count(total losses)
   *
   * @returns {number} Score between 0.0 and 1.0
   */
  computeFidelityScore() {
    const total = this._lossRecords.length;
    if (total === 0) return 1.0;

    const informational = this._lossRecords.filter(
      (lr) => lr['fandaws:severity'] === SEVERITY.informational,
    ).length;

    return informational / total;
  }

  /**
   * Build the final ReductionManifest.
   *
   * @param {object} [extraConfig={}] - Additional config
   * @param {boolean} [extraConfig.fnsrChainSupport=false]
   * @param {boolean} [extraConfig.oceChainSupport=false]
   * @returns {object} ReductionManifest JSON-LD
   */
  build(extraConfig = {}) {
    const { fnsrChainSupport = false, oceChainSupport = false } = extraConfig;

    const lossByType = {};
    const lossBySeverity = {};
    for (const lr of this._lossRecords) {
      const type = lr['fandaws:lossType'];
      const severity = lr['fandaws:severity'];
      lossByType[type] = (lossByType[type] || 0) + 1;
      lossBySeverity[severity] = (lossBySeverity[severity] || 0) + 1;
    }

    const durationMs = Date.now() - this._startTime;

    const statistics = {
      ...this._stats,
      totalGeneratedConcepts: this._generatedConcepts.length,
      totalLossRecords: this._lossRecords.length,
      lossByType,
      lossBySeverity,
      totalRejected: this._rejectedAxioms.length + this._validationFailures.length,
      compilationDurationMs: durationMs,
      fidelityScore: this.computeFidelityScore(),
    };

    return createReductionManifest({
      ivneRunId: this._ivneRunId,
      sourceOntology: this._sourceOntology,
      sourceHash: this._sourceHash,
      compiledAt: this._compiledAt,
      statistics,
      lossRecords: this._lossRecords,
      rejectedAxioms: this._rejectedAxioms,
      validationFailures: this._validationFailures,
      iriMappings: this._iriMappings,
      generatedConcepts: this._generatedConcepts,
      configUsed: this._configUsed,
      chainConsumptionReady: fnsrChainSupport || oceChainSupport,
    });
  }
}
