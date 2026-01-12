export type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'array'

export const datePattern = /^\d{4}-\d{2}-\d{2}/

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseYMDToLocalDate(ymd: string) {
  if (!datePattern.test(ymd)) return
  const [year, month, day] = ymd
    .slice(0, 10)
    .split('-')
    .map((n) => Number(n))
  if (!year || !month || !day) return
  return new Date(year, month - 1, day)
}

export function convertValueToType(
  value: unknown,
  targetType: ValueType
): unknown {
  const strValue = String(value ?? '')

  switch (targetType) {
    case 'boolean': {
      return (
        strValue === 'true' ||
        strValue === '1' ||
        strValue.toLowerCase() === 'yes' ||
        value === true
      )
    }
    case 'number': {
      const num = Number(strValue)
      return Number.isNaN(num) ? 0 : num
    }
    case 'date': {
      if (value instanceof Date) {
        return formatLocalDate(value)
      }
      const trimmed = strValue.trim()
      if (!trimmed) {
        return formatLocalDate(new Date())
      }
      if (datePattern.test(trimmed)) {
        return trimmed.slice(0, 10)
      }
      const dt = new Date(trimmed)
      if (!Number.isNaN(dt.getTime())) {
        return formatLocalDate(dt)
      }
      return formatLocalDate(new Date())
    }
    case 'array': {
      try {
        return Array.isArray(value)
          ? value
          : strValue
            ? strValue.split(',').map((s) => s.trim())
            : []
      } catch {
        return []
      }
    }
    case 'string': {
      return strValue
    }
    default: {
      return strValue
    }
  }
}
