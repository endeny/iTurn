import * as qimaoJh from './qimaoJh.ts'
import * as shuqiJh from './shuqiJh.ts'
import * as fanqieFqgo from './fanqieFqgo.ts'
import * as guangyu from './guangyu.ts'
import * as fanqieFourInOne from './fanqieFourInOne.ts'
import * as qimaoMingyue from './qimaoMingyue.ts'
import * as xiFanqie from './xiFanqie.ts'
import * as fanqieMingyue from './fanqieMingyue.ts'
import * as my69Mingyue from './my69Mingyue.ts'
import type { SourceManifest, SourceModule } from '@source/sdk'

export type RuntimeSourceModule = SourceModule & { manifest: SourceManifest }

export const sourceModules: RuntimeSourceModule[] = [
  qimaoJh,
  shuqiJh,
  fanqieFqgo,
  guangyu,
  fanqieFourInOne,
  qimaoMingyue,
  xiFanqie,
  fanqieMingyue,
  my69Mingyue,
] as RuntimeSourceModule[]

export const sourceMap = new Map(sourceModules.map((source) => [source.manifest.id, source]))

export function getSourceModule(sourceId?: string): RuntimeSourceModule {
  if (!sourceId) return sourceModules[0]
  const source = sourceMap.get(sourceId)
  if (!source) throw new Error(`Source not found: ${sourceId}`)
  return source
}
