import type { SanitizedCollectionConfig } from '../../../collections/config/types.js'
import type { SanitizedGlobalConfig } from '../../../globals/config/types.js'
import type { JsonObject, PayloadRequest, RequestContext } from '../../../types/index.js'

import { deepCopyObjectSimple } from '../../../utilities/deepCopyObject.js'
import { traverseFields } from './traverseFields.js'

type Args<T extends JsonObject> = {
  collection: null | SanitizedCollectionConfig
  context: RequestContext
  /**
   * The data before hooks
   */
  data: T
  /**
   * The data after hooks
   */
  doc: T
  global: null | SanitizedGlobalConfig
  operation: 'create' | 'update'
  previousDoc: T
  req: PayloadRequest
}

/**
 * This function is responsible for the following actions, in order:
 * - Execute field hooks
 */
export const afterChange = async <T extends JsonObject>({
  collection,
  context,
  data,
  doc: incomingDoc,
  global,
  operation,
  previousDoc,
  req,
}: Args<T>): Promise<T> => {
  const doc = deepCopyObjectSimple(incomingDoc)

  await traverseFields({
    collection,
    context,
    data,
    doc,
    fields: collection?.fields || global?.fields,
    global,
    operation,
    path: [],
    previousDoc,
    previousSiblingDoc: previousDoc,
    req,
    schemaPath: [],
    siblingData: data,
    siblingDoc: doc,
  })

  return doc
}
