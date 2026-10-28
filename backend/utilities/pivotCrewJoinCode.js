const crypto = require('crypto');

/**
 * Circle join codes: six characters a friend can read out or type. No 0/O,
 * 1/I or L, so nothing is mistaken for something else.
 */
const PIVOT_CREW_JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PIVOT_CREW_JOIN_CODE_LENGTH = 6;
const PIVOT_CREW_JOIN_CODE_PATTERN = new RegExp(
  `^[${PIVOT_CREW_JOIN_CODE_ALPHABET}]{${PIVOT_CREW_JOIN_CODE_LENGTH}}$`,
);

function generatePivotCrewJoinCode(randomInt = crypto.randomInt) {
  let code = '';
  for (let i = 0; i < PIVOT_CREW_JOIN_CODE_LENGTH; i += 1) {
    code += PIVOT_CREW_JOIN_CODE_ALPHABET[randomInt(PIVOT_CREW_JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** What someone typed or pasted, as a code: spaces and dashes gone, upper case. */
function normalizePivotCrewJoinCode(value) {
  return String(value || '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

function isPivotCrewJoinCode(value) {
  return PIVOT_CREW_JOIN_CODE_PATTERN.test(value);
}

/** A duplicate-key error on the join code (another crew drew the same one). */
function isJoinCodeCollision(error) {
  return (
    error?.code === 11000 &&
    (error?.keyPattern?.joinCode === 1 || /joinCode/.test(String(error?.message)))
  );
}

module.exports = {
  PIVOT_CREW_JOIN_CODE_ALPHABET,
  PIVOT_CREW_JOIN_CODE_LENGTH,
  generatePivotCrewJoinCode,
  normalizePivotCrewJoinCode,
  isPivotCrewJoinCode,
  isJoinCodeCollision,
};
