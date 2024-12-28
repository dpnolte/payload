import type { Payload } from 'payload'

import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { fileURLToPath } from 'node:url'
import path from 'path'

import { buildConfigWithDefaults } from '../buildConfigWithDefaults.js'
import { devUser } from '../credentials.js'
import { Fruits, Seeds } from './collections/Fruits.js'
import { MediaCollection } from './collections/Media/index.js'
import { MenuGlobal } from './globals/Menu/index.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfigWithDefaults({
  // ...extend config here
  collections: [Fruits, Seeds, MediaCollection],
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  editor: lexicalEditor({}),
  globals: [
    // ...add more globals here
    MenuGlobal,
  ],
  onInit: async (payload) => {
    await payload.create({
      collection: 'users',
      data: {
        email: devUser.email,
        password: devUser.password,
      },
    })

    const seedsAppleA = await createSeeds(payload, 'Seeds for Apple A')
    const seeesAppleB = await createSeeds(payload, 'Seeds for Apple B')
    const seedsPearC = await createSeeds(payload, 'Seeds for Pear C')

    await payload.create({
      collection: 'fruits',
      data: {
        blocks: [
          {
            blockName: 'Apple A With Conditional fields',
            blockType: 'apples',
            AppleKind: 'Apple With Conditional fields',
            showConditionalApple: true,
            conditionalFields: {
              ConditionalFieldApple: 'Conditiional field apple A',
            },
            seedApple: seedsAppleA,
          },
          {
            blockName: 'Apple B - without conditional field',
            blockType: 'apples',
            AppleKind: 'Apple without conditional fields',
            showConditionalApple: false,
            seedApple: seeesAppleB,
          },
          {
            blockName: 'Pear C',
            blockType: 'pears',
            PearType: 'Pear C',
            seedPear: seedsPearC,
          },
          // Add an extra dummy block so that we have a larger droppable area for the third block
          {
            blockName: 'Dummy last block to make dragging easier',
            blockType: 'pears',
            PearType: 'Dummy pear',
            seedPear: [],
          },
        ],
      },
    })
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})

async function createSeeds(payload: Payload, namePrefix: string) {
  return [
    await payload.create({
      collection: 'seeds',
      data: {
        name: `${namePrefix} - 1`,
      },
    }),
    await payload.create({
      collection: 'seeds',
      data: {
        name: `${namePrefix} - 2`,
      },
    }),
  ]
}
