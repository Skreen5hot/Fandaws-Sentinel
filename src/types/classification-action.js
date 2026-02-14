/**
 * ClassificationAction — output of the Classifier.
 *
 * Routes parsed statements to the appropriate knowledge-building workflow.
 * The verb field is only populated for customRelationship workflows.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.2
 */

/**
 * Create a new ClassificationAction.
 *
 * @param {object} params
 * @param {string} params.workflow - "classification" | "property" | "customRelationship"
 * @param {string} params.subject - Subject term for the workflow
 * @param {string} params.object - Object term for the workflow
 * @param {string|null} [params.verb] - Custom verb (only for customRelationship)
 * @returns {object} JSON-LD ClassificationAction node
 */
export function createClassificationAction({
  workflow,
  subject,
  object,
  verb = null,
}) {
  return {
    '@type': 'fandaws:ClassificationAction',
    'fandaws:workflow': workflow,
    'fandaws:subject': subject,
    'fandaws:object': object,
    'fandaws:verb': verb,
  };
}
