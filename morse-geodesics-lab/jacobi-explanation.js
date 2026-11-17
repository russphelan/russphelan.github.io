/* Explanations of three separate Jacobi fields in a parallel transverse frame.
 * A zero belongs to an entire field, not to one component of a shared vector.
 * Root identity comes from refined conjugate-event metadata, never visual size.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicJacobiExplanation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const definitions = [
    {id: 0, name: 'Jₛ', label: 'Surface'},
    {id: 1, name: 'J₁', label: 'Hidden 1'},
    {id: 2, name: 'J₂', label: 'Hidden 2'}
  ];
  const joinNames = fields => fields.length < 3 ? fields.map(f => f.name).join(' and ') : 'Jₛ, J₁ and J₂';

  function describe(data, position, event = null) {
    if (!data || typeof data.sampleAt !== 'function' || !Number.isFinite(position)) {
      throw new TypeError('Jacobi data and a finite arclength position are required.');
    }
    const s = Math.max(0, Math.min(data.length, position)), source = s === 0;
    const sample = data.sampleAt(s), coefficients = [sample.j, sample.hidden, sample.hidden];
    const fields = definitions.map(definition => {
      // Tiny nonzero fields can look collapsed at a fixed whole-path scale.
      // They remain nonzero here unless the solver identifies a true root.
      const zero = source || !!(event && (definition.id === 0 ? event.surface : event.hidden));
      const coefficient = zero ? 0 : coefficients[definition.id];
      const components = [0, 0, 0]; components[definition.id] = coefficient;
      return {...definition, zero, coefficient, components,
        status: source ? 'Zero at the start' : zero ? 'Entire vector = 0' : 'Nonzero vector'};
    });
    const vanished = fields.filter(field => field.zero), vanishing = vanished.map(field => field.id);
    let title = 'Three different Jacobi fields';
    let why = 'Each field starts at zero at x. A conjugate point occurs when at least one of these nontrivial fields becomes zero again.';
    let remaining = 'The surface ribbon shows Jₛ. The optional hidden-neighborhood cutaway shows J₁ and J₂ spreading out and refocusing in two independent directions.';
    if (source) {
      title = 'At x: every field starts at zero';
      why = 'These are nontrivial Jacobi fields: each becomes nonzero away from x. A later return to zero can make a conjugate point.';
      remaining = 'The shared starting zero contributes nothing to the index.';
    } else if (event && vanished.length) {
      const count = vanished.length, singular = count === 1;
      title = `${joinNames(vanished)} ${singular ? 'vanishes' : 'vanish'} completely`;
      const bothEnds = `${singular ? 'One nontrivial Jacobi field is' : count + ' independent Jacobi fields are'} zero both at x and here.`;
      why = event.endpoint ?
        `${bothEnds} This is endpoint nullity ${count}, not an index contribution.` :
        `${bothEnds} This conjugate point has multiplicity ${count}. By the Morse index theorem, passing it adds ${count} independent downhill ${singular ? 'mode' : 'modes'}: ${singular ? 'a deformation' : 'deformations'} that ${singular ? 'lowers' : 'lower'} energy with endpoints fixed.`;
      remaining = event.surface && event.hidden ?
        'All three entire fields are zero. The surface ribbon pinches and both off-surface fields return to the centerline in the hidden-neighborhood cutaway.' : event.surface ?
        'J₁ and J₂ remain nonzero. The surface ribbon pinches; the off-surface fields in the hidden-neighborhood cutaway stay spread out.' :
        'Jₛ remains nonzero, so the surface ribbon stays open. Both off-surface fields return to the centerline in the hidden-neighborhood cutaway.';
    }
    return {fields, vanishing, title, why, remaining};
  }
  return {describe};
});
