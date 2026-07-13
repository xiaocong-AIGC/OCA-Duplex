export function hasFlag(args, name) {
  return args.includes(name);
}

export function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`);
  return value;
}

export function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} 需要一个值。`);
    values.push(value);
  }
  return values;
}

export function passthrough(args, namesWithValues = []) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) continue;
    result.push(value);
    if (namesWithValues.includes(value)) result.push(args[++index]);
  }
  return result;
}

