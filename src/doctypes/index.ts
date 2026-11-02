import { screenplay } from './screenplay';
import { stageplay } from './stageplay';
import type { DocTypeDef } from './types';

export const docTypes: Record<string, DocTypeDef> = { screenplay, stageplay };
export const docTypeList = Object.values(docTypes);
export function getDocType(id: string): DocTypeDef {
  return docTypes[id] ?? screenplay;
}
export * from './types';
