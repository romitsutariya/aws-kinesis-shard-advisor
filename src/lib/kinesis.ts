import { md5Hex } from './md5'

export const md5ToBigInt = (md5hex: string) => {
  const normalized = md5hex.trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new Error('Invalid MD5 hex')
  return BigInt('0x' + normalized)
}

export const partitionKeyToHashKey = (partitionKey: string) => md5ToBigInt(md5Hex(partitionKey))

export const hashKeyToShardIndex = (hashKey: bigint, shardCount: number) => {
  if (!Number.isFinite(shardCount) || shardCount <= 0) throw new Error('Invalid shardCount')
  const n = BigInt(Math.floor(shardCount))
  const keyspace = 1n << 128n
  return Number((hashKey * n) / keyspace)
}

export const partitionKeyToShardIndex = (partitionKey: string, shardCount: number) => {
  const hashKey = partitionKeyToHashKey(partitionKey)
  return hashKeyToShardIndex(hashKey, shardCount)
}

export type ShardResult = {
  partitionKey: string
  md5hex: string
  hashKey: bigint
  shardIndex: number
}

export const analyzePartitionKeys = (partitionKeys: string[], shardCount: number): ShardResult[] => {
  return partitionKeys.map((k) => {
    const md5hex = md5Hex(k)
    const hashKey = md5ToBigInt(md5hex)
    const shardIndex = hashKeyToShardIndex(hashKey, shardCount)
    return { partitionKey: k, md5hex, hashKey, shardIndex }
  })
}

export type DistributionSummary = {
  shardCount: number
  totalKeys: number
  counts: number[]
  maxCount: number
  maxShard: number
  avg: number
  stddev: number
}

export const summarizeDistribution = (shardCount: number, shardIndexes: number[]): DistributionSummary => {
  const counts = Array.from({ length: shardCount }, () => 0)
  for (const idx of shardIndexes) {
    if (idx >= 0 && idx < shardCount) counts[idx]++
  }
  const totalKeys = shardIndexes.length
  const avg = totalKeys / shardCount
  let maxCount = -Infinity
  let maxShard = 0
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > maxCount) {
      maxCount = counts[i]
      maxShard = i
    }
  }
  let variance = 0
  for (let i = 0; i < counts.length; i++) {
    const d = counts[i] - avg
    variance += d * d
  }
  variance /= shardCount
  const stddev = Math.sqrt(variance)
  return { shardCount, totalKeys, counts, maxCount, maxShard, avg, stddev }
}
