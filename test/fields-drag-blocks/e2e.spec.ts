import type { BrowserContext, Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

import { ensureCompilationIsDone, initPageConsoleErrorCatch } from '../helpers.js'
import { AdminUrlUtil } from '../helpers/adminUrlUtil.js'
import { initPayloadE2ENoConfig } from '../helpers/initPayloadE2ENoConfig.js'
import { TEST_TIMEOUT_LONG } from '../playwright.config.js'
import { Config, Fruit, Seed } from './payload-types.js'
import { PayloadTestSDK } from 'helpers/sdk/index.js'

type Block = NonNullable<NonNullable<Fruit['blocks']>[0]>

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

test.describe('Fields drag blocks', () => {
  let page: Page
  let url: AdminUrlUtil
  let fruit: Fruit
  let blockAppleA: Block
  let blockAppleB: Block
  let blockPearC: Block
  let seedsAppleA: Seed[]
  let seeesAppleB: Seed[]
  let seedsPearC: Seed[]
  let context: BrowserContext
  let serverURL: string
  let payload: PayloadTestSDK<Config>

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(TEST_TIMEOUT_LONG)
    ;({ payload, serverURL } = await initPayloadE2ENoConfig<Config>({ dirname }))
    url = new AdminUrlUtil(serverURL, 'fruits')

    context = await browser.newContext()
    page = await context.newPage()
    await page.setViewportSize({ width: 1270, height: 960 })

    initPageConsoleErrorCatch(page)
    await ensureCompilationIsDone({ page, serverURL })

    seedsAppleA = await createSeeds(payload as any, 'Seeds for Apple A')
    seeesAppleB = await createSeeds(payload as any, 'Seeds for Apple B')
    seedsPearC = await createSeeds(payload as any, 'Seeds for Pear C')

    fruit = await payload.create({
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
    blockAppleA = fruit.blocks![0] as any
    blockAppleB = fruit.blocks![1] as any
    blockPearC = fruit.blocks![2] as any
  })

  test('should be able to drag blocks around on 3G without losing values', async ({}, testInfo) => {
    testInfo.setTimeout(TEST_TIMEOUT_LONG)
    await page.goto(`${url.serverURL}/admin/collections/fruits/${fruit.id}`)

    // Wait for the blocks to be loaded
    await page.waitForSelector('#field-blocks')

    // Add zoom style so that we can see all blocks when running in headed mode
    await page.evaluate(() => {
      const el = document.getElementsByClassName('collection-edit__form')[0] as HTMLElement
      el.style.zoom = '0.5'
    })

    const blocksIn = [blockAppleA, blockAppleB, blockPearC]

    // Expand all blocks first
    await expandAllBlocks(page, blocksIn)

    const { dragAndDropRandomBlock } = await createRandomBlockDragger(page, blocksIn)

    // Emulate 3g network conditions
    const cdpSession = await context.newCDPSession(page)
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (750 * 1024) / 8,
      uploadThroughput: (250 * 1024) / 8,
      latency: 100,
      connectionType: 'cellular3g',
    })

    let blocksOut: Block[] = []
    for (let i = 0; i < 100; i++) {
      blocksOut = await dragAndDropRandomBlock()
      if (i % 10 === 0) {
        await verifyBlockFieldValues(page, blocksOut)
      }
    }

    // Disable 3G network emulation
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: -1,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
    // Await autosave
    await page
      .waitForResponse(
        (resp) => {
          const url = new URL(resp.url())
          if (
            url.pathname.includes(`/api/fruits/${fruit.id}`) &&
            url.searchParams.get('autosave') === 'true'
          ) {
            expect(resp.status()).toBe(200)
            return true
          }
          return false
        },
        { timeout: 9_000 },
      )
      .catch((err) => {
        /*ignore already autosaved */
      })
    await verifyBlockFieldValues(page, blocksOut)

    // Verify that all changes are correctly stored
    await page.reload()
    await page.evaluate(() => {
      const el = document.getElementsByClassName('collection-edit__form')[0] as HTMLElement
      el.style.zoom = '0.5'
    })
    await expandAllBlocks(page, blocksOut)
    await verifyBlockFieldValues(page, blocksOut)
  })
})

