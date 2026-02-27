import { useMemo, useState, type ChangeEvent } from 'react'
import { analyzePartitionKeys, summarizeDistribution, type ShardResult } from './lib/kinesis'
import { generateMany } from './lib/regexGen'

const parseKeys = (raw: string) =>
  raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

const fmtPct = (value: number) => `${(value * 100).toFixed(2)}%`

export default function App() {
  const [tab, setTab] = useState<'analyzer' | 'about'>('analyzer')
  const [shardCountRaw, setShardCountRaw] = useState('8')
  const [keysRaw, setKeysRaw] = useState('user-1\nuser-2\nuser-3\nuser-4\nuser-5')
  const [genPattern, setGenPattern] = useState('[A-Z0-9]{17}')
  const [genCountRaw, setGenCountRaw] = useState('1000')
  const [genError, setGenError] = useState<string | null>(null)

  const shardCount = Math.max(1, Math.floor(Number(shardCountRaw) || 1))
  const keys = useMemo(() => parseKeys(keysRaw), [keysRaw])

  const applyPreset = (preset: 'vin') => {
    if (preset === 'vin') {
      setGenPattern('[A-HJ-NPR-Z0-9]{17}')
    }
  }

  const onGenerate = () => {
    setGenError(null)
    const count = Math.max(0, Math.floor(Number(genCountRaw) || 0))
    try {
      const generated = generateMany(genPattern, count)
      setKeysRaw(generated.join('\n'))
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate keys')
    }
  }

  const results = useMemo((): ShardResult[] => {
    try {
      return analyzePartitionKeys(keys, shardCount)
    } catch {
      return [] as ShardResult[]
    }
  }, [keys, shardCount])

  const summary = useMemo(() => {
    if (results.length === 0) return null
    return summarizeDistribution(shardCount, results.map((r) => r.shardIndex))
  }, [results, shardCount])

  const maxCount = summary?.maxCount ?? 0

  return (
    <div className="page">
      <header className="header">
        <div className="title">Kinesis Shard Advisor</div>
        <div className="subtitle">
          AWS Kinesis maps a partition key by computing <b>MD5</b> and placing the 128-bit hash into shard hash-key
          ranges. This tool approximates shard selection using an even split across <b>N shards</b>.
        </div>

        <div className="tabs" role="tablist" aria-label="Kinesis Shard Advisor tabs">
          <button
            type="button"
            className={`tab ${tab === 'analyzer' ? 'active' : ''}`}
            onClick={() => setTab('analyzer')}
            role="tab"
            aria-selected={tab === 'analyzer'}
          >
            Analyzer
          </button>
          <button
            type="button"
            className={`tab ${tab === 'about' ? 'active' : ''}`}
            onClick={() => setTab('about')}
            role="tab"
            aria-selected={tab === 'about'}
          >
            About
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'analyzer' ? (
          <>
            <div className="grid">
              <section className="card">
                <div className="cardTitle">Inputs</div>
                <div className="form">
                  <label className="field">
                    <div className="label">Shard count</div>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={shardCountRaw}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setShardCountRaw(e.target.value)}
                    />
                  </label>

                  <div className="field">
                    <div className="label">Generate random keys (regex-like)</div>
                    <div className="row">
                      <input
                        className="input"
                        value={genPattern}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setGenPattern(e.target.value)}
                        placeholder="e.g. [A-Z0-9]{17}"
                      />
                      <input
                        className="input"
                        inputMode="numeric"
                        value={genCountRaw}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setGenCountRaw(e.target.value)}
                        placeholder="count"
                      />
                    </div>
                    <div className="actions">
                      <button className="button" type="button" onClick={() => applyPreset('vin')}>
                        preset
                      </button>
                      <button className="button primary" type="button" onClick={onGenerate}>
                        Generate → overwrite textarea
                      </button>
                    </div>
                    {genError ? <div className="error">{genError}</div> : null}
                    <div className="hint">
                      Supported: literals, <b>[A-Z0-9]</b>, ranges, escapes <b>\\d</b>/<b>\\w</b>, and quantifiers
                      <b>?</b>/<b>*</b>/<b>+</b>/<b>{'{n}'}</b>/<b>{'{n,m}'}</b>. Not supported: groups/alternation.
                    </div>
                  </div>

                  <label className="field">
                    <div className="label">Partition keys (one per line)</div>
                    <textarea
                      className="textarea"
                      value={keysRaw}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setKeysRaw(e.target.value)}
                      rows={10}
                    />
                  </label>

                  <div className="hint">
                    Keys: <b>{keys.length}</b>. Shards: <b>{shardCount}</b>.
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="cardTitle">Distribution</div>
                {!summary ? (
                  <div className="cardBody">Add at least one partition key.</div>
                ) : (
                  <>
                    <div className="metrics">
                      <div className="metric">
                        <div className="metricLabel">Total keys</div>
                        <div className="metricValue">{summary.totalKeys}</div>
                      </div>
                      <div className="metric">
                        <div className="metricLabel">Avg / shard</div>
                        <div className="metricValue">{summary.avg.toFixed(2)}</div>
                      </div>
                      <div className="metric">
                        <div className="metricLabel">Max shard</div>
                        <div className="metricValue">
                          #{summary.maxShard} ({summary.maxCount}, {fmtPct(summary.maxCount / summary.totalKeys)})
                        </div>
                      </div>
                      <div className="metric">
                        <div className="metricLabel">Std dev</div>
                        <div className="metricValue">{summary.stddev.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="bars">
                      {summary.counts.map((c: number, idx: number) => {
                        const pct = summary.totalKeys === 0 ? 0 : c / summary.totalKeys
                        const w = maxCount === 0 ? 0 : (c / maxCount) * 100
                        return (
                          <div key={idx} className="barRow">
                            <div className="barLabel">#{idx}</div>
                            <div className="barTrack">
                              <div className="barFill" style={{ width: `${w}%` }} />
                            </div>
                            <div className="barValue">
                              {c} ({fmtPct(pct)})
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </section>
            </div>

            <section className="card" style={{ marginTop: 16 }}>
              <div className="cardTitle">Key → Shard mapping</div>
              {results.length === 0 ? (
                <div className="cardBody">No results yet.</div>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Partition key</th>
                        <th>MD5 (hex)</th>
                        <th>Shard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i: number) => (
                        <tr key={i}>
                          <td className="mono">{r.partitionKey}</td>
                          <td className="mono">{r.md5hex}</td>
                          <td>#{r.shardIndex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="card">
            <div className="cardTitle">About</div>
            <div className="cardBody">
              <div style={{ maxWidth: 900 }}>
                <p>
                  This is a single-page tool to help you validate whether your chosen <b>Kinesis partition key</b>{' '}
                  strategy could lead to <b>hot shards</b>.
                </p>
                <p>
                  Kinesis computes <b>MD5(partitionKey)</b> to a 128-bit value and routes records into shard hash-key
                  ranges. In this app we approximate shard selection by evenly splitting the full 128-bit keyspace
                  across the shard count.
                </p>
                <p>
                  Use it by pasting real partition keys, or generating synthetic keys (example: VIN-like IDs) to
                  simulate a larger population and inspect the distribution.
                </p>
                <p>
                  Please add a note stating that this is a UI-only project and we do not collect any information. 
                  All data remains on your local machine and will be lost once you close the browser tab.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
