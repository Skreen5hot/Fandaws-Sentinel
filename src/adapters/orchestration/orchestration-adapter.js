/**
 * OrchestrationAdapter Interface
 *
 * Manages conversation flow, input/output routing, and pipeline execution
 * sequencing. In M2M deployments, must additionally enforce convergence
 * constraints to prevent semantic deadlock.
 *
 * Implementations: SynchronousOrchestrationAdapter
 *
 * @see Fandaws_v3.3_Specification.md Section 3.3.3
 */

/**
 * @interface OrchestrationAdapter
 *
 * @method receiveInput(input: object): void
 *   Accept input (text, confirmation, selection) from a human or agent
 *   and route to the computation pipeline.
 *
 * @method emitOutput(output: object): void
 *   Deliver system output (prompts, confirmations, results) to the caller interface.
 *
 * @method runPipeline(utterance: string, context: object): PipelineResult
 *   Execute the full computation pipeline for a single utterance.
 *
 * @method getCallerMode(): 'human' | 'agent'
 *   Returns caller type to control machineSignal population on ConversationPrompts.
 *
 * @method checkDeadlock(sessionId: string): DeadlockStatus
 *   Evaluate whether the current session has entered a semantic deadlock.
 */

export class OrchestrationAdapter {
  receiveInput(_input) { throw new Error('OrchestrationAdapter.receiveInput() not implemented'); }
  emitOutput(_output) { throw new Error('OrchestrationAdapter.emitOutput() not implemented'); }
  runPipeline(_utterance, _context) { throw new Error('OrchestrationAdapter.runPipeline() not implemented'); }
  getCallerMode() { throw new Error('OrchestrationAdapter.getCallerMode() not implemented'); }
  checkDeadlock(_sessionId) { throw new Error('OrchestrationAdapter.checkDeadlock() not implemented'); }
}