async function createSeeds(payload: PayloadTestSDK<Config>, namePrefix: string) {
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

async function expandAllBlocks(page: Page, blocks: Block[]) {
  await page.locator('button:text("Show All")').click()
  await expect(page.locator(`#field-blocks #blocks-row-${blocks.length - 1}`)).toBeVisible()
}

async function createRandomBlockDragger(page: Page, blocksInput: Block[]) {
  const blocks = [...blocksInput]

  const blockBox1 = await page.locator('#blocks-row-0').boundingBox()
  const draggableIconLocator = page.locator('#field-blocks .collapsible__drag').first()
  const draggableIconBox = await draggableIconLocator.boundingBox()
  const draggableIconOffsetX = draggableIconBox!.x + draggableIconBox!.width * 0.5 - blockBox1!.x

  async function dragAndDropRandomBlock() {
    const sourceBlockIndex = 1
    const possibleIndices = [0, 2]
    const targetBlockIndex = possibleIndices[Math.floor(Math.random() * possibleIndices.length)]

    const sourceDragIconLocator = page.locator(`#blocks-row-${sourceBlockIndex} .collapsible__drag`)
    const targetBlockBox = await page.locator(`#blocks-row-${targetBlockIndex}`).boundingBox()
    if (!targetBlockBox) {
      throw new Error(`Target block box ${targetBlockIndex} not found`)
    }

    // Calculate target position based on where we want to insert the block
    const target = {
      x: targetBlockBox.x + draggableIconOffsetX,
      y:
        sourceBlockIndex < targetBlockIndex
          ? targetBlockBox.y + 20 // Drop after target
          : targetBlockBox.y - 20, // Drop before target
    }

    await sourceDragIconLocator.hover()
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 2 })
    await page.mouse.up()

    // Update blocks array to match the actual DOM order
    const movedBlock = blocks[sourceBlockIndex]
    blocks.splice(sourceBlockIndex, 1)
    blocks.splice(targetBlockIndex, 0, movedBlock)

    return blocks
  }

  return {
    dragAndDropRandomBlock,
  }
}

async function verifyBlockFieldValues(page: Page, blocksOut: Block[]) {
  for (let blockIndex = 0; blockIndex < blocksOut.length; blockIndex++) {
    const block = blocksOut[blockIndex] as Block
    const namePrefix = `blocks.${blockIndex}`

    if (block.blockType === 'apples') {
      // Verify apple kind
      await expect(page.locator(`input[name="${namePrefix}.AppleKind"]`)).toBeVisible()
      await expect(page.locator(`input[name="${namePrefix}.AppleKind"]`)).toHaveValue(
        block.AppleKind ?? '',
      )
      // Verify conditional field
      if (block.showConditionalApple) {
        await expect(
          page.locator(`input[name="${namePrefix}.conditionalFields.ConditionalFieldApple"]`),
        ).toBeVisible()
        await expect(
          page.locator(`input[name="${namePrefix}.conditionalFields.ConditionalFieldApple"]`),
        ).toHaveValue(block.conditionalFields?.ConditionalFieldApple ?? '')
      }
      // Verify seed relationships
      const seedsSelector = `#field-blocks__${blockIndex}__seedApple div[class="relationship--multi-value-label__text"]`
      await expect(page.locator(seedsSelector).last()).toBeVisible()
      const seedNames = await page.locator(seedsSelector).allInnerTexts()

      const seedLenth = block.seedApple?.length ?? 0
      for (let seedIndex = 0; seedIndex < seedLenth; seedIndex++) {
        const seed = block.seedApple![seedIndex] as Seed
        expect(seedNames[seedIndex]).toEqual(seed.name)
      }
    } else if (block.blockType === 'pears') {
      // Verify pear type
      await expect(page.locator(`input[name="${namePrefix}.PearType"]`)).toBeVisible()
      await expect(page.locator(`input[name="${namePrefix}.PearType"]`)).toHaveValue(
        block.PearType ?? '',
      )
      // Verify seed relationships
      const seedsSelector = `#field-blocks__${blockIndex}__seedPear div[class="relationship--multi-value-label__text"]`
      await expect(page.locator(seedsSelector).last()).toBeVisible()
      const seedNames = await page.locator(seedsSelector).allInnerTexts()

      const seedLenth = block.seedPear?.length ?? 0
      for (let seedIndex = 0; seedIndex < seedLenth; seedIndex++) {
        const seed = block.seedPear![seedIndex] as Seed
        expect(seedNames[seedIndex]).toEqual(seed.name)
      }
    }
  }
}
