/**
 * Relation Type Class Schemas — hardcoded seed set for Phase C2.
 *
 * Three bundled schemas covering the canonical forms from FANDAWS v2.1
 * Section 5.6. These are static authored artifacts, NOT compiler output
 * (Rule RECC-5). The export engine emits them verbatim alongside
 * restrictions that use the corresponding relation types.
 *
 * User-defined relation type classes come in Phase D.
 *
 * @see docs/architecture/phase-c-locked-decisions.md Decision C-6
 */

/**
 * Inherence-type relation class schema.
 * BFO subcategory: bfo:Quality. Allows bfo:inheres_in.
 */
export const INHERENCE_SCHEMA = `
fandaws:relationType/inheres_in a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Quality ;
    rdfs:label "inheres in relation" ;
    fandaws:allowsInheresIn true ;
    fandaws:bfoSubcategory bfo:Quality ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:quality ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty [ owl:inverseOf fan:isSourceOf ] ;
          owl:hasValue :AuthoritativeSystemY ] .
`;

/**
 * Mereological relation class schema (material mereology).
 * No BFO subcategory beyond base.
 */
export const MEREOLOGICAL_SCHEMA = `
fandaws:relationType/has_part a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:label "has part relation" ;
    fandaws:isTransitive true ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] .
`;

/**
 * Deontic relation class schema.
 * BFO subcategory: bfo:Disposition.
 */
export const DEONTIC_SCHEMA = `
fandaws:relationType/obligated_to a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Disposition ;
    rdfs:label "obligated to relation" ;
    fandaws:bfoSubcategory bfo:Disposition ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom bfo:Agent ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:Action ] .
`;

/**
 * Map of verb IRIs to relation type class schemas.
 * Only Tier 2A resolved verbs map to relation types.
 * Tier 1 bare properties have no mapping — no RECC.
 */
export const VERB_TO_SCHEMA = {
  'inheres_in': { schema: INHERENCE_SCHEMA, className: 'fandaws:relationType/inheres_in' },
  'has_part': { schema: MEREOLOGICAL_SCHEMA, className: 'fandaws:relationType/has_part' },
  'obligated_to': { schema: DEONTIC_SCHEMA, className: 'fandaws:relationType/obligated_to' },
};

/**
 * Check if a verb has a registered relation type class.
 */
export function hasRelationType(verb) {
  return verb in VERB_TO_SCHEMA;
}

/**
 * Get the schema for a verb's relation type class.
 */
export function getRelationTypeSchema(verb) {
  return VERB_TO_SCHEMA[verb] || null;
}
