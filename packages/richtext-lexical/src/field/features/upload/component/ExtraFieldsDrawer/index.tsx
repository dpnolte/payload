'use client'
import type { SanitizedCollectionConfig } from 'payload/types'

import { useModal } from '@faceless-ui/modal'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { getTranslation } from '@payloadcms/translations'
import {
  Drawer,
  Form,
  FormSubmit,
  RenderFields,
  buildStateFromSchema,
  fieldTypes,
  useAuth,
  useConfig,
  useDocumentInfo,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import { $getNodeByKey } from 'lexical'
import { sanitizeFields } from 'payload/config'
import { deepCopyObject } from 'payload/utilities'
import React, { useCallback, useEffect, useState } from 'react'

import type { ElementProps } from '..'
import type { UploadFeatureProps } from '../..'
import type { UploadData, UploadNode } from '../../nodes/UploadNode'

import { useEditorConfigContext } from '../../../../lexical/config/client/EditorConfigProvider'

/**
 * This handles the extra fields, e.g. captions or alt text, which are
 * potentially added to the upload feature.
 */
export const ExtraFieldsUploadDrawer: React.FC<
  ElementProps & {
    drawerSlug: string
    relatedCollection: SanitizedCollectionConfig
  }
> = (props) => {
  const {
    data: { fields, relationTo, value },
    drawerSlug,
    nodeKey,
    relatedCollection,
  } = props

  const [editor] = useLexicalComposerContext()
  const { editorConfig, field } = useEditorConfigContext()

  const { i18n, t } = useTranslation()
  const { code: locale } = useLocale()
  const { user } = useAuth()
  const { closeModal } = useModal()
  const { getDocPreferences } = useDocumentInfo()
  const [initialState, setInitialState] = useState({})
  const fieldSchemaUnsanitized = (
    editorConfig?.resolvedFeatureMap.get('upload')?.props as UploadFeatureProps
  )?.collections?.[relatedCollection.slug]?.fields
  const config = useConfig()

  // Sanitize custom fields here
  const validRelationships = config.collections.map((c) => c.slug) || []
  const fieldSchema = sanitizeFields({
    // TODO: fix this
    // @ts-expect-error-next-line
    config,
    fields: fieldSchemaUnsanitized,
    validRelationships,
  })

  const handleUpdateEditData = useCallback(
    (_, data) => {
      // Update lexical node (with key nodeKey) with new data
      editor.update(() => {
        const uploadNode: UploadNode | null = $getNodeByKey(nodeKey)
        if (uploadNode) {
          const newData: UploadData = {
            ...uploadNode.getData(),
            fields: data,
          }
          uploadNode.setData(newData)
        }
      })

      closeModal(drawerSlug)
    },
    [closeModal, editor, drawerSlug, nodeKey],
  )

  useEffect(() => {
    // Sanitize custom fields here
    const validRelationships = config.collections.map((c) => c.slug) || []
    const fieldSchema = sanitizeFields({
      // TODO: fix this
      // @ts-expect-error-next-line
      config,
      fields: fieldSchemaUnsanitized,
      validRelationships,
    })

    const awaitInitialState = async () => {
      const preferences = await getDocPreferences()
      const state = await buildStateFromSchema({
        data: deepCopyObject(fields || {}),
        fieldSchema,
        locale,
        operation: 'update',
        preferences,
        req,
      })
      setInitialState(state)
    }

    void awaitInitialState()
  }, [user, locale, t, getDocPreferences, fields, fieldSchemaUnsanitized, config])

  return (
    <Drawer
      slug={drawerSlug}
      title={t('general:editLabel', {
        label: getTranslation(relatedCollection.labels.singular, i18n),
      })}
    >
      <Form initialState={initialState} onSubmit={handleUpdateEditData}>
        [RenderFields]
        {/* <RenderFields fieldSchema={fieldSchema} fieldTypes={fieldTypes} readOnly={false} /> */}
        <FormSubmit>{t('fields:saveChanges')}</FormSubmit>
      </Form>
    </Drawer>
  )
}