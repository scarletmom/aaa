const OPERATORS = [
  { value: "equals", label: "is equal to" },
  { value: "notEquals", label: "is not equal to" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "regex", label: "matches regex" },
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "empty", label: "is empty", unary: true },
  { value: "notEmpty", label: "is not empty", unary: true },
  { value: "true", label: "is true", unary: true },
  { value: "false", label: "is false", unary: true },
];

const text = (value) => (value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));

function isEmpty(value) {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// Numbers compare numerically when both sides parse, so "200" equals 200 the way people expect.
function looseEqual(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    const a = Number(left);
    const b = Number(right);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  if (typeof left === "boolean" || typeof right === "boolean") return text(left).toLowerCase() === text(right).toLowerCase();
  return text(left) === text(right);
}

function compareNumbers(left, right, test) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && test(a, b);
}

function check({ left, op, right }) {
  switch (op) {
    case "equals":
      return looseEqual(left, right);
    case "notEquals":
      return !looseEqual(left, right);
    case "contains":
      return Array.isArray(left) ? left.some((item) => looseEqual(item, right)) : text(left).includes(text(right));
    case "notContains":
      return Array.isArray(left) ? !left.some((item) => looseEqual(item, right)) : !text(left).includes(text(right));
    case "startsWith":
      return text(left).startsWith(text(right));
    case "endsWith":
      return text(left).endsWith(text(right));
    case "regex": {
      let regex;
      try {
        regex = new RegExp(text(right), "i");
      } catch {
        throw new Error(`Invalid regular expression: ${text(right)}`);
      }
      return regex.test(text(left));
    }
    case "gt":
      return compareNumbers(left, right, (a, b) => a > b);
    case "gte":
      return compareNumbers(left, right, (a, b) => a >= b);
    case "lt":
      return compareNumbers(left, right, (a, b) => a < b);
    case "lte":
      return compareNumbers(left, right, (a, b) => a <= b);
    case "empty":
      return isEmpty(left);
    case "notEmpty":
      return !isEmpty(left);
    case "true":
      return left === true || text(left).toLowerCase() === "true";
    case "false":
      return left === false || text(left).toLowerCase() === "false";
    default:
      throw new Error(`Unknown operator "${op}"`);
  }
}

function matches(conditions, combine = "all") {
  const rows = (conditions || []).filter((row) => row && row.op);
  if (!rows.length) return true;
  return combine === "any" ? rows.some(check) : rows.every(check);
}

module.exports = { OPERATORS, check, matches };
