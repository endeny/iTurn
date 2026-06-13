import qimaoJh from './sources/qimaoJh.ts'
import shuqiJh from './sources/shuqiJh.ts'
import fanqieFqgo from './sources/fanqieFqgo.ts'
import guangyu from './sources/guangyu.ts'
import fanqieFourInOne from './sources/fanqieFourInOne.ts'
import qimaoMingyue from './sources/qimaoMingyue.ts'
import xiFanqie from './sources/xiFanqie.ts'
import fanqieMingyue from './sources/fanqieMingyue.ts'
import my69Mingyue from './sources/my69Mingyue.ts'
import type { SourceManifest } from '@source/sdk'

export type RuntimeSourceManifest = SourceManifest

export const sourceManifests: RuntimeSourceManifest[] = [
  qimaoJh,
  shuqiJh,
  fanqieFqgo,
  guangyu,
  fanqieFourInOne,
  qimaoMingyue,
  xiFanqie,
  fanqieMingyue,
  my69Mingyue,
] as RuntimeSourceManifest[]

export const sourceMap = new Map(sourceManifests.map((source) => [source.id, source]))

export function getSourceManifest(sourceId?: string): RuntimeSourceManifest {
  if (!sourceId) return sourceManifests[0]
  const source = sourceMap.get(sourceId)
  if (!source) throw new Error(`Source not found: ${sourceId}`)
  return source
}
