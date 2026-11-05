/**
 * Calcul de la moyenne pondérée d'un étudiant dans un pôle.
 *
 * Formule (v1.0) :
 *   1. Normaliser chaque note sur 20 : (value / max_value) × 20
 *   2. Moyenne par type pondérée par coefficient
 *   3. Renormalisation inter-types : ne compter que les types avec des notes
 *   4. Bonus = Σ(points des StudentBonus) — le respo choisit librement
 *   5. Plafonnement à 20
 *
 * Si aucun type n'a de note → has_grades = false, final_average = 0, rank = null
 */

const NOTE_MAX = 20;
const FORMULA_VERSION = "1.0";
const TYPES = ["devoir", "examen", "project", "participation"];

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Array} grades - [{ value, max_value, coefficient, assessment_type }]
 *   `assessment_type` doit être extrait de `assessment.type` avant l'appel.
 * @param {Object} settings - { devoir_weight, examen_weight, project_weight, participation_weight }
 * @param {Array} bonuses - [{ points }]
 * @returns {Object} - { grades_by_type, base_average, bonus_points, total_points, final_average, has_grades, rank }
 */
function computeStudentAverage(grades, settings, bonuses) {
  // ÉTAPE 1 + 2 : moyenne par type pondérée par coefficient
  const byType = {};
  for (const type of TYPES) {
    byType[type] = { sum: 0, coefSum: 0, count: 0 };
  }

  for (const g of grades || []) {
    if (g.value === null || g.value === undefined) continue;
    const type = g.assessment_type;
    if (!TYPES.includes(type)) continue;

    const maxValue = Number(g.max_value) || NOTE_MAX;
    const normalized = (Number(g.value) / maxValue) * NOTE_MAX;
    const coef = Number(g.coefficient) || 1;

    byType[type].sum += normalized * coef;
    byType[type].coefSum += coef;
    byType[type].count += 1;
  }

  const grades_by_type = {};
  for (const type of TYPES) {
    const avg =
      byType[type].coefSum > 0
        ? byType[type].sum / byType[type].coefSum
        : 0;
    grades_by_type[type] = {
      average: round2(avg),
      coefficient_sum: byType[type].coefSum,
      count: byType[type].count,
    };
  }

  // ÉTAPE 3 : renormalisation sur types actifs
  const weights = {
    devoir: Number(settings?.devoir_weight ?? 0),
    examen: Number(settings?.examen_weight ?? 0),
    project: Number(settings?.project_weight ?? 0),
    participation: Number(settings?.participation_weight ?? 0),
  };

  let weightedSum = 0;
  let activeWeight = 0;

  for (const type of TYPES) {
    if (byType[type].count > 0 && weights[type] > 0) {
      weightedSum += grades_by_type[type].average * weights[type];
      activeWeight += weights[type];
    }
  }

  const base_average =
    activeWeight > 0 ? round2(weightedSum / activeWeight) : 0;

  // ÉTAPE 4 : bonus (somme des points, pas des étoiles)
  const total_points = (bonuses || []).reduce(
    (sum, b) => sum + Number(b.points || 0),
    0
  );
  const bonus_points = round2(total_points);

  // ÉTAPE 5 : plafonnement à 20
  const final_average = Math.min(
    NOTE_MAX,
    round2(base_average + bonus_points)
  );

  const has_grades = TYPES.some((t) => byType[t].count > 0);

  return {
    grades_by_type,
    base_average,
    bonus_points,
    total_points,
    final_average,
    has_grades,
    rank: null, // calculé plus tard
  };
}

/**
 * Calcule les moyennes pour tous les étudiants d'un pôle + rang.
 *
 * @param {Object} gradesByStudent - { [studentId]: [{ value, max_value, coefficient, assessment_type }] }
 * @param {Object} bonusesByStudent - { [studentId]: [{ points }] }
 * @param {Object} settings - { devoir_weight, ... }
 * @returns {Object} - { [studentId]: computed }
 */
function computeAllAverages(gradesByStudent, bonusesByStudent, settings) {
  const results = {};

  for (const [studentId, grades] of Object.entries(gradesByStudent)) {
    const bonuses = bonusesByStudent[studentId] || [];
    results[studentId] = computeStudentAverage(grades, settings, bonuses);
  }

  // Rang : uniquement pour les étudiants avec notes, trié par final_average DESC
  const ranked = Object.entries(results)
    .filter(([, data]) => data.has_grades)
    .sort(([, a], [, b]) => b.final_average - a.final_average);

  ranked.forEach(([studentId], index) => {
    results[studentId].rank = index + 1;
  });

  return results;
}

module.exports = {
  computeStudentAverage,
  computeAllAverages,
  NOTE_MAX,
  FORMULA_VERSION,
  TYPES,
};