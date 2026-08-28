export const DASHBOARD_PERIODS = ['day', 'week', 'month'] as const

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]

export interface RevenueByCurrency {
  currency: string
  amount: number
}

export interface DashboardRevenue {
  today: RevenueByCurrency[]
  week: RevenueByCurrency[]
  month: RevenueByCurrency[]
}

export interface LastActivity {
  type: string
  userName: string
  timestamp: string
}

export interface DashboardData {
  userName: string
  role: string
  yardName: string
  yardCity: string | null
  isYardEmpty: boolean
  todaySalesCount: number
  availablePartsCount: number
  intakesCount: number
  revenue: DashboardRevenue | null
  todayNewPartsCount: number | null
  lastActivity: LastActivity | null
  activeCarsCount: number | null
  outOfStockPartsCount: number | null
  customersCount: number | null
  totalBalanceUah: number | null
  teamMembersCount: number | null
  totalInvested: number | null
  totalRecouped: number | null
  carsInWork: number | null
  totalPartsSold: number | null
  myPartsToday: number | null
  lastMyActivity: LastActivity | null
}

export interface DashboardCounter {
  total: number
  delta: number
  series: number[]
}

export interface DashboardAnalyticsRevenue {
  totals: Record<string, number>
  trendPercent: number
  series: number[]
}

export interface DashboardTopPart {
  id: string
  name: string
  photoUrl: string | null
  revenueUsd: number
  salesCount: number
  salesSeries: number[]
}

export interface DashboardAnalytics {
  period: DashboardPeriod
  labels: string[]
  revenue: DashboardAnalyticsRevenue
  partsSold: DashboardCounter
  activeOrders: DashboardCounter
  topPart: DashboardTopPart | null
}

const DASHBOARD_CONTRACT_ERROR_MESSAGE = 'Invalid dashboard response'

export class DashboardContractError extends Error {
  constructor() {
    super(DASHBOARD_CONTRACT_ERROR_MESSAGE)
    this.name = 'DashboardContractError'
  }
}

type UnknownRecord = Record<string, unknown>

const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const reject = (): never => {
  throw new DashboardContractError()
}

const asRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : reject()

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : reject()

const asBoolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : reject()

const asFiniteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : reject()

const asArray = <T>(value: unknown, parseItem: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) reject()
  return (value as unknown[]).map(parseItem)
}

const asNullable = <T>(
  value: unknown,
  parseValue: (item: unknown) => T,
): T | null => (value == null ? null : parseValue(value))

const parseRevenueByCurrency = (value: unknown): RevenueByCurrency => {
  const record = asRecord(value)
  return {
    currency: asString(record['currency']),
    amount: asFiniteNumber(record['amount']),
  }
}

const parseDashboardRevenue = (value: unknown): DashboardRevenue => {
  const record = asRecord(value)
  return {
    today: asArray(record['today'], parseRevenueByCurrency),
    week: asArray(record['week'], parseRevenueByCurrency),
    month: asArray(record['month'], parseRevenueByCurrency),
  }
}

const parseLastActivity = (value: unknown): LastActivity => {
  const record = asRecord(value)
  const timestamp = asString(record['timestamp'])
  if (
    !DATE_TIME_PATTERN.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    reject()
  }

  return {
    type: asString(record['type']),
    userName: asString(record['userName']),
    timestamp,
  }
}

export const parseDashboardData = (value: unknown): DashboardData => {
  const record = asRecord(value)
  return {
    userName: asString(record['userName']),
    role: asString(record['role']),
    yardName: asString(record['yardName']),
    yardCity: asNullable(record['yardCity'], asString),
    isYardEmpty: asBoolean(record['isYardEmpty']),
    todaySalesCount: asFiniteNumber(record['todaySalesCount']),
    availablePartsCount: asFiniteNumber(record['availablePartsCount']),
    intakesCount: asFiniteNumber(record['intakesCount']),
    revenue: asNullable(record['revenue'], parseDashboardRevenue),
    todayNewPartsCount: asNullable(
      record['todayNewPartsCount'],
      asFiniteNumber,
    ),
    lastActivity: asNullable(record['lastActivity'], parseLastActivity),
    activeCarsCount: asNullable(record['activeCarsCount'], asFiniteNumber),
    outOfStockPartsCount: asNullable(
      record['outOfStockPartsCount'],
      asFiniteNumber,
    ),
    customersCount: asNullable(record['customersCount'], asFiniteNumber),
    totalBalanceUah: asNullable(record['totalBalanceUah'], asFiniteNumber),
    teamMembersCount: asNullable(record['teamMembersCount'], asFiniteNumber),
    totalInvested: asNullable(record['totalInvested'], asFiniteNumber),
    totalRecouped: asNullable(record['totalRecouped'], asFiniteNumber),
    carsInWork: asNullable(record['carsInWork'], asFiniteNumber),
    totalPartsSold: asNullable(record['totalPartsSold'], asFiniteNumber),
    myPartsToday: asNullable(record['myPartsToday'], asFiniteNumber),
    lastMyActivity: asNullable(record['lastMyActivity'], parseLastActivity),
  }
}

const parseCounter = (value: unknown): DashboardCounter => {
  const record = asRecord(value)
  return {
    total: asFiniteNumber(record['total']),
    delta: asFiniteNumber(record['delta']),
    series: asArray(record['series'], asFiniteNumber),
  }
}

const parseAnalyticsRevenue = (value: unknown): DashboardAnalyticsRevenue => {
  const record = asRecord(value)
  const totals = asRecord(record['totals'])
  return {
    totals: Object.fromEntries(
      Object.entries(totals).map(([currency, amount]) => [
        currency,
        asFiniteNumber(amount),
      ]),
    ),
    trendPercent: asFiniteNumber(record['trendPercent']),
    series: asArray(record['series'], asFiniteNumber),
  }
}

const parseTopPart = (value: unknown): DashboardTopPart => {
  const record = asRecord(value)
  return {
    id: asString(record['id']),
    name: asString(record['name']),
    photoUrl: asNullable(record['photoUrl'], asString),
    revenueUsd: asFiniteNumber(record['revenueUsd']),
    salesCount: asFiniteNumber(record['salesCount']),
    salesSeries: asArray(record['salesSeries'], asFiniteNumber),
  }
}

const ensureMatchingSeriesLength = (labels: string[], series: number[]) => {
  if (labels.length !== series.length) reject()
}

export const parseDashboardAnalytics = (value: unknown): DashboardAnalytics => {
  const record = asRecord(value)
  const period = asString(record['period'])
  if (!DASHBOARD_PERIODS.includes(period as DashboardPeriod)) reject()

  const labels = asArray(record['labels'], asString)
  const revenue = parseAnalyticsRevenue(record['revenue'])
  const partsSold = parseCounter(record['partsSold'])
  const activeOrders = parseCounter(record['activeOrders'])
  const topPart = asNullable(record['topPart'], parseTopPart)

  ensureMatchingSeriesLength(labels, revenue.series)
  ensureMatchingSeriesLength(labels, partsSold.series)
  ensureMatchingSeriesLength(labels, activeOrders.series)
  if (topPart) ensureMatchingSeriesLength(labels, topPart.salesSeries)

  return {
    period: period as DashboardPeriod,
    labels,
    revenue,
    partsSold,
    activeOrders,
    topPart,
  }
}
